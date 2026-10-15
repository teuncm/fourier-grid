<script setup>
import { computed } from 'vue'
import { stretchFromDrag } from '../lib/stretch.js'

const props = defineProps({ size: Number, anchor: Object, offset: Object, locked: Boolean })
const matrix = computed(() => stretchFromDrag(props.offset?.x || 0, props.offset?.y || 0, props.size))
const center = computed(() => ({ x: (props.anchor.x + .5) * 100 / props.size, y: (props.anchor.y + .5) * 100 / props.size }))
const gridTransform = computed(() => {
  const { a, b, c, d } = matrix.value, { x, y } = center.value
  return `matrix(${a} ${c} ${b} ${d} ${x - a * x - b * y} ${y - c * x - d * y})`
})
const gridPath = computed(() => {
  const { x, y } = center.value
  let path = ''
  for (const offset of [-24, -12, 0, 12, 24]) path += `M${x - 24} ${y + offset}h48M${x + offset} ${y - 24}v48`
  return path
})
const axes = computed(() => [matrix.value.scaleX, matrix.value.scaleY].map((scale, index) => ({
  index, direction: index * 90,
  scale, extent: Math.min(35, 16 * scale), color: scale >= 1 ? '#aaffde' : '#ffe66d',
})))
</script>

<template>
  <svg class="stretch-preview pointer-events-none absolute inset-0 z-[2] block size-full overflow-hidden" viewBox="0 0 100 100" aria-hidden="true" :data-locked="locked" :data-scale-x="matrix.scaleX" :data-scale-y="matrix.scaleY">
    <g v-if="locked" fill="none" stroke-width="1.1">
      <path :d="gridPath" stroke="#d5e8e2" opacity=".12" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />
      <path :d="gridPath" :transform="gridTransform" stroke="#aaffde" opacity=".55" vector-effect="non-scaling-stroke" />
      <circle :cx="center.x" :cy="center.y" r="16" :transform="gridTransform" stroke="#e4fff5" opacity=".7" vector-effect="non-scaling-stroke" />
      <g v-for="axis in axes" :key="axis.index" :transform="`translate(${center.x} ${center.y}) rotate(${axis.direction})`" :stroke="axis.color" stroke-width="1.6">
        <path v-if="axis.scale >= 1" :d="`M${-axis.extent} 0H${axis.extent}M${axis.extent - 3} -2.5L${axis.extent} 0l-3 2.5M${-axis.extent + 3} -2.5L${-axis.extent} 0l3 2.5`" vector-effect="non-scaling-stroke" />
        <path v-else :d="`M-25 0H${-axis.extent}m-3 -2.5 3 2.5-3 2.5M25 0H${axis.extent}m3 -2.5-3 2.5 3 2.5`" vector-effect="non-scaling-stroke" />
        <text :x="axis.extent + 3" y="-3" :transform="`rotate(${-axis.direction} ${axis.extent + 3} -3)`" :fill="axis.color" stroke="#10191e" stroke-width=".8" paint-order="stroke" font-size="3.5" font-family="monospace">{{ axis.index === 0 ? 'X' : 'Y' }}</text>
      </g>
    </g>
    <circle :cx="center.x" :cy="center.y" r="3" fill="#10191e" stroke="#e4fff5" stroke-width="1.5" vector-effect="non-scaling-stroke" />
    <path :d="`M${center.x - 5} ${center.y}h3m4 0h3M${center.x} ${center.y - 5}v3m0 4v3`" stroke="#e4fff5" stroke-width="1.2" vector-effect="non-scaling-stroke" />
    <circle :cx="center.x" :cy="center.y" r=".8" fill="#aaffde" />
  </svg>
</template>
