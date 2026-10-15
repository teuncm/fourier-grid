<script setup>
defineProps({ name: String, size: { type: Number, default: 18 } })

const paths = {
  brush: 'm14.5 3.5 6 6M4 16l11-11a2.12 2.12 0 0 1 3 3L7 19l-5 1 1-5Z',
  dot: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  square: 'M5 5h14v14H5Z',
  line: 'M4 18 20 6',
  wave: 'M5 4v16M12 4v16M19 4v16',
  waveform: 'M2 12c2.5 0 2.5-7 5-7s2.5 14 5 14 2.5-14 5-14 2.5 7 5 7',
  spectrum: 'M2 20h20M3 20v-5M7 20V9M12 20V4M17 20v-9M21 20v-4',
  gaussian: 'M3 19h18M3 18c6 0 5-13 9-13s3 13 9 13',
  rotation: 'M4 10a8 8 0 1 1 1 8M4 4v6h6M12 9v6M9 12h6',
  pan: 'M12 3v18M3 12h18m-7-7-2-2-2 2m4 14-2 2-2-2M5 10l-2 2 2 2m14-4 2 2-2 2',
  stretch: 'M4 8V4h4M16 20h4v-4M4 4l6 6m10 10-6-6M16 4v4h4M4 16h4v4m8-12 4-4M8 16l-4 4',
  erase: 'm8 19-5-5a2 2 0 0 1 0-3l8-8a2 2 0 0 1 3 0l7 7a2 2 0 0 1 0 3l-6 6H8Zm-2-11 9 9M8 19h14',
  minus: 'M5 12h14',
  plus: 'M5 12h14M12 5v14',
  reset: 'M3 10a9 9 0 1 1 2 8M3 4v6h6',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  copy: 'M9 9h11v11H9ZM5 15H4V4h11v1',
  paste: 'M9 5H5v16h14V5h-4M9 3h6v4H9ZM8 12h8M8 16h8',
  'paste-inverted': 'M9 5H5v16h14V5h-4M9 3h6v4H9ZM8 14h8',
  'mirror-horizontal': 'M12 3v18M3 7l5 5-5 5ZM21 7l-5 5 5 5Z',
  'mirror-vertical': 'M3 12h18M7 3l5 5 5-5ZM7 21l5-5 5 5Z',
  check: 'm5 12 4 4L19 6',
  arrow: 'M4 12h16m-5-5 5 5-5 5',
  info: 'M12 11v6M12 7h.01',
  close: 'm6 6 12 12M6 18 18 6',
  chevron: 'm6 9 6 6 6-6',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
}
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle v-if="name === 'info'" cx="12" cy="12" r="9" />
    <path :d="paths[name]" />
  </svg>
</template>
