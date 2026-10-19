<script setup>
import { computed } from 'vue'
import { snapManipulationDelta, manipulationSnapDistance } from '../lib/pointer.js'

const props = defineProps({ anchor: Object, dx: Number, dy: Number, rotation: Boolean })
const snapped = computed(() => snapManipulationDelta(props.dx, props.dy, true))
const axes = computed(() => [
  { name: 'x', path: `M0 ${props.anchor.y}H100`, locked: snapped.value.y === 0 },
  ...props.rotation ? [] : [{ name: 'y', path: `M${props.anchor.x} 0V100`, locked: snapped.value.x === 0 }],
])
</script>

<template>
  <svg class="manipulation-guides pointer-events-none absolute inset-0 z-[3] block size-full overflow-hidden" viewBox="0 0 100 100" aria-hidden="true" :data-anchor-x="anchor.x" :data-anchor-y="anchor.y">
    <g v-for="axis in axes" :key="axis.name" :data-axis="axis.name" :data-snapped="axis.locked" fill="none" stroke="#aaffde">
      <path :d="axis.path" :stroke-width="manipulationSnapDistance * 2" :opacity="axis.locked ? .08 : .025" vector-effect="non-scaling-stroke" />
      <path :d="axis.path" :stroke-width="axis.locked ? 1.5 : 1" :opacity="axis.locked ? .95 : .35" :stroke-dasharray="axis.locked ? null : '4 4'" vector-effect="non-scaling-stroke" />
    </g>
    <circle :cx="anchor.x" :cy="anchor.y" r=".9" fill="#10191e" stroke="#aaffde" stroke-width="1.3" vector-effect="non-scaling-stroke" />
  </svg>
</template>
