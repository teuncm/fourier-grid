<script setup>
import { computed } from 'vue'
import { getBrushFootprint, getLineFootprint, getWavePreview } from '../lib/brushes.js'

const props = defineProps({
  brush: { type: Object, required: true },
  size: { type: Number, required: true },
  center: { type: Object, required: true },
  origin: Object,
  value: { type: Number, default: 1 },
  erase: Boolean,
})
const outline = computed(() => {
  if (['wave', 'gaussian'].includes(props.brush.shape)) return `M0,0H${props.size}V${props.size}H0Z`
  if (props.brush.shape === 'line') return getLineFootprint(props.brush, props.size, props.center).outline
  return getBrushFootprint(props.brush).outline
})
const transform = computed(() => ['dot', 'square'].includes(props.brush.shape) ? `translate(${props.center.x + 0.5} ${props.center.y + 0.5})` : undefined)
const wave = computed(() => getWavePreview(props.brush, props.size, props.origin || props.center))
const removing = computed(() => props.erase || (props.value === 0 && props.brush.mode !== 'add'))
const peaksColor = computed(() => props.value >= 0 ? '#73eeca' : '#f48d77')
const troughsColor = computed(() => props.value >= 0 ? '#f48d77' : '#73eeca')
const gaussianCenter = computed(() => props.origin || props.center)
</script>

<template>
  <svg class="brush-preview-overlay pointer-events-none absolute inset-0 block size-full overflow-hidden" :viewBox="`0 0 ${size} ${size}`" aria-hidden="true" :data-shape="brush.shape" :data-erase="removing">
    <g :transform="transform" fill="none" stroke-width="1.2">
      <path v-if="!['wave', 'gaussian'].includes(brush.shape) || removing || value === 0" :d="outline" :stroke="removing ? '#f5b5a5' : '#e4fff5'" :stroke-dasharray="removing ? '3 2' : undefined" vector-effect="non-scaling-stroke" />
      <template v-if="brush.shape === 'gaussian' && !removing && value !== 0">
        <circle data-sigma="1" :cx="gaussianCenter.x + 0.5" :cy="gaussianCenter.y + 0.5" :r="brush.sigma" :stroke="peaksColor" vector-effect="non-scaling-stroke" />
        <circle data-sigma="2" :cx="gaussianCenter.x + 0.5" :cy="gaussianCenter.y + 0.5" :r="brush.sigma * 2" :stroke="peaksColor" stroke-dasharray="3 2" vector-effect="non-scaling-stroke" />
      </template>
      <template v-if="brush.shape === 'wave' && !removing && value !== 0">
        <path data-band="peak" :d="wave.peaks" :stroke="peaksColor" vector-effect="non-scaling-stroke" />
        <path data-band="trough" :d="wave.troughs" :stroke="troughsColor" stroke-dasharray="3 2" vector-effect="non-scaling-stroke" />
      </template>
    </g>
  </svg>
</template>
