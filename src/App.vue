<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import AppIcon from './components/AppIcon.vue'
import FourierCanvas from './components/FourierCanvas.vue'
import { fft2D } from './lib/fft.browser.js'
import { createGrid, gridRanges, gridPeakFromRanges, updateValueRange } from './lib/grid.js'
import { paintSymmetricStroke } from './lib/symmetry.js'
import { paintRepeatedStroke } from './lib/repeat.js'
import { createPhaseSelection, rotatePhaseSelection } from './lib/phase.js'
import { createCanvasRotation, rotateCanvasValues } from './lib/rotation.js'
import { createCanvasPan, panCanvasValues } from './lib/pan.js'
import { createCanvasStretch, stretchCanvasValues } from './lib/stretch.js'
import { mirrorCanvasValues } from './lib/mirror.js'
import { createDirtyRegion } from './lib/render.js'

const size = ref(127)
const spatial = shallowRef(createGrid(size.value))
const frequency = shallowRef(createGrid(size.value))
const spatialRevision = reactive({ real: 0, imaginary: 0 })
const frequencyRevision = reactive({ real: 0, imaginary: 0 })
const spatialChanges = { real: createDirtyRegion(), imaginary: createDirtyRegion() }
const frequencyChanges = { real: createDirtyRegion(), imaginary: createDirtyRegion() }
const spatialRanges = reactive(gridRanges(spatial.value))
const frequencyRanges = reactive(gridRanges(frequency.value))
const spatialPeak = computed(() => gridPeakFromRanges(spatialRanges))
const frequencyPeak = computed(() => gridPeakFromRanges(frequencyRanges))
const tool = ref('paint')
const drawingMode = ref('wipe')
const brushShape = ref('dot')
const brushChoices = [{ shape: 'dot', label: 'Circle' }, { shape: 'square', label: 'Square' }, { shape: 'line', label: 'Line' }, { shape: 'wave', label: 'Wave' }, { shape: 'gaussian', label: 'Gaussian' }]
const manipulationChoices = [{ shape: 'rotation', label: 'Rotate' }, { shape: 'pan', label: 'Pan' }, { shape: 'stretch', label: 'Stretch' }]
const rotationBrush = computed(() => brushShape.value === 'rotation')
const panBrush = computed(() => brushShape.value === 'pan')
const stretchBrush = computed(() => brushShape.value === 'stretch')
const canvasBrush = computed(() => rotationBrush.value || panBrush.value || stretchBrush.value)
const stretchScales = reactive({ x: 1, y: 1 })
let stretchSnapshot = null, stretchFrame = null, pendingStretch = null
const panOffset = reactive({ x: 0, y: 0 })
let panSnapshot = null, panFrame = null, pendingPan = null
const canvasAngle = ref(0)
let rotationSnapshot = null, rotationFrame = null, pendingRotation = null
const rotatable = computed(() => ['square', 'line', 'wave'].includes(brushShape.value))
const brushSizes = reactive({ dot: 9, square: 9, line: 3 })
const brushAngles = reactive({ square: 0, line: 0, wave: 0 })
const brushAngle = computed({
  get: () => brushAngles[brushShape.value] || 0,
  set: value => { if (rotatable.value) brushAngles[brushShape.value] = value },
})
const waveFrequency = ref(16)
const gaussianSigma = ref(4)
const brushMaximum = computed(() => Math.max(1, size.value - 1))
const brushSize = computed({
  get: () => ['wave', 'gaussian', 'rotation', 'pan', 'stretch'].includes(brushShape.value) ? size.value : brushSizes[brushShape.value],
  set: value => {
    if (['wave', 'gaussian', 'rotation', 'pan', 'stretch'].includes(brushShape.value)) return
    brushSizes[brushShape.value] = Math.max(1, Math.min(brushMaximum.value, Math.round((value - 1) / 2) * 2 + 1))
  },
})
const brush = computed(() => ({ shape: brushShape.value, size: brushSize.value, angle: brushAngle.value, wavelength: size.value / waveFrequency.value, sigma: gaussianSigma.value, mode: drawingMode.value }))
const brushValue = ref(1)
const logarithmic = ref(true)
const showGridLines = ref(true)
const realTime = ref(true)
const phaseEnabled = ref(false)
const phaseAllowed = computed(() => ['dot', 'square'].includes(brushShape.value))
const phaseHover = shallowRef(null)
const phaseAngle = ref(0)
let phaseSelection = null
const symmetryEnabled = ref(false)
const symmetrySlices = ref(6)
const symmetryAngle = ref(0)
const symmetry = computed(() => ({ enabled: symmetryEnabled.value, slices: symmetrySlices.value, angle: symmetryAngle.value }))
const repeatEnabled = reactive({ horizontal: false, vertical: false })
const repeatCounts = reactive({ horizontal: 4, vertical: 4 })
const repeatMaximum = computed(() => Math.min(16, size.value))
const repeatAxes = [{ axis: 'horizontal', label: 'Horizontal repeat', count: 'Columns' }, { axis: 'vertical', label: 'Vertical repeat', count: 'Rows' }]
const repeat = computed(() => ({ columns: repeatEnabled.horizontal ? Math.min(repeatCounts.horizontal, size.value) : 1, rows: repeatEnabled.vertical ? Math.min(repeatCounts.vertical, size.value) : 1 }))
function toggleRepeat(axis) {
  if (repeatEnabled[axis]) { symmetryEnabled.value = false; phaseEnabled.value = false; phaseHover.value = null }
}
function toggleSymmetry() {
  if (symmetryEnabled.value) { repeatEnabled.horizontal = repeatEnabled.vertical = false; phaseEnabled.value = false; phaseHover.value = null }
}
function togglePhase() {
  phaseHover.value = null
  phaseAngle.value = 0
  if (phaseEnabled.value) { symmetryEnabled.value = false; repeatEnabled.horizontal = repeatEnabled.vertical = false }
}
function hoverPhase(domain, point) {
  if (!phaseEnabled.value || drawing.value) return
  if (point) phaseHover.value = { domain, point }
  else if (phaseHover.value?.domain === domain) phaseHover.value = null
}
function startPhase(domain, point) {
  if (!phaseEnabled.value || !phaseAllowed.value) return
  const grid = domain === 'spatial' ? spatial.value : frequency.value
  phaseSelection = createPhaseSelection(grid, size.value, point, brush.value)
  phaseHover.value = { domain, point }
  phaseAngle.value = 0
}
function rotatePhase(domain, radians) {
  if (!phaseEnabled.value || !phaseSelection || phaseHover.value?.domain !== domain) return
  const grid = domain === 'spatial' ? spatial.value : frequency.value
  const result = rotatePhaseSelection(grid, phaseSelection, radians)
  phaseAngle.value = radians * 180 / Math.PI
  const ranges = domain === 'spatial' ? spatialRanges : frequencyRanges
  const revisions = domain === 'spatial' ? spatialRevision : frequencyRevision
  const changes = domain === 'spatial' ? spatialChanges : frequencyChanges
  let changed = false
  for (const component of ['real', 'imaginary']) if (result[component].bounds) {
    changed = true
    ranges[component] = updateValueRange(grid[component], ranges[component], result[component])
    changes[component].add(result[component].bounds)
    revisions[component]++
  }
  if (changed && realTime.value) scheduleTransform(domain)
}
function changeRepeat(axis, change) {
  repeatCounts[axis] = Math.max(2, Math.min(repeatMaximum.value, repeatCounts[axis] + change))
}
const busy = ref(false)
const drawing = ref(false)
const activeGrid = ref('')
const clipboard = shallowRef(null)
const copiedCanvas = ref('')
const clipboardNotice = ref('')
let copyFeedbackTimer = null
const error = ref('')
const helpDialog = ref(null)
let worker = null
let jobId = 0
let pendingTarget = 'frequency'
let pendingDomain = 'spatial'
let queuedDomain = null
let transformFrame = null
let strokeMask = null
let wipeFrame = null
let pendingWipe = null
let spareGrid = null

const locked = computed(() => busy.value || drawing.value)
const status = computed(() => error.value || (drawing.value ? (realTime.value ? 'Drawing' : 'Release to update') : busy.value ? 'Updating…' : 'Ready'))
const arrowDirection = ref(null)
let arrowTimer = null
watch(() => drawing.value ? activeGrid.value.split('-')[0] : busy.value ? pendingDomain : null, domain => {
  if (arrowTimer !== null) { clearTimeout(arrowTimer); arrowTimer = null }
  if (domain) arrowDirection.value = domain
  else arrowTimer = setTimeout(() => { arrowDirection.value = null; arrowTimer = null }, 220)
}, { flush: 'sync' })

function updateRanges() {
  Object.assign(spatialRanges, gridRanges(spatial.value))
  Object.assign(frequencyRanges, gridRanges(frequency.value))
}

function applyResult(result, target) {
  // Retired output buffers become the next worker input snapshot.
  if (worker) spareGrid = target === 'frequency' ? frequency.value : spatial.value
  if (target === 'frequency') {
    frequency.value = { real: result.real, imaginary: result.imaginary }
    frequencyRevision.real++
    frequencyRevision.imaginary++
    Object.assign(frequencyRanges, result.ranges ?? gridRanges(frequency.value))
  } else {
    spatial.value = { real: result.real, imaginary: result.imaginary }
    spatialRevision.real++
    spatialRevision.imaginary++
    Object.assign(spatialRanges, result.ranges ?? gridRanges(spatial.value))
  }
  busy.value = false
  // Keep only the latest edits when drawing outpaces the worker.
  const nextDomain = queuedDomain
  queuedDomain = null
  if (nextDomain) transform(nextDomain)
}

async function transform(domain) {
  if (busy.value) {
    queuedDomain = domain
    return
  }
  error.value = ''
  pendingDomain = domain
  busy.value = true
  const inverse = domain === 'frequency'
  pendingTarget = inverse ? 'spatial' : 'frequency'
  const source = inverse ? frequency.value : spatial.value
  const id = ++jobId
  const target = pendingTarget
  if (worker) {
    const reusable = spareGrid?.real.length === source.real.length && spareGrid?.imaginary.length === source.imaginary.length
    const real = reusable ? spareGrid.real : new Float64Array(source.real.length)
    const imaginary = reusable ? spareGrid.imaginary : new Float64Array(source.imaginary.length)
    spareGrid = null
    real.set(source.real)
    imaginary.set(source.imaginary)
    worker.postMessage({ id, size: size.value, real, imaginary, inverse }, [real.buffer, imaginary.buffer])
  } else {
    try {
      const result = await fft2D(source.real, source.imaginary, size.value, inverse)
      if (id === jobId) applyResult(result, target)
    } catch (failure) {
      busy.value = false
      queuedDomain = null
      error.value = failure.message
    }
  }
}

function scheduleTransform(domain) {
  if (busy.value) {
    queuedDomain = domain
  } else if (transformFrame === null) {
    transformFrame = requestAnimationFrame(() => {
      transformFrame = null
      transform(domain)
    })
  }
}

function canvasDisabled(domain, component) {
  // A live transform must not interrupt the current stroke.
  return drawing.value ? activeGrid.value !== `${domain}-${component}` : busy.value
}

function beginStroke(domain, component) {
  drawing.value = true
  activeGrid.value = `${domain}-${component}`
  strokeMask = !phaseEnabled.value && !canvasBrush.value && drawingMode.value === 'add' ? new Uint8Array(size.value * size.value) : null
}

function startCanvasPan(domain, component) {
  const grid = domain === 'spatial' ? spatial.value : frequency.value
  panSnapshot = createCanvasPan(grid[component], size.value)
  panOffset.x = panOffset.y = 0
}

function startCanvasStretch(domain, component) {
  const grid = domain === 'spatial' ? spatial.value : frequency.value
  stretchSnapshot = createCanvasStretch(grid[component], size.value)
  stretchScales.x = stretchScales.y = 1
}

function stretchCanvas(domain, component, matrix) {
  if (!stretchBrush.value || !stretchSnapshot) return
  stretchScales.x = matrix.scaleX
  stretchScales.y = matrix.scaleY
  pendingStretch = { domain, component, matrix }
  if (stretchFrame === null) stretchFrame = requestAnimationFrame(flushStretch)
}

function flushStretch() {
  if (stretchFrame !== null) cancelAnimationFrame(stretchFrame)
  stretchFrame = null
  const pending = pendingStretch
  pendingStretch = null
  if (!pending || !stretchSnapshot) return
  const { domain, component, matrix } = pending
  const grid = domain === 'spatial' ? spatial.value : frequency.value
  const result = stretchCanvasValues(grid[component], stretchSnapshot, matrix)
  if (!result.bounds) return
  const ranges = domain === 'spatial' ? spatialRanges : frequencyRanges
  const revisions = domain === 'spatial' ? spatialRevision : frequencyRevision
  const changes = domain === 'spatial' ? spatialChanges : frequencyChanges
  ranges[component] = result.range
  changes[component].add(result.bounds)
  revisions[component]++
  if (realTime.value) scheduleTransform(domain)
}

function panCanvas(domain, component, offset) {
  if (!panBrush.value || !panSnapshot) return
  Object.assign(panOffset, offset)
  pendingPan = { domain, component, ...offset }
  if (panFrame === null) panFrame = requestAnimationFrame(flushPan)
}

function flushPan() {
  if (panFrame !== null) cancelAnimationFrame(panFrame)
  panFrame = null
  const pending = pendingPan
  pendingPan = null
  if (!pending || !panSnapshot) return
  const { domain, component, x, y } = pending
  const grid = domain === 'spatial' ? spatial.value : frequency.value
  const result = panCanvasValues(grid[component], panSnapshot, x, y)
  if (!result.bounds) return
  const revisions = domain === 'spatial' ? spatialRevision : frequencyRevision
  const changes = domain === 'spatial' ? spatialChanges : frequencyChanges
  // Panning permutes exact values, preserving min/max and their counts.
  changes[component].add(result.bounds)
  revisions[component]++
  if (realTime.value) scheduleTransform(domain)
}

function startCanvasRotation(domain, component) {
  const grid = domain === 'spatial' ? spatial.value : frequency.value
  rotationSnapshot = createCanvasRotation(grid[component], size.value)
  canvasAngle.value = 0
}

function rotateCanvas(domain, component, radians) {
  if (!rotationBrush.value || !rotationSnapshot) return
  canvasAngle.value = radians * 180 / Math.PI
  pendingRotation = { domain, component, radians }
  if (rotationFrame === null) rotationFrame = requestAnimationFrame(flushRotation)
}

function flushRotation() {
  if (rotationFrame !== null) cancelAnimationFrame(rotationFrame)
  rotationFrame = null
  const pending = pendingRotation
  pendingRotation = null
  if (!pending || !rotationSnapshot) return
  const { domain, component, radians } = pending
  const grid = domain === 'spatial' ? spatial.value : frequency.value
  const result = rotateCanvasValues(grid[component], rotationSnapshot, radians)
  if (!result.bounds) return
  const ranges = domain === 'spatial' ? spatialRanges : frequencyRanges
  const revisions = domain === 'spatial' ? spatialRevision : frequencyRevision
  const changes = domain === 'spatial' ? spatialChanges : frequencyChanges
  ranges[component] = result.range
  changes[component].add(result.bounds)
  revisions[component]++
  if (realTime.value) scheduleTransform(domain)
}

function paint(domain, component, stroke) {
  if (drawingMode.value === 'wipe' && tool.value !== 'erase' && !stroke.erase) {
    pendingWipe = { domain, component, stroke }
    if (wipeFrame === null) wipeFrame = requestAnimationFrame(flushWipe)
    return
  }
  applyPaint(domain, component, stroke)
}

function flushWipe() {
  if (wipeFrame !== null) cancelAnimationFrame(wipeFrame)
  wipeFrame = null
  const pending = pendingWipe
  pendingWipe = null
  if (pending) applyPaint(pending.domain, pending.component, pending.stroke)
}

function applyPaint(domain, component, stroke) {
  const grid = domain === 'spatial' ? spatial.value : frequency.value
  const erase = tool.value === 'erase' || stroke.erase
  const result = repeat.value.columns > 1 || repeat.value.rows > 1
    ? paintRepeatedStroke(grid[component], size.value, stroke.from, stroke.to, brush.value, brushValue.value, stroke.origin || stroke.from, repeat.value, { visited: strokeMask, erase })
    : paintSymmetricStroke(grid[component], size.value, stroke.from, stroke.to, brush.value, brushValue.value, stroke.origin || stroke.from, symmetry.value, { visited: strokeMask, erase })
  if (!result.bounds) return
  const ranges = domain === 'spatial' ? spatialRanges : frequencyRanges
  ranges[component] = updateValueRange(grid[component], ranges[component], result)
  const revisions = domain === 'spatial' ? spatialRevision : frequencyRevision
  const changes = domain === 'spatial' ? spatialChanges : frequencyChanges
  changes[component].add(result.bounds)
  revisions[component]++
  if (realTime.value) scheduleTransform(domain)
}

function endStroke(domain) {
  flushWipe()
  flushRotation()
  flushPan()
  flushStretch()
  rotationSnapshot = null
  panSnapshot = null
  stretchSnapshot = null
  drawing.value = false
  activeGrid.value = ''
  strokeMask = null
  phaseSelection = null
  if (transformFrame !== null) {
    cancelAnimationFrame(transformFrame)
    transformFrame = null
  }
  // Always finish with a transform of the complete stroke.
  transform(domain)
}

function changeBrush(change) {
  if (canvasBrush.value) return
  if (brushShape.value === 'gaussian') changeGaussianSigma(change / 4)
  else brushSize.value += change
}

function adjustBrushSize(steps) {
  if (canvasBrush.value) return
  if (phaseEnabled.value && drawing.value) return
  if (locked.value && !(drawing.value && drawingMode.value === 'wipe')) return
  if (brushShape.value === 'gaussian') {
    changeGaussianSigma(steps * 0.5)
  } else if (brushShape.value === 'wave') {
    changeWaveFrequency(steps * 0.5)
  } else {
    changeBrush(steps * 2)
  }
}

function changeWaveFrequency(change) {
  waveFrequency.value = Math.max(0.5, Math.min(size.value / 2, waveFrequency.value + change))
}

function changeGaussianSigma(change) {
  gaussianSigma.value = Math.max(0.5, Math.min(size.value / 2, gaussianSigma.value + change))
}

function changePaintValue(change) {
  brushValue.value = Math.max(-1, Math.min(1, Math.round((brushValue.value + change) * 10) / 10))
}

function adjustPaintValue(steps) {
  if (canvasBrush.value || phaseEnabled.value) return
  if (locked.value && !(drawing.value && drawingMode.value === 'wipe')) return
  changePaintValue(steps * 0.1)
}

function changeSymmetrySlices(change) {
  symmetrySlices.value = Math.max(2, Math.min(24, symmetrySlices.value + change))
}

function changeSymmetryAngle(change) {
  symmetryAngle.value = ((symmetryAngle.value + change) % 360 + 360) % 360
}

function selectBrush(shape) {
  brushShape.value = shape
  if (!phaseAllowed.value) { phaseEnabled.value = false; phaseHover.value = null }
}

function rotateBrush(degrees) {
  if (phaseEnabled.value && drawing.value) return
  if (!rotatable.value || (locked.value && !(drawing.value && drawingMode.value === 'wipe'))) return
  brushAngle.value = ((brushAngle.value + degrees) % 180 + 180) % 180
}

function clear() {
  if (locked.value) return
  spatial.value = createGrid(size.value)
  frequency.value = createGrid(size.value)
  spareGrid = null
  error.value = ''
  updateRanges()
  spatialRevision.real++
  spatialRevision.imaginary++
  frequencyRevision.real++
  frequencyRevision.imaginary++
}

function clearCanvas(domain, component) {
  if (locked.value) return
  const grid = domain === 'spatial' ? spatial.value : frequency.value
  const revisions = domain === 'spatial' ? spatialRevision : frequencyRevision
  const changes = domain === 'spatial' ? spatialChanges : frequencyChanges
  grid[component].fill(0)
  changes[component].add({ left: 0, top: 0, right: size.value - 1, bottom: size.value - 1 })
  revisions[component]++
  const ranges = domain === 'spatial' ? spatialRanges : frequencyRanges
  ranges[component] = { min: 0, max: 0, minCount: size.value * size.value, maxCount: size.value * size.value }
  transform(domain)
}

function copyCanvas(domain, component) {
  if (locked.value) return
  const grid = domain === 'spatial' ? spatial.value : frequency.value
  const ranges = domain === 'spatial' ? spatialRanges : frequencyRanges
  clipboard.value = { size: size.value, values: grid[component].slice(), range: { ...ranges[component] } }
  copiedCanvas.value = `${domain}-${component}`
  clipboardNotice.value = `Copied ${domain === 'spatial' ? 'drawing' : 'frequencies'}, ${component}, ${size.value} by ${size.value}.`
  if (copyFeedbackTimer !== null) clearTimeout(copyFeedbackTimer)
  copyFeedbackTimer = setTimeout(() => { copiedCanvas.value = ''; copyFeedbackTimer = null }, 1600)
}

function pasteCanvas(domain, component, inverted = false) {
  if (locked.value || clipboard.value?.size !== size.value) return
  const grid = domain === 'spatial' ? spatial.value : frequency.value
  const ranges = domain === 'spatial' ? spatialRanges : frequencyRanges
  const revisions = domain === 'spatial' ? spatialRevision : frequencyRevision
  const changes = domain === 'spatial' ? spatialChanges : frequencyChanges
  const { values, range } = clipboard.value
  if (inverted) {
    const destination = grid[component]
    for (let i = 0; i < values.length; i++) destination[i] = -values[i]
    ranges[component] = { min: -range.max, max: -range.min, minCount: range.maxCount, maxCount: range.minCount }
  } else {
    grid[component].set(values)
    ranges[component] = { ...range }
  }
  changes[component].add({ left: 0, top: 0, right: size.value - 1, bottom: size.value - 1 })
  revisions[component]++
  clipboardNotice.value = `Pasted${inverted ? ' inverted values' : ''} into ${domain === 'spatial' ? 'drawing' : 'frequencies'}, ${component}.`
  transform(domain)
}

function mirrorCanvas(domain, component, direction) {
  if (locked.value) return
  const grid = domain === 'spatial' ? spatial.value : frequency.value
  const result = mirrorCanvasValues(grid[component], size.value, direction)
  if (result.bounds) {
    const revisions = domain === 'spatial' ? spatialRevision : frequencyRevision
    const changes = domain === 'spatial' ? spatialChanges : frequencyChanges
    // Flipping permutes the samples; cached extrema and counts stay valid.
    changes[component].add(result.bounds)
    revisions[component]++
  }
  transform(domain)
}

function resize(event) {
  size.value = Number(event.target.value)
  phaseHover.value = null
  for (const axis of ['horizontal', 'vertical']) repeatCounts[axis] = Math.max(2, Math.min(repeatMaximum.value, repeatCounts[axis]))
  if (size.value === 1) repeatEnabled.horizontal = repeatEnabled.vertical = false
  for (const shape of Object.keys(brushSizes)) brushSizes[shape] = Math.min(brushSizes[shape], brushMaximum.value)
  waveFrequency.value = Math.min(waveFrequency.value, size.value / 2)
  gaussianSigma.value = Math.min(gaussianSigma.value, size.value / 2)
  clear()
}

function keyboard(event) {
  if (event.key === 'Tab') {
    event.preventDefault()
    return
  }
  if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input, select, textarea, dialog') || locked.value) return
  if (event.key.toLowerCase() === 'b') tool.value = 'paint'
  if (event.key.toLowerCase() === 'e') tool.value = 'erase'
  if (event.key === '1') selectBrush('dot')
  if (event.key === '2') selectBrush('line')
  if (event.key === '3') selectBrush('wave')
  if (event.key === '4') selectBrush('square')
  if (event.key === '5') selectBrush('gaussian')
  if (event.key === '6') selectBrush('rotation')
  if (event.key === '7') selectBrush('pan')
  if (event.key === '8') selectBrush('stretch')
  if (event.key === '[') { event.preventDefault(); changeBrush(-2) }
  if (event.key === ']') { event.preventDefault(); changeBrush(2) }
}

onMounted(() => {
  try {
    worker = new Worker(new URL('./workers/fft.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }) => {
      if (data.id !== jobId) return
      if (data.error) {
        busy.value = false
        queuedDomain = null
        error.value = data.error
        return
      }
      applyResult(data, pendingTarget)
    }
    worker.onerror = (event) => {
      // A local browser policy can block workers; retain a working editor.
      event.preventDefault()
      if (!worker) return
      worker.terminate()
      worker = null
      spareGrid = null
      busy.value = false
      queuedDomain = null
      transform(pendingDomain)
    }
  } catch {
    worker = null
  }
  window.addEventListener('keydown', keyboard)
})

onBeforeUnmount(() => {
  if (arrowTimer !== null) clearTimeout(arrowTimer)
  if (stretchFrame !== null) cancelAnimationFrame(stretchFrame)
  pendingStretch = stretchSnapshot = null
  if (panFrame !== null) cancelAnimationFrame(panFrame)
  pendingPan = panSnapshot = null
  if (copyFeedbackTimer !== null) clearTimeout(copyFeedbackTimer)
  if (rotationFrame !== null) cancelAnimationFrame(rotationFrame)
  pendingRotation = rotationSnapshot = null
  if (wipeFrame !== null) cancelAnimationFrame(wipeFrame)
  pendingWipe = null
  if (transformFrame !== null) cancelAnimationFrame(transformFrame)
  queuedDomain = null
  worker?.terminate()
  window.removeEventListener('keydown', keyboard)
})
</script>

<template>
  <div class="app-shell mx-auto max-w-[1344px] px-[44px] max-wide:px-[25px] max-tablet:px-[19px] max-small:px-[13px] large:max-w-[1430px]" @dragstart.prevent>
    <main class="pt-5 max-small:pt-[13px]">
      <h1 class="sr-only">Fourier Grid</h1>

      <div class="workbench grid grid-cols-[204px_minmax(0,1fr)] gap-[27px] max-wide:grid-cols-[184px_minmax(0,1fr)] max-wide:gap-5 max-tablet:grid-cols-1">
        <aside class="control-panel" aria-label="Drawing controls">
          <fieldset class="control-section tool-section" :disabled="locked || phaseEnabled || canvasBrush"><legend>Tool</legend><div class="tool-switch">
            <button type="button" aria-label="Paint" title="Paint (B)" :class="{ active: tool === 'paint' }" :aria-pressed="tool === 'paint'" @click="tool = 'paint'"><AppIcon name="brush" /><span>Paint</span><kbd>B</kbd></button>
            <button type="button" aria-label="Erase" title="Erase (E)" :class="{ active: tool === 'erase' }" :aria-pressed="tool === 'erase'" @click="tool = 'erase'"><AppIcon name="erase" /><span>Erase</span><kbd>E</kbd></button>
          </div></fieldset>

          <fieldset class="control-section" :disabled="locked || phaseEnabled || canvasBrush || tool === 'erase'"><legend>Draw mode</legend><div class="mode-switch brush-switch grid grid-cols-3 gap-1 max-tablet:grid-cols-2">
            <button v-for="mode in ['wipe', 'paste', 'add']" :key="mode" type="button" :aria-label="`${mode[0].toUpperCase() + mode.slice(1)} values`" :aria-pressed="drawingMode === mode" :class="{ active: drawingMode === mode, 'max-tablet:col-span-2': mode === 'wipe' }" @click="drawingMode = mode"><span>{{ mode[0].toUpperCase() + mode.slice(1) }}</span></button>
          </div></fieldset>

          <fieldset class="control-section brush-section" :disabled="locked"><legend>Brush</legend><div class="brush-switch grid grid-cols-2 gap-1">
            <template v-for="choice in brushChoices" :key="choice.shape">
              <button type="button" :aria-label="`${choice.label} brush`" :aria-pressed="brushShape === choice.shape" :class="{ active: brushShape === choice.shape, 'col-span-2': choice.shape === 'gaussian' }" @click="selectBrush(choice.shape)"><AppIcon :name="choice.shape" :size="16" /><span>{{ choice.label }}</span></button>
              <fieldset v-if="choice.shape === 'square'" class="phase-section col-span-2" aria-label="Phase rotation">
                <label class="toggle-label compact-toggle-label"><input v-model="phaseEnabled" type="checkbox" aria-label="Phase rotation" :disabled="!phaseAllowed" @change="togglePhase" /><span class="toggle" aria-hidden="true"></span><span>Phase rotation</span></label>
                <p v-if="phaseEnabled" class="mt-2 text-[10px] leading-relaxed text-[#8b9da6]">Drag up/down to rotate phase. The selection stays where you press. <span class="text-[#d9ece5]">{{ Math.round(phaseAngle) }}°</span></p>
                <p v-else class="mt-2 text-[10px] leading-relaxed text-[#8b9da6]">Circle and Square only.</p>
              </fieldset>
            </template>
          </div></fieldset>

          <fieldset v-if="!['wave', 'gaussian', 'rotation', 'pan', 'stretch'].includes(brushShape)" class="control-section" :disabled="locked"><legend>{{ brushShape === 'line' ? 'Line width' : brushShape === 'square' ? 'Side length' : 'Diameter' }} <span class="control-value">{{ brushSize }} <span>px</span></span></legend>
            <div class="size-control"><button class="icon-button" type="button" aria-label="Decrease brush size" :disabled="brushSize <= 1" @click="changeBrush(-2)"><AppIcon name="minus" :size="15" /></button><input v-model.number="brushSize" aria-label="Brush size" type="range" min="1" :max="brushMaximum" step="2" /><button class="icon-button" type="button" aria-label="Increase brush size" :disabled="brushSize >= brushMaximum" @click="changeBrush(2)"><AppIcon name="plus" :size="15" /></button></div>
            <p class="control-hint">Use <kbd>[</kbd> / <kbd>]</kbd> or scroll to resize.</p>
          </fieldset>

          <fieldset v-if="rotatable" class="control-section" :disabled="locked">
            <legend>{{ brushShape === 'square' ? 'Rotation' : 'Direction' }} <span class="control-value">{{ brushAngle }}°</span></legend>
            <div class="rotation-control">
              <button class="icon-button" type="button" :aria-label="`Rotate ${brushShape} counterclockwise`" title="Rotate −5°" @click="rotateBrush(-5)"><AppIcon name="minus" :size="15" /></button>
              <input id="brush-angle" v-model.number="brushAngle" :aria-label="brushShape === 'square' ? 'Square rotation' : 'Brush direction'" type="range" min="0" max="180" step="5" />
              <button class="icon-button" type="button" :aria-label="`Rotate ${brushShape} clockwise`" title="Rotate +5°" @click="rotateBrush(5)"><AppIcon name="plus" :size="15" /></button>
            </div>
            <p class="control-hint">Ctrl+scroll over a grid to rotate.</p>
          </fieldset>
          <fieldset v-if="brushShape === 'wave'" class="control-section" :disabled="locked">
            <legend>Frequency <span class="control-value">{{ waveFrequency }}</span></legend>
            <div class="slider-control">
              <button class="icon-button" type="button" aria-label="Decrease wave frequency" title="Decrease by 0.5 cycles" :disabled="waveFrequency <= 0.5" @click="changeWaveFrequency(-0.5)"><AppIcon name="minus" :size="15" /></button>
              <input v-model.number="waveFrequency" aria-label="Wave frequency" type="range" min="0.5" :max="size / 2" step="0.5" />
              <button class="icon-button" type="button" aria-label="Increase wave frequency" title="Increase by 0.5 cycles" :disabled="waveFrequency >= size / 2" @click="changeWaveFrequency(0.5)"><AppIcon name="plus" :size="15" /></button>
            </div>
            <p class="mt-1 text-[9px] text-muted">Cycles per grid</p><p class="control-hint">Scroll over a grid to adjust.</p>
          </fieldset>

          <fieldset v-if="brushShape === 'gaussian'" class="control-section" :disabled="locked">
            <legend title="Standard deviation (σ)">Std. dev. <span class="control-value">{{ gaussianSigma }} <span>px</span></span></legend>
            <div class="slider-control">
              <button class="icon-button" type="button" aria-label="Decrease Gaussian standard deviation" title="Decrease σ by 0.5 pixels" :disabled="gaussianSigma <= 0.5" @click="changeGaussianSigma(-0.5)"><AppIcon name="minus" :size="15" /></button>
              <input v-model.number="gaussianSigma" aria-label="Gaussian standard deviation" type="range" min="0.5" :max="size / 2" step="0.5" />
              <button class="icon-button" type="button" aria-label="Increase Gaussian standard deviation" title="Increase σ by 0.5 pixels" :disabled="gaussianSigma >= size / 2" @click="changeGaussianSigma(0.5)"><AppIcon name="plus" :size="15" /></button>
            </div>
            <p class="control-hint">Scroll or <kbd>[</kbd> / <kbd>]</kbd> to adjust σ.</p>
          </fieldset>

          <fieldset class="control-section value-section" :disabled="locked || phaseEnabled || canvasBrush"><legend>Paint value <span class="control-value">{{ brushValue > 0 ? '+' : '' }}{{ brushValue.toFixed(1) }}</span></legend>
            <div class="slider-control">
              <button class="icon-button" type="button" aria-label="Decrease paint value" title="Decrease by 0.1" :disabled="brushValue <= -1" @click="changePaintValue(-0.1)"><AppIcon name="minus" :size="15" /></button>
              <input v-model.number="brushValue" aria-label="Paint value" type="range" min="-1" max="1" step="0.1" />
              <button class="icon-button" type="button" aria-label="Increase paint value" title="Increase by 0.1" :disabled="brushValue >= 1" @click="changePaintValue(0.1)"><AppIcon name="plus" :size="15" /></button>
            </div>
            <div class="value-scale"><span class="negative-label">−1</span><span>0</span><span class="positive-label">+1</span></div>
            <p class="control-hint">Shift+scroll over a grid to adjust.</p>
          </fieldset>

          <fieldset class="control-section manipulation-section" :disabled="locked"><legend>Manipulate</legend><div class="brush-switch grid grid-cols-2 gap-1">
            <button v-for="choice in manipulationChoices" :key="choice.shape" type="button" :aria-label="`${choice.label} canvas`" :aria-pressed="brushShape === choice.shape" :class="{ active: brushShape === choice.shape, 'col-span-2': choice.shape === 'stretch' }" @click="selectBrush(choice.shape)"><AppIcon :name="choice.shape" :size="16" /><span>{{ choice.label }}</span></button>
          </div></fieldset>

          <fieldset v-if="stretchBrush" class="control-section stretch-controls">
            <legend>Canvas stretch</legend>
            <p class="text-[10px] leading-relaxed text-[#8b9da6]">Pinned to the origin. Drag left to stretch X, or up to stretch Y. Right/down shrinks.</p>
            <p class="mt-1 font-mono text-[10px]"><span :class="stretchScales.x >= 1 ? 'text-positive' : 'text-negative'">X {{ stretchScales.x.toFixed(2) }}×</span> · <span :class="stretchScales.y >= 1 ? 'text-positive' : 'text-negative'">Y {{ stretchScales.y.toFixed(2) }}×</span></p>
          </fieldset>
          <fieldset v-if="panBrush" class="control-section">
            <legend>Canvas pan <span class="control-value">{{ panOffset.x }}, {{ panOffset.y }} <span>px</span></span></legend>
            <p class="text-[10px] leading-relaxed text-[#8b9da6]">Drag to move pixels. Edges wrap in both directions.</p>
          </fieldset>
          <fieldset v-if="rotationBrush" class="control-section">
            <legend>Canvas rotation <span class="control-value">{{ Math.round(canvasAngle) }}°</span></legend>
            <p class="text-[10px] leading-relaxed text-[#8b9da6]">Drag up ↶ or down ↷. One canvas-height = 360°.</p>
          </fieldset>

          <fieldset class="control-section" aria-label="Symmetry" :disabled="locked">
            <label class="toggle-label compact-toggle-label"><input v-model="symmetryEnabled" type="checkbox" aria-label="Rotational symmetry" @change="toggleSymmetry" /><span class="toggle" aria-hidden="true"></span><span>Symmetry</span></label>
          </fieldset>
          <fieldset v-if="symmetryEnabled" class="control-section" :disabled="locked">
            <legend>Slices <span class="control-value">{{ symmetrySlices }}</span></legend>
            <div class="slider-control">
              <button class="icon-button" type="button" aria-label="Decrease symmetry slices" :disabled="symmetrySlices <= 2" @click="changeSymmetrySlices(-1)"><AppIcon name="minus" :size="15" /></button>
              <input v-model.number="symmetrySlices" aria-label="Symmetry slices" type="range" min="2" max="24" step="1" />
              <button class="icon-button" type="button" aria-label="Increase symmetry slices" :disabled="symmetrySlices >= 24" @click="changeSymmetrySlices(1)"><AppIcon name="plus" :size="15" /></button>
            </div>
          </fieldset>
          <fieldset v-if="symmetryEnabled" class="control-section" :disabled="locked">
            <legend>Slice angle <span class="control-value">{{ symmetryAngle }}°</span></legend>
            <div class="slider-control">
              <button class="icon-button" type="button" aria-label="Decrease symmetry rotation" title="Rotate slices −5°" @click="changeSymmetryAngle(-5)"><AppIcon name="minus" :size="15" /></button>
              <input v-model.number="symmetryAngle" aria-label="Symmetry rotation" type="range" min="0" max="360" step="5" />
              <button class="icon-button" type="button" aria-label="Increase symmetry rotation" title="Rotate slices +5°" @click="changeSymmetryAngle(5)"><AppIcon name="plus" :size="15" /></button>
            </div>
            <p class="control-hint">Rotate the slice boundaries.</p>
          </fieldset>
          <fieldset v-for="{ axis, label, count } in repeatAxes" :key="axis" class="control-section" :aria-label="label" :disabled="locked || size < 2">
            <label class="toggle-label compact-toggle-label"><input v-model="repeatEnabled[axis]" type="checkbox" :aria-label="label" @change="toggleRepeat(axis)" /><span class="toggle" aria-hidden="true"></span><span>{{ label }}</span></label>
            <template v-if="repeatEnabled[axis]">
              <label class="mt-3" :for="`repeat-${axis}`">{{ count }} <span class="control-value">{{ repeatCounts[axis] }}</span></label>
              <div class="slider-control">
                <button class="icon-button" type="button" :aria-label="`Decrease repeat ${count.toLowerCase()}`" :disabled="repeatCounts[axis] <= 2" @click="changeRepeat(axis, -1)"><AppIcon name="minus" :size="15" /></button>
                <input :id="`repeat-${axis}`" v-model.number="repeatCounts[axis]" :aria-label="`Repeat ${count.toLowerCase()}`" type="range" min="2" :max="repeatMaximum" step="1" />
                <button class="icon-button" type="button" :aria-label="`Increase repeat ${count.toLowerCase()}`" :disabled="repeatCounts[axis] >= repeatMaximum" @click="changeRepeat(axis, 1)"><AppIcon name="plus" :size="15" /></button>
              </div>
            </template>
          </fieldset>
          <div class="control-section settings-section"><label for="resolution">Grid size</label><div class="select-wrap"><select id="resolution" :value="size" :disabled="locked" @change="resize"><option v-for="resolution in [1, 2, 3, 4, 7, 8, 15, 16, 31, 32, 63, 64, 127, 128, 255, 256, 511, 512, 1023, 1024]" :key="resolution" :value="resolution">{{ resolution }} × {{ resolution }}</option></select></div><p class="control-hint">Changing size resets the grids.</p>
          </div>
          <div class="control-section clear-controls">
            <div class="settings-toggles">
              <label class="toggle-label"><input v-model="realTime" :disabled="locked" type="checkbox" aria-label="Live updates" /><span class="toggle" aria-hidden="true"></span><span>Live updates</span></label>
              <label class="toggle-label"><input v-model="logarithmic" type="checkbox" aria-label="Boost faint values" /><span class="toggle" aria-hidden="true"></span><span>Boost faint values</span></label>
              <label class="toggle-label"><input v-model="showGridLines" type="checkbox" aria-label="Show grid lines" /><span class="toggle" aria-hidden="true"></span><span>Show grid lines</span></label>
            </div>
            <button class="clear-button" type="button" :disabled="locked" @click="clear"><AppIcon name="reset" :size="16" /> Clear all grids</button>
          </div>
        </aside>

        <section class="grid-workspace" aria-label="Complex Fourier grid editor">
          <div class="domain-headings grid grid-cols-2 gap-4 pb-[15px] pt-0.5 max-small:gap-3">
            <div class="domain-heading"><h2>Drawing</h2></div>
            <div class="transform-link" :data-direction="arrowDirection || 'idle'" role="img" aria-label="Fourier transform from Drawing to Frequencies; inverse Fourier transform from Frequencies to Drawing.">
              <span class="transform-label" :class="{ 'is-active': arrowDirection === 'spatial' }" aria-hidden="true">Fourier<span class="max-small:hidden"> transform</span></span>
              <svg viewBox="0 0 80 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path class="transform-arrow transform-forward" :class="{ 'is-active': arrowDirection === 'spatial' }" d="M4 6h72m-5-4 5 4-5 4" />
                <path class="transform-arrow transform-inverse" :class="{ 'is-active': arrowDirection === 'frequency' }" d="M76 18H4m5-4-5 4 5 4" />
              </svg>
              <span class="transform-label" :class="{ 'is-active': arrowDirection === 'frequency' }" aria-hidden="true">Inverse<span class="max-small:hidden"> transform</span></span>
            </div>
            <div class="domain-heading"><h2>Frequencies</h2></div>
          </div>
          <div class="canvas-grid grid grid-cols-2 gap-x-4 gap-y-[15px] max-small:gap-[11px]">
            <template v-for="component in ['real', 'imaginary']" :key="component">
              <FourierCanvas :values="spatial[component]" :size="size" :revision="spatialRevision[component]" :changes="spatialChanges[component]" :peak="spatialPeak" :range="spatialRanges[component]" :symmetry="symmetry" :repeat="repeat" :clipboard-size="clipboard?.size || 0" :copied="copiedCanvas === `spatial-${component}`" :phase-enabled="phaseEnabled" :phase-point="phaseHover?.domain === 'spatial' ? phaseHover.point : null" domain="spatial" :component="component" :brush="brush" :brush-value="brushValue" :tool="tool" :logarithmic="logarithmic" :hide-grid-lines="!showGridLines" :disabled="canvasDisabled('spatial', component)" @canvas-stretch-start="startCanvasStretch('spatial', component)" @canvas-stretch="stretchCanvas('spatial', component, $event)" @canvas-pan-start="startCanvasPan('spatial', component)" @canvas-pan="panCanvas('spatial', component, $event)" @canvas-rotation-start="startCanvasRotation('spatial', component)" @canvas-rotate="rotateCanvas('spatial', component, $event)" @phase-hover="hoverPhase('spatial', $event)" @phase-start="startPhase('spatial', $event)" @phase-rotate="rotatePhase('spatial', $event)" @stroke-start="beginStroke('spatial', component)" @paint="paint('spatial', component, $event)" @stroke-end="endStroke('spatial')" @rotate="rotateBrush" @adjust-size="adjustBrushSize" @adjust-value="adjustPaintValue" @mirror="mirrorCanvas('spatial', component, $event)" @copy="copyCanvas('spatial', component)" @paste="pasteCanvas('spatial', component)" @paste-inverted="pasteCanvas('spatial', component, true)" @clear="clearCanvas('spatial', component)" />
              <FourierCanvas :values="frequency[component]" :size="size" :revision="frequencyRevision[component]" :changes="frequencyChanges[component]" :peak="frequencyPeak" :range="frequencyRanges[component]" :symmetry="symmetry" :repeat="repeat" :clipboard-size="clipboard?.size || 0" :copied="copiedCanvas === `frequency-${component}`" :phase-enabled="phaseEnabled" :phase-point="phaseHover?.domain === 'frequency' ? phaseHover.point : null" domain="frequency" :component="component" :brush="brush" :brush-value="brushValue" :tool="tool" :logarithmic="logarithmic" :hide-grid-lines="!showGridLines" :disabled="canvasDisabled('frequency', component)" @canvas-stretch-start="startCanvasStretch('frequency', component)" @canvas-stretch="stretchCanvas('frequency', component, $event)" @canvas-pan-start="startCanvasPan('frequency', component)" @canvas-pan="panCanvas('frequency', component, $event)" @canvas-rotation-start="startCanvasRotation('frequency', component)" @canvas-rotate="rotateCanvas('frequency', component, $event)" @phase-hover="hoverPhase('frequency', $event)" @phase-start="startPhase('frequency', $event)" @phase-rotate="rotatePhase('frequency', $event)" @stroke-start="beginStroke('frequency', component)" @paint="paint('frequency', component, $event)" @stroke-end="endStroke('frequency')" @rotate="rotateBrush" @adjust-size="adjustBrushSize" @adjust-value="adjustPaintValue" @mirror="mirrorCanvas('frequency', component, $event)" @copy="copyCanvas('frequency', component)" @paste="pasteCanvas('frequency', component)" @paste-inverted="pasteCanvas('frequency', component, true)" @clear="clearCanvas('frequency', component)" />
            </template>
          </div>
          <div class="workspace-footer"><div class="color-legend"><span><i class="negative-swatch"></i>Negative</span><span><i class="zero-swatch"></i>Zero</span><span><i class="positive-swatch"></i>Positive</span></div></div>
        </section>
      </div>

      <footer class="status-bar">
        <div class="status-text" role="status" aria-live="polite"><span class="status-dot" :class="{ busy: locked, error }"></span>{{ status }}</div>
        <div class="footer-brand">
          <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
          <span>Fourier Grid</span>
        </div>
        <button class="help-button" type="button" @click="helpDialog.showModal()"><AppIcon name="info" :size="16" /><span>Help</span></button>
      </footer>
      <div class="sr-only" aria-live="polite">{{ clipboardNotice }}</div>
      <p id="canvas-instructions" class="sr-only">Drag on any grid to paint. Hover to preview the brush outline. Scroll up to increase or down to decrease circle diameter, square side length, line width, wave frequency, or Gaussian standard deviation. Hold Ctrl while scrolling to rotate Square, Line, or Wave. Hold Shift while scrolling up to increase or down to decrease paint value. Lines, waves, and Gaussians extend across the canvas. Wave frequency is measured in cycles per grid. The other side updates when you release, or while drawing if Live updates is enabled in any drawing mode. Wipe clears the selected canvas and places just the current brush. Right-click and drag to erase. With a grid focused, use arrow keys to move the brush and Enter or Space to paint. B selects paint, E selects erase, 1 selects Circle, 2 selects Line, 3 selects Wave, 4 selects Square, 5 selects Gaussian, and square brackets change circle diameter, square side length, line width, or Gaussian standard deviation.</p>
    </main>

    <dialog ref="helpDialog" class="help-dialog" aria-labelledby="help-title" @click="($event.target === helpDialog) && helpDialog.close()">
      <div class="dialog-header"><button class="icon-button" type="button" aria-label="Close help" @click="helpDialog.close()"><AppIcon name="close" /></button></div>
      <h2 id="help-title">Using the grids</h2>
      <p>The left column shows your drawing. The right shows its frequencies. Draw on either side to update the other.</p>
      <p>The top row holds real values; the bottom holds imaginary values.</p>
      <p>The <strong>Mirror horizontally</strong> and <strong>Mirror vertically</strong> buttons in each canvas's top bar flip its values left/right or top/bottom. Only that component changes, and the transform updates immediately.</p>
      <p>Use <strong>Copy</strong> and <strong>Paste</strong> beside a canvas's trash button to transfer its values to any other canvas. Paste replaces just that real or imaginary component and updates the transform. Paste inverted (the clipboard with a minus sign) multiplies every copied value by −1 before pasting; the copy stays intact. Copies stay available after editing and clearing. The copied and destination grid sizes must match.</p>
      <p>Choose <strong>Circle</strong> or <strong>Square</strong> to paint an area around the pointer. Set its diameter or side length with the size control. Turn the square with the <strong>Rotation</strong> slider or its ±5° buttons.</p>
      <p><strong>Line</strong> draws across the whole canvas through the pointer. Set its width and direction.</p>
      <p><strong>Wave</strong> paints alternating positive and negative bands across the whole canvas. Set its direction and frequency in cycles per grid. In Paste and Add, a stroke keeps the wave aligned to where you first pressed.</p>
      <p><strong>Gaussian</strong> paints a smooth bell across the whole canvas, centered where you press. Its peak is the paint value. Set its standard deviation (σ) in pixels; the preview rings show 1σ and 2σ. In Paste and Add it stays centered where you first pressed; in Wipe it follows the pointer.</p>
      <p><strong>Symmetry</strong> divides every canvas into equal slices. Set the slice count and angle, then draw in one slice to copy it around the center. Paste and Add use the slice where the stroke begins; Wipe follows the pointer's slice. Brushes and erase are clipped to that slice before copying. Changing the controls leaves existing values intact.</p>
      <p><strong>Horizontal repeat</strong> copies across columns; <strong>Vertical repeat</strong> copies down rows. Turn on both for a grid. Adjust each count from 2 to 16, limited by the grid size. Draw within one cell to copy the clipped brush to every other cell. Paste/Add use the starting cell; Wipe follows the current cell. On uneven divisions, cells differ by one pixel and copies keep their relative position. Repeat and rotational symmetry turn each other off. Existing drawings stay intact when settings change.</p>
      <p><strong>Phase rotation</strong> works with Circle or Square. Matching outlines select the real and imaginary values on the side under your pointer. Press and drag up to increase phase, or down to decrease it: one canvas-height is a full 360° turn. The selection stays where you press. Both components rotate together, preserving magnitude, and empty pixels stay empty. Live updates controls transform timing. Phase rotation replaces painting while enabled and cannot combine with symmetry or repeat.</p>
      <p><strong>Stretch</strong> (8), under <strong>Manipulate</strong>, stays pinned to the canvas origin. Press anywhere and drag left to stretch horizontally or up to stretch vertically. Drag right or down to shrink that axis. X and Y change independently; half a canvas of travel doubles or halves an axis, within 0.125×–8×. The fixed origin marker, deformed grid, ellipse, and X/Y arrows show the result. Mint arrows expand and gold arrows compress. Only the selected component changes. Each gesture samples its initial snapshot with smooth interpolation and zero outside the edges. Returning to the starting pointer position restores the exact original. Live updates controls transform timing.</p>
      <p><strong>Pan</strong> (7), under <strong>Manipulate</strong>, moves the canvas you press with the pointer, one grid pixel at a time. Pixels wrap across both horizontal and vertical edges, retaining their exact values. Only the selected real or imaginary component moves. Returning to the starting point restores it. Live updates controls transform timing. With the canvas focused, arrow keys pan by one pixel.</p>
      <p><strong>Rotate</strong> (6), under <strong>Manipulate</strong>, turns the canvas you press about its origin. Drag up for counterclockwise rotation, down for clockwise: one canvas-height is 360°. Only that real or imaginary component changes. The drag uses its starting snapshot; returning to the starting height restores it. Quarter turns retain exact pixels. Other angles use smooth interpolation, with zero beyond the edges. Live updates controls transform timing. Focus a canvas and press Up/Down for ±5° steps.</p>
      <p>Hover over a grid to see the outline before painting. Wave previews show the peaks and troughs. Erase clears the selected brush's area; for Wave and Gaussian, that is the whole canvas.</p>
      <p><strong>Paste</strong> replaces existing values. <strong>Add</strong> adds the brush values without a cap. Each stroke adds once per pixel; start another stroke to add again.</p>
      <p><strong>Wipe</strong> clears the selected canvas and draws just one brush at the pointer. Drag to move it without leaving a trail.</p>
      <p>Scroll over a grid to adjust circle diameter, square side length, line width, wave frequency, or Gaussian standard deviation. Scroll up to increase and down to decrease. Hold <strong>Ctrl</strong> while scrolling to rotate Square, Line, or Wave. Each brush remembers its angle. Hold <strong>Shift</strong> while scrolling to change paint value by 0.1 per step, up to increase and down to decrease. Shift takes priority if Ctrl is also held. In Wipe you can also adjust these while dragging. Page scrolling stays disabled over canvases.</p>
      <p><strong>Live updates</strong> is on by default for every drawing mode. Turn it off to update the other side only when you release the mouse, including in Wipe.</p>
      <p>Mint is positive, gold is negative, and dark is zero. Each column uses its own brightness scale. <strong>Boost faint values</strong> makes small values easier to see.</p>
      <div class="shortcut-list"><span><kbd>B</kbd> Paint</span><span><kbd>E</kbd> Erase</span><span><kbd>1</kbd> Circle</span><span><kbd>2</kbd> Line</span><span><kbd>3</kbd> Wave</span><span><kbd>4</kbd> Square</span><span><kbd>5</kbd> Gaussian</span><span><kbd>6</kbd> Rotate</span><span><kbd>7</kbd> Pan</span><span><kbd>8</kbd> Stretch</span><span><kbd>[</kbd> <kbd>]</kbd> Brush size</span><span>Right-click to erase</span></div>
    </dialog>
  </div>
</template>
