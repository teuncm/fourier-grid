<script setup>
import { computed, useId } from 'vue'
import BrushPreview from './BrushPreview.vue'
import { repeatTiles } from '../lib/repeat.js'

const props = defineProps({ brush: Object, size: Number, center: Object, origin: Object, value: Number, erase: Boolean, repeat: Object })
const clipId = `repeat-${useId()}`
const copies = computed(() => repeatTiles(props.size, props.repeat, props.origin || props.center))
</script>

<template>
  <svg class="repeat-preview brush-preview-overlay pointer-events-none absolute inset-0 block size-full overflow-hidden" :viewBox="`0 0 ${size} ${size}`" aria-hidden="true" :data-shape="brush.shape">
    <defs><clipPath :id="clipId"><rect :x="copies.source.left" :y="copies.source.top" :width="copies.source.width" :height="copies.source.height" /></clipPath></defs>
    <g v-for="(tile, index) in copies.tiles" :key="index" :transform="tile.transform">
      <g :clip-path="`url(#${clipId})`"><BrushPreview :brush="brush" :size="size" :center="center" :origin="origin" :value="value" :erase="erase" /></g>
    </g>
  </svg>
</template>
