<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { displayToIndex } from '../lib/grid.js'
import { createCanvasRenderer } from '../lib/canvas-renderer.js'
import SymmetryPreview from './SymmetryPreview.vue'
import { sliceGuidePath } from '../lib/symmetry.js'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  values: { type: Float64Array, required: true },
  size: { type: Number, required: true },
  revision: { type: Number, required: true },
  changes: { type: Object, required: true },
  peak: { type: Number, default: 1 },
  range: { type: Object, required: true },
  symmetry: { type: Object, required: true },
  domain: { type: String, required: true },
  component: { type: String, required: true },
  brush: { type: Object, required: true },
  brushValue: { type: Number, default: 1 },
  tool: { type: String, default: 'paint' },
  logarithmic: Boolean,
  disabled: Boolean,
})
const emit = defineEmits(['paint', 'stroke-start', 'stroke-end', 'rotate', 'adjust-size', 'clear'])
const canvas = ref(null)
const pointer = ref(null)
const drawing = ref(false)
const localErase = ref(false)
const strokeOrigin = ref(null)
let previous = null
let pointerId = null
let frame = null
let renderer = null
const forceCPU = ref(false)
const rendererBackend = ref('')
let fullRender = true
let wheelDelta = 0
let sizeWheelDelta = 0

const label = computed(() => `${props.domain === 'spatial' ? 'Spatial' : 'Frequency'} domain, ${props.component === 'real' ? 'real' : 'imaginary'} component`)
const origin = computed(() => Math.floor(props.size / 2))
const sliceGuides = computed(() => sliceGuidePath(props.size, props.symmetry))
const sample = computed(() => {
  if (!pointer.value) return null
  // Revision makes typed-array edits visible to Vue's computed cache.
  void props.revision
  return props.values[displayToIndex(pointer.value.x, pointer.value.y, props.size)]
})
const formattedSample = computed(() => {
  if (sample.value === null) return ''
  return Math.abs(sample.value) > 0 && Math.abs(sample.value) < 0.001
    ? sample.value.toExponential(2)
    : sample.value.toFixed(3)
})

function formatRangeValue(value) {
  if (value === 0) return '0'
  if (Math.abs(value) < 0.001 || Math.abs(value) >= 10000) return value.toExponential(1)
  return String(Number(value.toPrecision(4)))
}

function render() {
  frame = null
  if (!canvas.value) return
  // Read reactive props once, outside the pixel loop.
  const { size, values, peak, logarithmic, changes } = props
  if (!renderer) {
    try {
      renderer = createCanvasRenderer(canvas.value, {
        gpu: !forceCPU.value,
        onRestore: () => { fullRender = true; scheduleRender() },
        onFailure: useCPU,
      })
      rendererBackend.value = renderer.backend
      fullRender = true
    } catch {
      useCPU()
      return
    }
  }
  const dirty = changes.take()
  if (!fullRender && !dirty) return
  const bounds = fullRender ? null : dirty
  fullRender = false
  renderer.render(values, size, peak, logarithmic, bounds)
}

function useCPU() {
  if (drawing.value) finishStroke({ type: 'pointercancel', pointerId, pointerType: 'mouse' })
  renderer?.dispose()
  renderer = null
  fullRender = true
  if (!forceCPU.value) forceCPU.value = true
}

function scheduleRender() {
  if (frame === null) frame = requestAnimationFrame(render)
}

function position(event) {
  const rect = canvas.value.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(props.size - 1, Math.floor(((event.clientX - rect.left) / rect.width) * props.size))),
    y: Math.max(0, Math.min(props.size - 1, Math.floor(((event.clientY - rect.top) / rect.height) * props.size))),
  }
}

function startStroke(event) {
  if (props.disabled || drawing.value || (event.button !== 0 && event.button !== 2)) return
  event.preventDefault()
  canvas.value.focus({ preventScroll: true })
  pointerId = event.pointerId
  canvas.value.setPointerCapture(pointerId)
  pointer.value = position(event)
  previous = pointer.value
  strokeOrigin.value = { ...pointer.value }
  localErase.value = event.button === 2
  drawing.value = true
  emit('stroke-start')
  emit('paint', { from: previous, to: previous, origin: strokeOrigin.value, erase: localErase.value })
}

function movePointer(event) {
  if (drawing.value && event.pointerId !== pointerId) return
  pointer.value = position(event)
  if (!drawing.value) return
  // Full-canvas fields remain anchored to the initial press outside Wipe.
  if ((['wave', 'gaussian'].includes(props.brush.shape) && props.brush.mode !== 'wipe') || (pointer.value.x === previous.x && pointer.value.y === previous.y)) return
  emit('paint', { from: previous, to: pointer.value, origin: strokeOrigin.value, erase: localErase.value })
  previous = pointer.value
}

function brushWheel(event) {
  if (props.disabled || event.metaKey || (!event.ctrlKey && ['dot', 'gaussian'].includes(props.brush.shape))) return
  const delta = event.deltaY || event.deltaX
  if (!delta) return
  event.preventDefault()
  if (drawing.value && props.brush.mode !== 'wipe') return
  pointer.value = position(event)
  const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? canvas.value.clientHeight : 1
  if (event.ctrlKey) sizeWheelDelta += delta * unit
  else wheelDelta += delta * unit
  const steps = Math.trunc((event.ctrlKey ? sizeWheelDelta : wheelDelta) / 100)
  if (steps) {
    if (event.ctrlKey) {
      sizeWheelDelta -= steps * 100
      emit('adjust-size', -steps)
    } else {
      wheelDelta -= steps * 100
      emit('rotate', steps * 5)
    }
  }
}

function finishStroke(event) {
  if (!drawing.value || event.pointerId !== pointerId) return
  if (event.type === 'pointerup') movePointer(event)
  drawing.value = false
  if (canvas.value.hasPointerCapture(pointerId)) canvas.value.releasePointerCapture(pointerId)
  pointerId = null
  previous = null
  strokeOrigin.value = null
  localErase.value = false
  if (event.pointerType !== 'mouse') pointer.value = null
  emit('stroke-end')
}

function keyboardStamp(event) {
  if (props.disabled || drawing.value || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(event.key)) return
  event.preventDefault()
  const current = pointer.value || { x: origin.value, y: origin.value }
  const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
  const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  pointer.value = {
    x: Math.max(0, Math.min(props.size - 1, current.x + dx)),
    y: Math.max(0, Math.min(props.size - 1, current.y + dy)),
  }
  if (event.key === ' ' || event.key === 'Enter') {
    emit('stroke-start')
    emit('paint', { from: pointer.value, to: pointer.value, origin: pointer.value, erase: false })
    emit('stroke-end')
  }
}

watch(() => props.size, () => { pointer.value = null })
watch(() => props.brush.shape, () => { wheelDelta = 0; sizeWheelDelta = 0 })
watch(() => [props.brush.angle, props.brush.size, props.brush.wavelength, props.brush.sigma], () => {
  if (drawing.value && props.brush.mode === 'wipe' && pointer.value) {
    emit('paint', { from: pointer.value, to: pointer.value, origin: pointer.value, erase: localErase.value })
  }
})
watch(() => props.revision, scheduleRender)
watch(canvas, value => { if (value) scheduleRender() })
watch(() => [props.values, props.size, props.peak, props.logarithmic], () => {
  fullRender = true
  scheduleRender()
})
onMounted(scheduleRender)
onBeforeUnmount(() => {
  if (frame !== null) cancelAnimationFrame(frame)
  renderer?.dispose()
})
</script>

<template>
  <article class="grid-card" :class="{ 'is-drawing': drawing }">
    <header class="grid-card-header">
      <span class="component-label">{{ component === 'real' ? 'Real' : 'Imaginary' }}</span>
      <button class="canvas-clear-button" type="button" :aria-label="`Clear ${label}`" :title="`Clear ${domain === 'spatial' ? 'drawing' : 'frequencies'} · ${component}`" :disabled="disabled || drawing" @click="emit('clear')"><AppIcon name="trash" :size="15" /></button>
    </header>
    <div class="canvas-surround">
      <div class="canvas-stage" :class="{ 'is-disabled': disabled }">
        <canvas :key="forceCPU ? 'cpu' : 'gpu'" ref="canvas" :data-renderer="rendererBackend" :aria-label="label" aria-describedby="canvas-instructions" tabindex="0" :aria-disabled="disabled"
          @pointerdown="startStroke" @pointermove="movePointer" @pointerup="finishStroke" @pointercancel="finishStroke" @lostpointercapture="finishStroke"
          @pointerleave="!drawing && (pointer = null)" @contextmenu.prevent @keydown="keyboardStamp" @wheel="brushWheel"
        >{{ label }}. Use arrow keys to move the brush, then Enter or Space to paint.</canvas>
        <svg v-if="symmetry.enabled" class="symmetry-guides pointer-events-none absolute inset-0 block size-full" :viewBox="`0 0 ${size} ${size}`" aria-hidden="true"><path :d="sliceGuides" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" /></svg>
        <div class="canvas-axis axis-horizontal" aria-hidden="true"></div>
        <div class="canvas-axis axis-vertical" aria-hidden="true"></div>
        <div class="canvas-origin" aria-hidden="true"></div>
        <SymmetryPreview v-if="pointer && !disabled" :brush="brush" :size="size" :center="pointer" :origin="brush.mode === 'wipe' ? pointer : strokeOrigin || pointer" :value="brushValue" :erase="tool === 'erase' || localErase" :symmetry="symmetry" />
        <span v-if="size > 1" class="axis-label axis-x-label axis-min" aria-hidden="true">−{{ origin }}</span>
        <span class="axis-label axis-x-label axis-zero" aria-hidden="true">0</span>
        <span v-if="size > 2" class="axis-label axis-x-label axis-max" aria-hidden="true">{{ size - origin - 1 }}</span>
        <span v-if="size > 1" class="axis-label axis-y-label axis-y-min" aria-hidden="true">−{{ origin }}</span>
        <span class="axis-label axis-y-label axis-y-zero" aria-hidden="true">0</span>
        <span v-if="size > 2" class="axis-label axis-y-label axis-y-max" aria-hidden="true">{{ size - origin - 1 }}</span>
      </div>
    </div>
    <footer class="grid-card-footer">
      <div class="canvas-range" aria-label="Canvas value range">
        <span>Min <span class="range-value" :title="String(range.min)" :data-value="range.min">{{ formatRangeValue(range.min) }}</span></span>
        <span>Max <span class="range-value" :title="String(range.max)" :data-value="range.max">{{ formatRangeValue(range.max) }}</span></span>
      </div>
      <span v-if="pointer" class="sample-readout">{{ pointer.x - origin }}, {{ pointer.y - origin }} <span class="readout-divider">/</span> {{ formattedSample }}</span>
      <span v-else class="sample-readout">{{ size }} × {{ size }}</span>
    </footer>
  </article>
</template>
