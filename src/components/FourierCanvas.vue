<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { displayToIndex } from '../lib/grid.js'
import { canvasPoint, snapManipulationDelta } from '../lib/pointer.js'
import { createCanvasRenderer } from '../lib/canvas-renderer.js'
import SymmetryPreview from './SymmetryPreview.vue'
import RepeatPreview from './RepeatPreview.vue'
import BrushPreview from './BrushPreview.vue'
import ManipulationGuides from './ManipulationGuides.vue'
import StretchPreview from './StretchPreview.vue'
import { stretchFromDrag } from '../lib/stretch.js'
import { isFieldBrush, isCanvasBrush } from '../lib/brush-modes.js'
import { isRadialBrush } from '../lib/radial.js'
import { repeatGuidePath } from '../lib/repeat.js'
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
  repeat: { type: Object, required: true },
  polar: Boolean,
  clipboardSize: { type: Number, default: 0 },
  copied: Boolean,
  linkedEditing: Boolean,
  domain: { type: String, required: true },
  component: { type: String, required: true },
  brush: { type: Object, required: true },
  brushValue: { type: Number, default: 1 },
  tool: { type: String, default: 'paint' },
  logarithmic: Boolean,
  hideGridLines: Boolean,
  snapToGrid: Boolean,
  lockManipulationToGrid: Boolean,
  disabled: Boolean,
})
const emit = defineEmits(['paint', 'stroke-start', 'stroke-end', 'rotate', 'adjust-size', 'adjust-value', 'adjust-phase', 'clear', 'copy', 'mirror', 'paste', 'invert', 'toggle-link', 'canvas-rotation-start', 'canvas-rotate', 'canvas-pan-start', 'canvas-pan', 'canvas-stretch-start', 'canvas-stretch'])
const canvas = ref(null)
const pointer = ref(null)
const snappedAxes = ref({ x: false, y: false })
const drawing = ref(false)
const localErase = ref(false)
const strokeOrigin = ref(null)
const manipulationGuide = ref(null)
let previous = null
let lastPointer = null
let pointerId = null
let rotationStartY = 0, rotationHeight = 1
let panStart = null
const stretchOffset = ref({ x: 0, y: 0 })
let frame = null
let renderer = null
const forceCPU = ref(false)
const rendererBackend = ref('')
let fullRender = true
let wheelDelta = 0
let sizeWheelDelta = 0
let valueWheelDelta = 0

const componentName = computed(() => props.polar ? (props.component === 'real' ? 'Magnitude' : 'Phase (rad)') : (props.component === 'real' ? 'Real' : 'Imaginary'))
const label = computed(() => `${props.domain === 'spatial' ? 'Spatial' : 'Frequency'} domain, ${componentName.value.toLowerCase()} component`)
const rotationBrush = computed(() => props.brush.shape === 'rotation')
const panBrush = computed(() => props.brush.shape === 'pan')
const stretchBrush = computed(() => props.brush.shape === 'stretch')
const canvasBrush = computed(() => isCanvasBrush(props.brush.shape))
const origin = computed(() => Math.floor(props.size / 2))
const snapMarker = computed(() => {
  if (!props.brush.shape || !props.snapToGrid || props.brush.shape === 'fill' || canvasBrush.value || props.disabled || !pointer.value) return null
  const { x, y } = snappedAxes.value
  if (!x && !y) return null
  return {
    x, y,
    left: `${y ? 50 : (pointer.value.x + .5) / props.size * 100}%`,
    top: `${x ? 50 : (pointer.value.y + .5) / props.size * 100}%`,
  }
})
const sliceGuides = computed(() => sliceGuidePath(props.size, props.symmetry))
const repeating = computed(() => props.repeat.columns > 1 || props.repeat.rows > 1)
const repeatGuides = computed(() => repeatGuidePath(props.size, props.repeat))
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

function flashHeaderAction(event) {
  const button = event.target.closest('button')
  if (!button || button.disabled) return
  for (const animation of button.getAnimations()) animation.cancel()
  const tint = button.classList.contains('canvas-clear-button') ? '240, 176, 176' : '170, 255, 222'
  button.animate([
    { backgroundColor: `rgba(${tint}, .24)`, boxShadow: `0 0 0 1px rgba(${tint}, .8), 0 0 14px rgba(${tint}, .7)`, filter: 'brightness(1.7)' },
    { boxShadow: `0 0 0 1px rgba(${tint}, 0), 0 0 2px rgba(${tint}, 0)`, filter: 'brightness(1)' },
  ], { duration: 650, easing: 'ease-out' })
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
  lastPointer = { clientX: event.clientX, clientY: event.clientY }
  const rect = canvas.value.getBoundingClientRect()
  snappedAxes.value = {
    x: Math.abs(event.clientY - rect.top - rect.height / 2) <= 8,
    y: Math.abs(event.clientX - rect.left - rect.width / 2) <= 8,
  }
  return canvasPoint(event.clientX, event.clientY, rect, props.size, props.snapToGrid && !canvasBrush.value)
}

function startStroke(event) {
  if (!props.brush.shape || props.disabled || drawing.value || (event.button !== 0 && event.button !== 2)) return
  if (canvasBrush.value && event.button !== 0) return
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
  if (canvasBrush.value && props.lockManipulationToGrid) {
    const rect = canvas.value.getBoundingClientRect()
    manipulationGuide.value = {
      anchor: { x: (event.clientX - rect.left) * 100 / rect.width, y: (event.clientY - rect.top) * 100 / rect.height },
      clientX: event.clientX, clientY: event.clientY, dx: 0, dy: 0,
    }
  }
  if (panBrush.value || stretchBrush.value) {
    const rect = canvas.value.getBoundingClientRect()
    panStart = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height }
    if (stretchBrush.value) {
      stretchOffset.value = { x: 0, y: 0 }
      emit('canvas-stretch-start')
    } else emit('canvas-pan-start')
    return
  }
  if (rotationBrush.value) {
    rotationStartY = event.clientY
    rotationHeight = canvas.value.getBoundingClientRect().height
    emit('canvas-rotation-start')
    return
  }
  emit('paint', { from: previous, to: previous, origin: strokeOrigin.value, erase: localErase.value })
}

function movePointer(event) {
  if (drawing.value && event.pointerId !== pointerId) return
  if (drawing.value && manipulationGuide.value) {
    manipulationGuide.value.dx = event.clientX - manipulationGuide.value.clientX
    manipulationGuide.value.dy = event.clientY - manipulationGuide.value.clientY
  }
  if ((panBrush.value || stretchBrush.value) && drawing.value) {
    pointer.value = position(event)
    const delta = snapManipulationDelta(event.clientX - panStart.x, event.clientY - panStart.y, props.lockManipulationToGrid)
    const x = delta.x * props.size / panStart.width
    const y = delta.y * props.size / panStart.height
    if (stretchBrush.value) {
      stretchOffset.value = { x, y }
      emit('canvas-stretch', stretchFromDrag(x, y, props.size))
    } else emit('canvas-pan', { x: Math.round(x), y: Math.round(y) })
    return
  }
  if ((rotationBrush.value) && drawing.value) {
    const delta = snapManipulationDelta(0, rotationStartY - event.clientY, props.lockManipulationToGrid)
    emit('canvas-rotate', delta.y * 2 * Math.PI / rotationHeight)
    return
  }
  pointer.value = position(event)
  if (canvasBrush.value || !drawing.value) return
  // Full-canvas fields remain anchored to the initial press outside Wipe.
  if ((isFieldBrush(props.brush.shape) && props.brush.mode !== 'wipe') || (pointer.value.x === previous.x && pointer.value.y === previous.y)) return
  emit('paint', { from: previous, to: pointer.value, origin: strokeOrigin.value, erase: localErase.value })
  previous = pointer.value
}

function leavePointer() {
  if (drawing.value) return
  pointer.value = null
  lastPointer = null
}

function brushWheel(event) {
  if (!props.brush.shape || canvasBrush.value || props.disabled || event.metaKey) return
  const action = event.shiftKey ? 'value' : event.ctrlKey ? 'rotation' : 'size'
  if (action === 'rotation' && !['square', 'line', 'wave'].includes(props.brush.shape) && !isRadialBrush(props.brush.shape)) return
  const delta = event.deltaY || event.deltaX
  if (!delta) return
  if (drawing.value && props.brush.mode !== 'wipe') return
  pointer.value = position(event)
  const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? canvas.value.clientHeight : 1
  if (action === 'size') sizeWheelDelta += delta * unit
  else if (action === 'value') valueWheelDelta += delta * unit
  else wheelDelta += delta * unit
  const steps = Math.trunc((action === 'size' ? sizeWheelDelta : action === 'value' ? valueWheelDelta : wheelDelta) / 100)
  if (steps) {
    if (action === 'size') {
      sizeWheelDelta -= steps * 100
      emit('adjust-size', -steps)
    } else if (action === 'value') {
      valueWheelDelta -= steps * 100
      emit('adjust-value', -steps)
    } else {
      wheelDelta -= steps * 100
      emit(isRadialBrush(props.brush.shape) ? 'adjust-phase' : 'rotate', steps * 5)
    }
  }
}

function finishStroke(event) {
  if (!drawing.value || event.pointerId !== pointerId) return
  if (event.type === 'pointerup') movePointer(event)
  drawing.value = false
  if (canvas.value.hasPointerCapture(pointerId)) canvas.value.releasePointerCapture(pointerId)
  pointerId = null
  panStart = null
  previous = null
  strokeOrigin.value = null
  manipulationGuide.value = null
  localErase.value = false
  if (event.pointerType !== 'mouse') pointer.value = null
  emit('stroke-end')
}

function keyboardStamp(event) {
  if (!props.brush.shape) return
  if (stretchBrush.value) return
  if (panBrush.value) {
    if (props.disabled || drawing.value || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    emit('stroke-start')
    emit('canvas-pan-start')
    emit('canvas-pan', { x: event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0, y: event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0 })
    emit('stroke-end')
    return
  }
  if (rotationBrush.value) {
    if (props.disabled || drawing.value || !['ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    emit('stroke-start')
    emit('canvas-rotation-start')
    emit('canvas-rotate', (event.key === 'ArrowUp' ? 1 : -1) * Math.PI / 36)
    emit('stroke-end')
    return
  }
  if (props.disabled || drawing.value || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(event.key)) return
  event.preventDefault()
  const current = pointer.value || { x: origin.value, y: origin.value }
  const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
  const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  pointer.value = {
    x: Math.max(0, Math.min(props.size - 1, current.x + dx)),
    y: Math.max(0, Math.min(props.size - 1, current.y + dy)),
  }
  snappedAxes.value = { x: false, y: false }
  if (event.key === ' ' || event.key === 'Enter') {
    emit('stroke-start')
    emit('paint', { from: pointer.value, to: pointer.value, origin: pointer.value, erase: false })
    emit('stroke-end')
  }
}

watch(() => props.size, () => { pointer.value = null; lastPointer = null })
watch(() => [props.snapToGrid, props.brush.shape], () => {
  if (!lastPointer || !pointer.value || drawing.value) return
  pointer.value = position(lastPointer)
})
watch(() => props.brush.shape, () => { wheelDelta = 0; sizeWheelDelta = 0; valueWheelDelta = 0 })
watch(() => [props.brush.angle, props.brush.size, props.brush.wavelength, props.brush.phase, props.brush.sigma, props.brushValue], () => {
  if (drawing.value && !canvasBrush.value && props.brush.mode === 'wipe' && pointer.value) {
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
  <article class="grid-card" :data-component="component" :data-domain="domain" :class="{ 'is-drawing': drawing }">
    <header class="grid-card-header">
      <span class="component-label">{{ componentName }}</span>
      <div class="canvas-actions" @click="flashHeaderAction">
        <button class="canvas-action-button canvas-link-button" :class="{ active: linkedEditing }" type="button" :aria-label="`Link ${domain} real and imaginary editing`" :aria-pressed="linkedEditing" :title="`${linkedEditing ? 'Unlink' : 'Link'} editing in the ${domain} domain`" :disabled="disabled || drawing" @click="emit('toggle-link')"><AppIcon name="link" :size="15" /></button>
        <button v-for="direction in ['horizontal', 'vertical']" :key="direction" :class="`canvas-action-button canvas-mirror-${direction}-button`" type="button" :aria-label="`Mirror ${label} ${direction === 'horizontal' ? 'horizontally' : 'vertically'}`" :title="direction === 'horizontal' ? 'Mirror horizontally (left ↔ right)' : 'Mirror vertically (top ↔ bottom)'" :disabled="disabled || drawing" @click="emit('mirror', direction)"><AppIcon :name="`mirror-${direction}`" :size="15" /></button>
        <button class="canvas-action-button canvas-copy-button" :class="{ copied }" type="button" :aria-label="`Copy ${label}`" :title="copied ? 'Copied' : `Copy ${domain === 'spatial' ? 'spatial' : 'frequency'} · ${componentName.toLowerCase()}`" :disabled="disabled || drawing" @click="emit('copy')"><AppIcon :name="copied ? 'check' : 'copy'" :size="15" /></button>
        <button class="canvas-action-button canvas-paste-button" type="button" :aria-label="`Paste into ${label}`" :title="!clipboardSize ? 'Copy a canvas first' : clipboardSize !== size ? `Copied grid is ${clipboardSize} × ${clipboardSize}. Choose that grid size to paste.` : `Add copied values into ${domain === 'spatial' ? 'spatial' : 'frequency'} · ${componentName.toLowerCase()}`" :disabled="disabled || drawing || clipboardSize !== size" @click="emit('paste')"><AppIcon name="paste" :size="15" /></button>
        <button class="canvas-action-button canvas-invert-button" type="button" :aria-label="`Invert ${label}`" title="Invert values (× −1)" :disabled="disabled || drawing" @click="emit('invert')"><AppIcon name="invert" :size="15" /></button>
        <button class="canvas-action-button canvas-clear-button" type="button" :aria-label="`Clear ${label}`" :title="`Clear ${domain === 'spatial' ? 'spatial' : 'frequency'} · ${componentName.toLowerCase()}`" :disabled="disabled || drawing" @click="emit('clear')"><AppIcon name="trash" :size="15" /></button>
      </div>
    </header>
    <div class="canvas-surround">
      <div class="canvas-stage" :class="{ 'is-disabled': disabled, 'is-idle': !brush.shape, 'is-rotation': rotationBrush, 'is-pan': panBrush, 'is-panning': panBrush && drawing, 'is-stretch': stretchBrush }">
        <canvas :key="forceCPU ? 'cpu' : 'gpu'" ref="canvas" :data-renderer="rendererBackend" :aria-label="label" aria-describedby="canvas-instructions" tabindex="0" :aria-disabled="disabled"
          @pointerdown="startStroke" @pointermove="movePointer" @pointerup="finishStroke" @pointercancel="finishStroke" @lostpointercapture="finishStroke"
          @pointerleave="leavePointer" @contextmenu.prevent @keydown="keyboardStamp" @wheel.prevent="brushWheel"
        >{{ label }}. Use arrow keys to move the brush, then Enter or Space to paint.</canvas>
        <svg v-if="symmetry.enabled && !hideGridLines" class="symmetry-guides pointer-events-none absolute inset-0 block size-full" :viewBox="`0 0 ${size} ${size}`" aria-hidden="true"><path :d="sliceGuides" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" /></svg>
        <svg v-if="repeating && !hideGridLines" class="repeat-guides symmetry-guides pointer-events-none absolute inset-0 block size-full" :viewBox="`0 0 ${size} ${size}`" aria-hidden="true"><path :d="repeatGuides" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" /></svg>
        <template v-if="!hideGridLines">
          <div class="canvas-axis axis-horizontal" aria-hidden="true"></div>
          <div class="canvas-axis axis-vertical" aria-hidden="true"></div>
          <div class="canvas-origin" aria-hidden="true"></div>
        </template>
        <StretchPreview v-if="stretchBrush && pointer && !disabled" :size="size" :anchor="{ x: origin, y: origin }" :offset="drawing ? stretchOffset : null" :locked="drawing" />
        <svg v-else-if="rotationBrush && pointer && !disabled" class="canvas-rotation-preview brush-preview-overlay pointer-events-none absolute inset-0 block size-full" :viewBox="`0 0 ${size} ${size}`" aria-hidden="true">
          <rect x="0" y="0" :width="size" :height="size" fill="none" stroke="#e4fff5" stroke-width="1.2" vector-effect="non-scaling-stroke" />
          <circle :cx="origin + .5" :cy="origin + .5" :r="size * .2" fill="none" stroke="#e4fff5" stroke-dasharray="4 3" stroke-width="1.2" vector-effect="non-scaling-stroke" />
        </svg>
        <BrushPreview v-else-if="brush.shape === 'fill' && pointer && !disabled" :brush="brush" :size="size" :center="pointer" :value="brushValue" :erase="tool === 'erase' || localErase" />
        <RepeatPreview v-else-if="brush.shape && !canvasBrush && pointer && !disabled && repeating" :brush="brush" :size="size" :center="pointer" :origin="brush.mode === 'wipe' ? pointer : strokeOrigin || pointer" :value="brushValue" :erase="tool === 'erase' || localErase" :repeat="repeat" />
        <SymmetryPreview v-else-if="brush.shape && !canvasBrush && pointer && !disabled" :brush="brush" :size="size" :center="pointer" :origin="brush.mode === 'wipe' ? pointer : strokeOrigin || pointer" :value="brushValue" :erase="tool === 'erase' || localErase" :symmetry="symmetry" />
        <ManipulationGuides v-if="drawing && lockManipulationToGrid && manipulationGuide" :anchor="manipulationGuide.anchor" :dx="manipulationGuide.dx" :dy="manipulationGuide.dy" :rotation="rotationBrush" />
        <div v-if="snapMarker" class="axis-snap-marker" :style="{ left: snapMarker.left, top: snapMarker.top }" :data-snap-x="snapMarker.x" :data-snap-y="snapMarker.y" aria-hidden="true">
          <span v-if="snapMarker.x" class="axis-snap-tick axis-snap-x"></span>
          <span v-if="snapMarker.y" class="axis-snap-tick axis-snap-y"></span>
          <span class="axis-snap-ring"></span>
        </div>
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
