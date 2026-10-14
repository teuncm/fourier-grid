<script setup>
import { computed, useId } from 'vue'
import BrushPreview from './BrushPreview.vue'
import { sliceAt, slicePolygon } from '../lib/symmetry.js'

const props = defineProps({ brush: Object, size: Number, center: Object, origin: Object, value: Number, erase: Boolean, symmetry: Object })
const clipId = `symmetry-${useId()}`
const sourceSlice = computed(() => sliceAt(props.origin || props.center, props.size, props.symmetry))
const polygon = computed(() => slicePolygon(props.size, props.symmetry, sourceSlice.value))
</script>

<template>
  <BrushPreview v-if="!symmetry.enabled" :brush="brush" :size="size" :center="center" :origin="origin" :value="value" :erase="erase" />
  <svg v-else class="symmetry-preview brush-preview-overlay pointer-events-none absolute inset-0 block size-full overflow-hidden" :viewBox="`0 0 ${size} ${size}`" aria-hidden="true" :data-shape="brush.shape">
    <defs><clipPath :id="clipId"><polygon :points="polygon" /></clipPath></defs>
    <g v-for="slice in symmetry.slices" :key="slice" :transform="`rotate(${(slice - 1) * 360 / symmetry.slices} ${size / 2} ${size / 2})`">
      <g :clip-path="`url(#${clipId})`"><BrushPreview :brush="brush" :size="size" :center="center" :origin="origin" :value="value" :erase="erase" /></g>
    </g>
  </svg>
</template>
