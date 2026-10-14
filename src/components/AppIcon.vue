<script setup>
defineProps({ name: String, size: { type: Number, default: 18 } })

const paths = {
  brush: 'm14.5 3.5 6 6M4 16l11-11a2.12 2.12 0 0 1 3 3L7 19l-5 1 1-5Z',
  dot: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  square: 'M5 5h14v14H5Z',
  line: 'M4 18 20 6',
  wave: 'M5 4v16M12 4v16M19 4v16',
  gaussian: 'M3 19h18M3 18c6 0 5-13 9-13s3 13 9 13',
  erase: 'm8 19-5-5a2 2 0 0 1 0-3l8-8a2 2 0 0 1 3 0l7 7a2 2 0 0 1 0 3l-6 6H8Zm-2-11 9 9M8 19h14',
  minus: 'M5 12h14',
  plus: 'M5 12h14M12 5v14',
  reset: 'M3 10a9 9 0 1 1 2 8M3 4v6h6',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  arrow: 'M4 12h16m-5-5 5 5-5 5',
  info: 'M12 11v6M12 7h.01',
  close: 'm6 6 12 12M6 18 18 6',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
}
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle v-if="name === 'info'" cx="12" cy="12" r="9" />
    <path :d="paths[name]" />
  </svg>
</template>
