<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { createHistory } from './lib/history.js'
import { toPolar, toCartesian, normalizePolarRegion } from './lib/complex-view.js'
import { createFrameQueue } from './lib/frame-queue.js'
import { drawingModes, drawingModeLabels, isFieldBrush, isGaussianBrush, isBasicBrush, isCanvasBrush, usesStrokeMask } from './lib/brush-modes.js'
import { useFullscreen } from './lib/use-fullscreen.js'
import AppIcon from './components/AppIcon.vue'
import FourierCanvas from './components/FourierCanvas.vue'
import { fft2D } from './lib/fft.browser.js'
import { createGrid, gridRanges, valueRange, gridPeakFromRanges, updateValueRange } from './lib/grid.js'
import { paintSymmetricStroke } from './lib/symmetry.js'
import { paintRepeatedStroke } from './lib/repeat.js'
import { createCanvasRotation, rotateCanvasValues } from './lib/rotation.js'
import { createCanvasPan, panCanvasValues } from './lib/pan.js'
import { createCanvasStretch, stretchCanvasValues } from './lib/stretch.js'
import { mirrorCanvasValues } from './lib/mirror.js'
import { isRadialBrush } from './lib/radial.js'
import { createDirtyRegion, mergeBounds } from './lib/render.js'

const size = ref(127)
const controlsExpanded = ref(true)
const { active: fullscreen, supported: fullscreenSupported, error: fullscreenError, toggle: toggleFullscreen } = useFullscreen()
const polarView = reactive({ spatial: false, frequency: false })
const domains = ['spatial', 'frequency']
const components = ['real', 'imaginary']
function domainState(domain) { return domainStates[domain] }
function fullBounds() { return { left: 0, top: 0, right: size.value - 1, bottom: size.value - 1 } }

// All edit paths publish changes through the same range/render bookkeeping.
function publishEdit(domain, component, result) {
  if (!result.bounds) return null
  const state = domainState(domain)
  if (result.range || result.newMin !== undefined) state.ranges[component] = updateValueRange(state.grid.value[component], state.ranges[component], result)
  state.changes[component].add(result.bounds)
  state.revisions[component]++
  if (drawing.value) strokeChanged = true
  return result.bounds
}
function normalizeEdits(domain, bounds) {
  if (bounds && polarView[domain]) {
    const normalized = normalizePolarRegion(domainState(domain).grid.value, size.value, bounds)
    for (const component of components) publishEdit(domain, component, normalized[component])
  }
}
function finishEdit(domain, bounds) {
  if (!bounds) return
  normalizeEdits(domain, bounds)
  if (realTime.value) scheduleTransform(domain)
}
function refreshDomain(domain) {
  const state = domainState(domain)
  Object.assign(state.ranges, gridRanges(state.grid.value))
  for (const component of components) {
    state.revisions[component]++
    state.changes[component].add({ left: 0, top: 0, right: size.value - 1, bottom: size.value - 1 })
  }
}
function switchView(domain) {
  if (locked.value) return
  const state = domainState(domain)
  state.grid.value = polarView[domain] ? toCartesian(state.grid.value) : toPolar(state.grid.value)
  polarView[domain] = !polarView[domain]
  refreshDomain(domain)
}
function viewPeak(domain, component) {
  if (polarView[domain]) return component === 'imaginary' ? Math.PI : Math.max(0, domainState(domain).ranges.real.max)
  return domain === 'spatial' ? spatialPeak.value : frequencyPeak.value
}
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
const domainStates = {
  spatial: { grid: spatial, ranges: spatialRanges, revisions: spatialRevision, changes: spatialChanges },
  frequency: { grid: frequency, ranges: frequencyRanges, revisions: frequencyRevision, changes: frequencyChanges },
}
const tool = ref('paint')
const drawingMode = ref('wipe')
const linkedEditing = reactive({ spatial: false, frequency: false })
function editedComponents(domain, component) {
  return linkedEditing[domain] ? components : [component]
}
function toggleLinkedEditing(domain) {
  if (!locked.value) linkedEditing[domain] = !linkedEditing[domain]
}
const brushShape = ref('dot')
const noiseEnabled = ref(false)
const noiseSeed = ref(0)
const brushGroups = [
  { label: 'Basic brushes', choices: [{ shape: 'dot', label: 'Circle' }, { shape: 'square', label: 'Square' }, { shape: 'fill', label: 'Fill' }] },
  { label: 'Advanced brushes', choices: [{ shape: 'line', label: 'Line' }, { shape: 'wave', label: 'Wave' }, { shape: 'gaussian', label: 'Gaussian' }, { shape: 'inverted-gaussian', label: 'Inverted Gaussian' }, { shape: 'radial-sine', label: 'Radial sine' }, { shape: 'radial-sinc', label: 'Radial sinc' }] },
]
const manipulationChoices = [{ shape: 'rotation', label: 'Rotate' }, { shape: 'pan', label: 'Pan' }, { shape: 'stretch', label: 'Stretch' }]
const rotationBrush = computed(() => brushShape.value === 'rotation')
const panBrush = computed(() => brushShape.value === 'pan')
const stretchBrush = computed(() => brushShape.value === 'stretch')
const canvasBrush = computed(() => isCanvasBrush(brushShape.value))
const stretchScales = reactive({ x: 1, y: 1 })
const panOffset = reactive({ x: 0, y: 0 })
const canvasAngle = ref(0)
const rotatable = computed(() => ['square', 'line', 'wave'].includes(brushShape.value))
const brushSizes = reactive({ dot: 9, square: 9, line: 3 })
const brushAngles = reactive({ square: 0, line: 0, wave: 0 })
const brushAngle = computed({
  get: () => brushAngles[brushShape.value] || 0,
  set: value => { if (rotatable.value) brushAngles[brushShape.value] = value },
})
const waveFrequency = ref(16)
const radialBrush = computed(() => isRadialBrush(brushShape.value))
const radialFrequencies = reactive({ 'radial-sine': 8, 'radial-sinc': 4 })
const radialPhases = reactive({ 'radial-sine': 0, 'radial-sinc': 0 })
const fieldFrequency = computed({
  get: () => radialBrush.value ? radialFrequencies[brushShape.value] : waveFrequency.value,
  set: value => { if (radialBrush.value) radialFrequencies[brushShape.value] = value; else waveFrequency.value = value },
})
const radialPhase = computed({
  get: () => radialPhases[brushShape.value] || 0,
  set: value => { if (radialBrush.value) radialPhases[brushShape.value] = Math.max(-180, Math.min(180, value)) },
})
const gaussianSigma = ref(4)
const brushMaximum = computed(() => Math.max(1, size.value - 1))
const brushSize = computed({
  get: () => (isFieldBrush(brushShape.value) || canvasBrush.value) ? size.value : brushSizes[brushShape.value] ?? 1,
  set: value => {
    if (!brushShape.value || isFieldBrush(brushShape.value) || canvasBrush.value) return
    brushSizes[brushShape.value] = Math.max(1, Math.min(brushMaximum.value, Math.round((value - 1) / 2) * 2 + 1))
  },
})
const brush = computed(() => ({ shape: brushShape.value, size: brushSize.value, angle: brushAngle.value, wavelength: size.value / fieldFrequency.value, phase: radialPhase.value, sigma: gaussianSigma.value, mode: drawingMode.value, noise: noiseEnabled.value && isBasicBrush(brushShape.value), noiseSeed: noiseSeed.value }))
const brushValue = ref(1)
const logarithmic = ref(true)
const showGridLines = ref(true)
const snapToGrid = ref(true)
const realTime = ref(true)
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
  if (repeatEnabled[axis]) { symmetryEnabled.value = false }
}
function toggleSymmetry() {
  if (symmetryEnabled.value) { repeatEnabled.horizontal = repeatEnabled.vertical = false }
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
let wipeFootprints = null
let strokeChanged = false
let spareGrid = null

const locked = computed(() => busy.value || drawing.value)
const history = createHistory()
const historyRevision = ref(0)
const canUndo = computed(() => { void historyRevision.value; return history.canUndo })
const canRedo = computed(() => { void historyRevision.value; return history.canRedo })
function historyState() {
  return { size: size.value, views: { ...polarView }, spatial: spatial.value, frequency: frequency.value }
}
function beginHistory() { history.begin(historyState()) }
function commitHistory(domain = null) {
  if (history.commit(historyState(), domain)) historyRevision.value++
}
function restoreHistory(direction) {
  if (locked.value) return
  const restored = history[direction](historyState())
  if (!restored) return
  size.value = restored.size
  for (const domain of domains) {
    const sameView = restored.views[domain] === polarView[domain]
    domainState(domain).grid.value = sameView ? restored[domain]
      : polarView[domain] ? toPolar(restored[domain]) : toCartesian(restored[domain])
    refreshDomain(domain)
  }
  spareGrid = null
  error.value = ''
  canvasAngle.value = 0
  stretchScales.x = stretchScales.y = 1
  panOffset.x = panOffset.y = 0
  clampToolsToGrid()
  historyRevision.value++
}

const status = computed(() => error.value || fullscreenError.value || (drawing.value ? (realTime.value ? 'Drawing' : 'Release to update') : busy.value ? 'Updating…' : 'Ready'))
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
  const state = domainState(target)
  // Retired output buffers become the next worker input snapshot. Convert the
  // returned arrays in place so polar output doesn't allocate another full pair.
  if (worker) spareGrid = state.grid.value
  const output = polarView[target] ? toPolar(result, result) : result
  state.grid.value = { real: output.real, imaginary: output.imaginary }
  Object.assign(state.ranges, polarView[target] ? gridRanges(output) : result.ranges ?? gridRanges(output))
  for (const component of components) state.revisions[component]++
  busy.value = false
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
  const stored = inverse ? frequency.value : spatial.value
  const id = ++jobId
  const target = pendingTarget
  if (worker) {
    const reusable = spareGrid?.real.length === stored.real.length && spareGrid?.imaginary.length === stored.imaginary.length
    const real = reusable ? spareGrid.real : new Float64Array(stored.real.length)
    const imaginary = reusable ? spareGrid.imaginary : new Float64Array(stored.imaginary.length)
    spareGrid = null
    if (polarView[domain]) toCartesian(stored, { real, imaginary })
    else { real.set(stored.real); imaginary.set(stored.imaginary) }
    worker.postMessage({ id, size: size.value, real, imaginary, inverse }, [real.buffer, imaginary.buffer])
  } else {
    try {
      const source = polarView[domain] ? toCartesian(stored) : stored
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
  beginHistory()
  if (brush.value.noise) noiseSeed.value = (Math.random() * 0x100000000) >>> 0
  strokeChanged = false
  wipeFootprints = {}
  drawing.value = true
  activeGrid.value = `${domain}-${component}`
  strokeMask = !canvasBrush.value && usesStrokeMask(drawingMode.value)
    ? Object.fromEntries(editedComponents(domain, component).map(key => [key, new Uint8Array(size.value * size.value)])) : null
}

const manipulations = {
  rotation: { snapshot: createCanvasRotation, apply: rotateCanvasValues },
  pan: { snapshot: createCanvasPan, apply: (values, snapshot, offset) => panCanvasValues(values, snapshot, offset.x, offset.y) },
  stretch: { snapshot: createCanvasStretch, apply: stretchCanvasValues },
}
let manipulation = null
const manipulationQueue = createFrameQueue(value => {
  if (!manipulation) return
  const { domain, snapshots, operation } = manipulation
  const grid = domainState(domain).grid.value
  let bounds = null
  for (const component of Object.keys(snapshots)) {
    const result = operation.apply(grid[component], snapshots[component], value)
    bounds = mergeBounds(bounds, publishEdit(domain, component, result))
  }
  finishEdit(domain, bounds)
})
function startManipulation(domain, component, kind) {
  const operation = manipulations[kind], grid = domainState(domain).grid.value
  manipulation = { domain, kind, operation, snapshots: Object.fromEntries(editedComponents(domain, component).map(key => [key, operation.snapshot(grid[key], size.value)])) }
  canvasAngle.value = 0
  panOffset.x = panOffset.y = 0
  stretchScales.x = stretchScales.y = 1
}
function manipulate(kind, value) {
  if (manipulation?.kind !== kind) return
  if (kind === 'rotation') canvasAngle.value = value * 180 / Math.PI
  else if (kind === 'pan') Object.assign(panOffset, value)
  else { stretchScales.x = value.scaleX; stretchScales.y = value.scaleY }
  manipulationQueue.set(value)
}

const wipeQueue = createFrameQueue(({ domain, component, stroke }) => applyPaint(domain, component, stroke))
function paint(domain, component, stroke) {
  if (!brushShape.value) return
  if (drawingMode.value === 'wipe' && tool.value !== 'erase' && !stroke.erase) wipeQueue.set({ domain, component, stroke })
  else applyPaint(domain, component, stroke)
}
function applyPaint(domain, selectedComponent, stroke) {
  const grid = domainState(domain).grid.value
  const erase = tool.value === 'erase' || stroke.erase
  const origin = stroke.origin || stroke.from
  const repeating = repeat.value.columns > 1 || repeat.value.rows > 1
  let bounds = null
  for (const component of editedComponents(domain, selectedComponent)) {
    const options = { visited: strokeMask?.[component], erase, clearBounds: wipeFootprints?.[component] }
    const result = repeating
      ? paintRepeatedStroke(grid[component], size.value, stroke.from, stroke.to, brush.value, brushValue.value, origin, repeat.value, options)
      : paintSymmetricStroke(grid[component], size.value, stroke.from, stroke.to, brush.value, brushValue.value, origin, symmetry.value, options)
    if (wipeFootprints && result.contentBounds !== undefined) wipeFootprints[component] = result.contentBounds
    bounds = mergeBounds(bounds, publishEdit(domain, component, result))
  }
  finishEdit(domain, bounds)
}

function endStroke(domain) {
  wipeQueue.flush()
  manipulationQueue.flush()
  manipulation = null
  drawing.value = false
  activeGrid.value = ''
  strokeMask = null
  wipeFootprints = null
  if (transformFrame !== null) {
    cancelAnimationFrame(transformFrame)
    transformFrame = null
  }
  commitHistory(domain)
  // Even if a drag returns to its initial values, any live intermediate result
  // must be replaced by the final one. Completely unchanged strokes need no FFT.
  if (strokeChanged) transform(domain)
}

function changeBrush(change) {
  if (!brushShape.value || canvasBrush.value) return
  if (isGaussianBrush(brushShape.value)) changeGaussianSigma(change / 4)
  else brushSize.value += change
}

function adjustBrushSize(steps) {
  if (!brushShape.value || canvasBrush.value) return
  if (locked.value && !(drawing.value && drawingMode.value === 'wipe')) return
  if (isGaussianBrush(brushShape.value)) {
    changeGaussianSigma(steps * 0.5)
  } else if (brushShape.value === 'wave' || radialBrush.value) {
    changeWaveFrequency(steps * 0.5)
  } else {
    changeBrush(steps * 2)
  }
}

function changeWaveFrequency(change) {
  fieldFrequency.value = Math.max(0.5, Math.min(size.value / 2, fieldFrequency.value + change))
}

function adjustRadialPhase(degrees) {
  if (!radialBrush.value || (locked.value && !(drawing.value && drawingMode.value === 'wipe'))) return
  radialPhase.value += degrees
}

function changeGaussianSigma(change) {
  gaussianSigma.value = Math.max(0.5, Math.min(size.value / 2, gaussianSigma.value + change))
}

function changePaintValue(change) {
  brushValue.value = Math.max(-1, Math.min(1, Math.round((brushValue.value + change) * 10) / 10))
}

function adjustPaintValue(steps) {
  if (!brushShape.value || canvasBrush.value) return
  if (locked.value && !(drawing.value && drawingMode.value === 'wipe')) return
  changePaintValue(steps * 0.1)
}

function changeSymmetrySlices(change) {
  symmetrySlices.value = Math.max(2, Math.min(24, symmetrySlices.value + change))
}

function changeSymmetryAngle(change) {
  symmetryAngle.value = ((symmetryAngle.value + change) % 360 + 360) % 360
}

function selectBrush(shape, toggle = false) {
  if (locked.value) return
  brushShape.value = toggle && brushShape.value === shape ? null : shape
}

function rotateBrush(degrees) {
  if (!rotatable.value || (locked.value && !(drawing.value && drawingMode.value === 'wipe'))) return
  brushAngle.value = ((brushAngle.value + degrees) % 180 + 180) % 180
}

function clear() {
  if (locked.value) return
  beginHistory()
  spatial.value = createGrid(size.value)
  frequency.value = createGrid(size.value)
  spareGrid = null
  error.value = ''
  updateRanges()
  spatialRevision.real++
  spatialRevision.imaginary++
  frequencyRevision.real++
  frequencyRevision.imaginary++
  commitHistory()
}

// Toolbar actions affect one displayed component and transform immediately.
function editCanvas(domain, component, edit) {
  if (locked.value) return
  beginHistory()
  const state = domainState(domain)
  const result = edit(state.grid.value[component], state.ranges[component])
  const bounds = publishEdit(domain, component, result)
  normalizeEdits(domain, bounds)
  commitHistory(domain)
  if (bounds) transform(domain)
}
function clearCanvas(domain, component) {
  editCanvas(domain, component, (values, range) => {
    if (range.min === 0 && range.max === 0) return { bounds: null }
    values.fill(0)
    return { bounds: fullBounds(), range: { min: 0, max: 0, minCount: values.length, maxCount: values.length } }
  })
}
function copyCanvas(domain, component) {
  if (locked.value) return
  const state = domainState(domain)
  clipboard.value = { size: size.value, values: state.grid.value[component].slice(), range: { ...state.ranges[component] } }
  copiedCanvas.value = `${domain}-${component}`
  clipboardNotice.value = `Copied ${domain}, ${component}, ${size.value} by ${size.value}.`
  if (copyFeedbackTimer !== null) clearTimeout(copyFeedbackTimer)
  copyFeedbackTimer = setTimeout(() => { copiedCanvas.value = ''; copyFeedbackTimer = null }, 1600)
}
function pasteCanvas(domain, component) {
  if (clipboard.value?.size !== size.value) return
  editCanvas(domain, component, destination => {
    const { values } = clipboard.value
    let changed = false
    for (let i = 0; i < values.length; i++) {
      const next = destination[i] + values[i]
      if (next !== destination[i]) changed = true
      destination[i] = next
    }
    clipboardNotice.value = `Added copied values into ${domain}, ${component}.`
    return { bounds: changed ? fullBounds() : null, range: changed ? valueRange(destination) : null }
  })
}
function invertCanvas(domain, component) {
  editCanvas(domain, component, (values, range) => {
    if (range.min === 0 && range.max === 0) return { bounds: null }
    for (let i = 0; i < values.length; i++) values[i] = -values[i]
    return { bounds: fullBounds(), range: { min: -range.max, max: -range.min, minCount: range.maxCount, maxCount: range.minCount } }
  })
}
function mirrorCanvas(domain, component, direction) {
  // Mirror and Pan permute samples, so they keep the cached extrema and counts.
  editCanvas(domain, component, values => mirrorCanvasValues(values, size.value, direction))
}

function clampToolsToGrid() {
  for (const axis of ['horizontal', 'vertical']) repeatCounts[axis] = Math.max(2, Math.min(repeatMaximum.value, repeatCounts[axis]))
  if (size.value === 1) repeatEnabled.horizontal = repeatEnabled.vertical = false
  for (const shape of Object.keys(brushSizes)) brushSizes[shape] = Math.min(brushSizes[shape], brushMaximum.value)
  waveFrequency.value = Math.min(waveFrequency.value, size.value / 2)
  for (const shape of Object.keys(radialFrequencies)) radialFrequencies[shape] = Math.min(radialFrequencies[shape], size.value / 2)
  gaussianSigma.value = Math.min(gaussianSigma.value, size.value / 2)
}

function resize(event) {
  if (locked.value) return
  beginHistory()
  size.value = Number(event.target.value)
  clampToolsToGrid()
  clear()
}

function keyboard(event) {
  if (event.key === 'Tab') {
    event.preventDefault()
    return
  }
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.target.closest('textarea, [contenteditable="true"], dialog, input:not([type="range"]):not([type="checkbox"])')) {
    const key = event.key.toLowerCase()
    if (key === 'z' || key === 'y') {
      event.preventDefault()
      restoreHistory(key === 'y' || event.shiftKey ? 'redo' : 'undo')
      return
    }
  }
  if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input, select, textarea, dialog') || locked.value) return
  if (event.key.toLowerCase() === 'f') { event.preventDefault(); toggleFullscreen(); return }
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
  manipulationQueue.clear()
  manipulation = null
  if (copyFeedbackTimer !== null) clearTimeout(copyFeedbackTimer)
  wipeQueue.clear()
  if (transformFrame !== null) cancelAnimationFrame(transformFrame)
  queuedDomain = null
  worker?.terminate()
  window.removeEventListener('keydown', keyboard)
})
</script>

<template>
  <div class="app-shell" @dragstart.prevent>
    <main class="app-main">
      <h1 class="sr-only">Fourier Grid: Interactive 2D Fourier Transform</h1>

      <div class="workbench">
        <aside class="control-panel" aria-label="Drawing controls">
          <div class="control-section grid-size-section"><label for="resolution">Grid size</label><div class="select-wrap"><select id="resolution" :value="size" :disabled="locked" @change="resize"><option v-for="resolution in [1, 2, 3, 4, 7, 8, 15, 16, 31, 32, 63, 64, 127, 128, 255, 256, 511, 512, 1023, 1024]" :key="resolution" :value="resolution">{{ resolution }} × {{ resolution }}</option></select></div><p class="control-hint">Changing size resets the grids.</p>
          </div>
          <div class="control-section clear-controls">
            <div class="settings-toggles">
              <label class="toggle-label"><input v-model="realTime" :disabled="locked" type="checkbox" aria-label="Live updates" /><span class="toggle" aria-hidden="true"></span><span>Live updates</span></label>
              <label class="toggle-label"><input v-model="logarithmic" type="checkbox" aria-label="Boost faint values" /><span class="toggle" aria-hidden="true"></span><span>Boost faint values</span></label>
              <label class="toggle-label"><input v-model="showGridLines" type="checkbox" aria-label="Show grid lines" /><span class="toggle" aria-hidden="true"></span><span>Show grid lines</span></label>
              <label class="toggle-label"><input v-model="snapToGrid" type="checkbox" aria-label="Snap to grid" title="Snap brushes to the center axes and manipulations to their starting X/Y lines" /><span class="toggle" aria-hidden="true"></span><span>Snap to grid</span></label>
            </div>
            <div class="history-controls brush-switch grid grid-cols-2 gap-1 mt-3">
              <button type="button" aria-label="Undo" title="Undo (Ctrl/Cmd+Z)" :disabled="locked || !canUndo" @click="restoreHistory('undo')"><AppIcon name="undo" :size="15" /><span>Undo</span></button>
              <button type="button" aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z or Ctrl+Y)" :disabled="locked || !canRedo" @click="restoreHistory('redo')"><AppIcon name="redo" :size="15" /><span>Redo</span></button>
            </div>
            <button class="clear-button" type="button" aria-label="Clear all grids" title="Clear all grids" :disabled="locked" @click="clear"><AppIcon name="trash" :size="15" /><span>Clear all</span></button>
          </div>
          <button class="controls-toggle" type="button" :aria-expanded="controlsExpanded" aria-controls="editor-controls" :aria-label="controlsExpanded ? 'Collapse tools' : 'Expand tools'" @click="controlsExpanded = !controlsExpanded">
            <span>Tools</span><AppIcon name="chevron" :size="14" :class="{ 'rotate-180': controlsExpanded }" />
          </button>
          <div id="editor-controls" v-show="controlsExpanded" class="controls-body">

            <fieldset class="control-section tool-section" aria-label="Paint and erase" :disabled="locked || !brushShape || canvasBrush"><div class="tool-switch">
              <button type="button" aria-label="Paint" title="Paint (B)" :class="{ active: tool === 'paint' }" :aria-pressed="tool === 'paint'" @click="tool = 'paint'"><AppIcon name="brush" /><span>Paint</span><kbd>B</kbd></button>
              <button type="button" aria-label="Erase" title="Erase (E)" :class="{ active: tool === 'erase' }" :aria-pressed="tool === 'erase'" @click="tool = 'erase'"><AppIcon name="erase" /><span>Erase</span><kbd>E</kbd></button>
            </div></fieldset>

            <fieldset class="control-section" :disabled="locked || !brushShape || canvasBrush || tool === 'erase'"><legend>Draw mode</legend><div class="mode-switch brush-switch grid grid-cols-2 gap-1">
              <button v-for="mode in drawingModes" :key="mode" type="button" :aria-label="`${drawingModeLabels[mode]} values`" :aria-pressed="drawingMode === mode" :class="{ active: drawingMode === mode }" @click="drawingMode = mode"><span>{{ drawingModeLabels[mode] }}</span></button>
            </div></fieldset>

            <fieldset class="control-section brush-section" :disabled="locked"><legend>Brushes</legend><div v-for="(group, index) in brushGroups" :key="group.label" class="brush-switch grid grid-cols-2 gap-1" :class="{ 'mt-3': index > 0 }">
              <template v-for="choice in group.choices" :key="choice.shape">
                <button type="button" :aria-label="`${choice.label} brush`" :aria-pressed="brushShape === choice.shape" :class="{ active: brushShape === choice.shape, 'col-span-2': choice.shape === 'fill' }" @click="selectBrush(choice.shape, true)"><AppIcon :name="choice.shape" :size="16" /><span>{{ choice.label }}</span></button>
                <fieldset v-if="choice.shape === 'fill' && isBasicBrush(brushShape)" class="brush-option-section col-span-2" aria-label="Noise brush option">
                  <label class="toggle-label compact-toggle-label"><input v-model="noiseEnabled" type="checkbox" aria-label="Noise" :disabled="!isBasicBrush(brushShape)" /><span class="toggle" aria-hidden="true"></span><span>Noise</span></label>
                </fieldset>
              </template>
            </div></fieldset>

            <fieldset v-if="brushShape && !isFieldBrush(brushShape) && !canvasBrush" class="control-section" :disabled="locked"><legend>{{ brushShape === 'line' ? 'Line width' : brushShape === 'square' ? 'Side length' : 'Diameter' }} <span class="control-value">{{ brushSize }} <span>px</span></span></legend>
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
            <fieldset v-if="brushShape === 'wave' || radialBrush" class="control-section" :disabled="locked">
              <legend>Frequency <span class="control-value">{{ fieldFrequency }}</span></legend>
              <div class="slider-control">
                <button class="icon-button" type="button" :aria-label="radialBrush ? 'Decrease radial frequency' : 'Decrease wave frequency'" title="Decrease by 0.5 cycles" :disabled="fieldFrequency <= 0.5" @click="changeWaveFrequency(-0.5)"><AppIcon name="minus" :size="15" /></button>
                <input v-model.number="fieldFrequency" :aria-label="radialBrush ? 'Radial frequency' : 'Wave frequency'" type="range" min="0.5" :max="size / 2" step="0.5" />
                <button class="icon-button" type="button" :aria-label="radialBrush ? 'Increase radial frequency' : 'Increase wave frequency'" title="Increase by 0.5 cycles" :disabled="fieldFrequency >= size / 2" @click="changeWaveFrequency(0.5)"><AppIcon name="plus" :size="15" /></button>
              </div>
              <p class="mt-1 text-[9px] text-muted">Cycles per grid</p><p class="control-hint">Scroll over a grid to adjust.</p>
            </fieldset>

            <fieldset v-if="radialBrush" class="control-section" :disabled="locked">
              <legend>Phase <span class="control-value">{{ radialPhase }}°</span></legend>
              <div class="slider-control">
                <button class="icon-button" type="button" aria-label="Decrease radial phase" :disabled="radialPhase <= -180" @click="adjustRadialPhase(-5)"><AppIcon name="minus" :size="15" /></button>
                <input v-model.number="radialPhase" aria-label="Radial phase" type="range" min="-180" max="180" step="5" />
                <button class="icon-button" type="button" aria-label="Increase radial phase" :disabled="radialPhase >= 180" @click="adjustRadialPhase(5)"><AppIcon name="plus" :size="15" /></button>
              </div>
              <p class="control-hint">Ctrl+scroll over a grid to adjust phase.</p>
            </fieldset>

            <fieldset v-if="isGaussianBrush(brushShape)" class="control-section" :disabled="locked">
              <legend title="Standard deviation (σ)">Std. dev. <span class="control-value">{{ gaussianSigma }} <span>px</span></span></legend>
              <div class="slider-control">
                <button class="icon-button" type="button" aria-label="Decrease Gaussian standard deviation" title="Decrease σ by 0.5 pixels" :disabled="gaussianSigma <= 0.5" @click="changeGaussianSigma(-0.5)"><AppIcon name="minus" :size="15" /></button>
                <input v-model.number="gaussianSigma" aria-label="Gaussian standard deviation" type="range" min="0.5" :max="size / 2" step="0.5" />
                <button class="icon-button" type="button" aria-label="Increase Gaussian standard deviation" title="Increase σ by 0.5 pixels" :disabled="gaussianSigma >= size / 2" @click="changeGaussianSigma(0.5)"><AppIcon name="plus" :size="15" /></button>
              </div>
              <p class="control-hint">Scroll or <kbd>[</kbd> / <kbd>]</kbd> to adjust σ.</p>
            </fieldset>

            <fieldset v-if="brushShape" class="control-section value-section" :disabled="locked || !brushShape || canvasBrush"><legend>Paint value <span class="control-value">{{ brushValue > 0 ? '+' : '' }}{{ brushValue.toFixed(1) }}</span></legend>
              <div class="slider-control">
                <button class="icon-button" type="button" aria-label="Decrease paint value" title="Decrease by 0.1" :disabled="brushValue <= -1" @click="changePaintValue(-0.1)"><AppIcon name="minus" :size="15" /></button>
                <input v-model.number="brushValue" aria-label="Paint value" type="range" min="-1" max="1" step="0.1" />
                <button class="icon-button" type="button" aria-label="Increase paint value" title="Increase by 0.1" :disabled="brushValue >= 1" @click="changePaintValue(0.1)"><AppIcon name="plus" :size="15" /></button>
              </div>
              <div class="value-scale"><span class="negative-label">−1</span><span>0</span><span class="positive-label">+1</span></div>
              <p class="control-hint">Shift+scroll over a grid to adjust.</p>
            </fieldset>

            <fieldset class="control-section" :class="{ 'is-inactive-toggle': !symmetryEnabled }" aria-label="Symmetry" :disabled="locked">
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
            <fieldset v-for="{ axis, label, count } in repeatAxes" :key="axis" class="control-section" :class="{ 'is-inactive-toggle': !repeatEnabled[axis] }" :aria-label="label" :disabled="locked || size < 2">
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

            <fieldset class="control-section manipulation-section" :disabled="locked"><legend>Manipulate</legend>
              <div class="brush-switch grid grid-cols-2 gap-1">
              <button v-for="choice in manipulationChoices" :key="choice.shape" type="button" :aria-label="`${choice.label} canvas`" :aria-pressed="brushShape === choice.shape" :class="{ active: brushShape === choice.shape, 'col-span-2': choice.shape === 'stretch' }" @click="selectBrush(choice.shape, true)"><AppIcon :name="choice.shape" :size="16" /><span>{{ choice.label }}</span></button>
            </div></fieldset>

            <fieldset v-if="stretchBrush" class="control-section stretch-controls">
              <legend>Canvas stretch</legend>
              <p class="text-[10px] leading-relaxed text-[#8b9da6]">Pinned to the origin. Drag right to stretch X, or up to stretch Y. Left/down shrinks.</p>
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


          </div>
        </aside>

        <section class="grid-workspace" aria-label="Complex Fourier grid editor">
          <div class="domain-headings">
            <div v-for="domain in domains" :key="domain" class="domain-heading" :data-domain="domain">
              <div class="domain-heading-title"><AppIcon :name="domain === 'spatial' ? 'waveform' : 'spectrum'" :size="20" /><h2>{{ domain === 'spatial' ? 'Spatial' : 'Frequency' }}<span class="max-small:block"> domain</span></h2></div>
              <div class="brush-switch"><button type="button" class="w-full" :aria-label="`${domain === 'spatial' ? 'Spatial' : 'Frequency'} magnitude/phase view`" :aria-pressed="polarView[domain]" :class="{ active: polarView[domain] }" :disabled="locked" title="Switch between Real / Imaginary and Magnitude / Phase" @click="switchView(domain)"><span>{{ polarView[domain] ? 'Magnitude / Phase' : 'Real / Imaginary' }}</span><AppIcon name="swap" :size="14" /></button></div>
            </div>
            <div class="transform-link" :data-direction="arrowDirection || 'idle'" role="img" aria-label="Forward transform from Spatial to Frequency; inverse transform from Frequency to Spatial.">
              <span class="transform-label" :class="{ 'is-active': arrowDirection === 'spatial' }" aria-hidden="true">Forward<span class="max-small:hidden"> transform</span></span>
              <svg viewBox="0 0 80 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path class="transform-arrow transform-forward" :class="{ 'is-active': arrowDirection === 'spatial' }" d="M4 6h72m-5-4 5 4-5 4" />
                <path class="transform-arrow transform-inverse" :class="{ 'is-active': arrowDirection === 'frequency' }" d="M76 18H4m5-4-5 4 5 4" />
              </svg>
              <span class="transform-label" :class="{ 'is-active': arrowDirection === 'frequency' }" aria-hidden="true">Inverse<span class="max-small:hidden"> transform</span></span>
            </div>
          </div>
          <div class="canvas-grid">
            <template v-for="component in components" :key="component">
              <FourierCanvas v-for="domain in domains" :key="domain" :domain="domain" :component="component"
                :values="domainState(domain).grid.value[component]" :size="size" :revision="domainState(domain).revisions[component]"
                :changes="domainState(domain).changes[component]" :peak="viewPeak(domain, component)" :range="domainState(domain).ranges[component]"
                :symmetry="symmetry" :repeat="repeat" :clipboard-size="clipboard?.size || 0" :copied="copiedCanvas === `${domain}-${component}`"
                :polar="polarView[domain]"
                :brush="brush" :brush-value="brushValue" :tool="tool" :logarithmic="logarithmic" :hide-grid-lines="!showGridLines" :snap-to-grid="snapToGrid" :lock-manipulation-to-grid="snapToGrid"
                :disabled="canvasDisabled(domain, component)" :linked-editing="linkedEditing[domain]"
                @toggle-link="toggleLinkedEditing(domain)"
                @canvas-stretch-start="startManipulation(domain, component, 'stretch')" @canvas-stretch="manipulate('stretch', $event)"
                @canvas-pan-start="startManipulation(domain, component, 'pan')" @canvas-pan="manipulate('pan', $event)"
                @canvas-rotation-start="startManipulation(domain, component, 'rotation')" @canvas-rotate="manipulate('rotation', $event)"
                @stroke-start="beginStroke(domain, component)" @paint="paint(domain, component, $event)" @stroke-end="endStroke(domain)"
                @rotate="rotateBrush" @adjust-size="adjustBrushSize" @adjust-value="adjustPaintValue" @adjust-phase="adjustRadialPhase"
                @mirror="mirrorCanvas(domain, component, $event)" @copy="copyCanvas(domain, component)" @paste="pasteCanvas(domain, component)"
                @invert="invertCanvas(domain, component)" @clear="clearCanvas(domain, component)" />
            </template>
          </div>

        </section>
      </div>

      <footer class="status-bar">
        <div class="footer-status">
          <div class="status-text" role="status" aria-live="polite"><span class="status-dot" :class="{ busy: locked, error: error || fullscreenError }"></span>{{ status }}</div>
          <div class="color-legend"><span><i class="negative-swatch"></i>Negative</span><span><i class="zero-swatch"></i>Zero</span><span><i class="positive-swatch"></i>Positive</span></div>
        </div>
        <a class="footer-brand" href="https://teuncm.nl/" title="More projects at teuncm.nl" aria-label="Fourier Grid — more projects at teuncm.nl">
          <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
          <span>Fourier Grid</span>
        </a>
        <div class="footer-actions">
          <button class="help-button fullscreen-button" type="button" :aria-label="fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'" :aria-pressed="fullscreen" :title="fullscreenSupported ? fullscreen ? 'Exit fullscreen (Esc or F)' : 'Fullscreen (F)' : 'Fullscreen is unavailable in this browser'" :disabled="!fullscreenSupported || drawing" @click="toggleFullscreen"><AppIcon :name="fullscreen ? 'fullscreen-exit' : 'fullscreen'" :size="16" /><span>{{ fullscreen ? 'Exit fullscreen' : 'Fullscreen' }}</span></button>
          <button class="help-button" type="button" @click="helpDialog.showModal()"><AppIcon name="info" :size="16" /><span>Help</span></button>
        </div>
      </footer>
      <div class="sr-only" aria-live="polite">{{ clipboardNotice }}</div>
      <p id="canvas-instructions" class="sr-only">Drag on any grid to paint. Hover to preview the brush outline. Scroll up to increase or down to decrease circle diameter, square side length, line width, wave or radial frequency, or Gaussian standard deviation. Hold Ctrl while scrolling to rotate Square, Line, or Wave, or adjust radial sine/sinc phase. Hold Shift while scrolling up to increase or down to decrease paint value. Lines, waves, and Gaussians extend across the canvas. Wave frequency is measured in cycles per grid. The other side updates when you release, or while drawing if Live updates is enabled in any drawing mode. Wipe clears the selected canvas and places just the current brush. Right-click and drag to erase. With a grid focused, use arrow keys to move the brush and Enter or Space to paint. B selects paint, E selects erase, 1 selects Circle, 2 selects Line, 3 selects Wave, 4 selects Square, 5 selects Gaussian, and square brackets change circle diameter, square side length, line width, or Gaussian standard deviation.</p>
    </main>

    <dialog ref="helpDialog" class="help-dialog" aria-labelledby="help-title" @click="($event.target === helpDialog) && helpDialog.close()">
      <div class="dialog-header"><button class="icon-button" type="button" aria-label="Close help" @click="helpDialog.close()"><AppIcon name="close" /></button></div>
      <h2 id="help-title">Using the grids</h2>
      <p><strong>Undo / Redo</strong> restores completed strokes, manipulations, canvas actions, Clear all, and grid-size changes. Use Ctrl/Cmd+Z to undo, or Ctrl/Cmd+Shift+Z / Ctrl+Y to redo. Each gesture is one step, including Live updates. Both domains restore together without rerunning the transform. The current view and tool settings stay selected, and Copy leaves history unchanged. A new edit clears redo; history retains up to 50 steps within 128 MiB.</p>
      <p>The spatial domain stays on the left and the frequency domain on the right, in a fixed 2×2 layout. The canvases expand to fit the available workspace. The toolbox scrolls independently on laptop and desktop screens.</p>
      <p>Use <strong>Fullscreen</strong> in the footer, or press <strong>F</strong>, to use the entire display. Press <strong>Esc</strong> or F to leave fullscreen. Drawings and tool settings stay intact.</p>
      <p>Each domain has its own <strong>Real / Imaginary ↔ Magnitude / Phase</strong> switch. The top canvas holds real values or magnitude; the bottom holds imaginary values or phase in radians (−π to +π). All operations act on the displayed values, including linked edits and canvas toolbar actions. Negative magnitude becomes positive magnitude with a π phase shift; phase wraps at ±π. Phase at empty pixels can be painted before adding magnitude. The phase color scale is fixed at ±π; magnitude uses its own scale. Switching views preserves the complex signal and does not run a transform.</p>
      <p>The <strong>Mirror horizontally</strong> and <strong>Mirror vertically</strong> buttons in each canvas's top bar flip its values left/right or top/bottom. Only that component changes, and the transform updates immediately.</p>
      <p>Use <strong>Copy</strong> and <strong>Paste</strong> beside a canvas's trash button to transfer its values to any other canvas. Paste adds the copied values to that real or imaginary component without a cap and updates the transform. Invert (±) multiplies the current canvas values by −1 and updates the transform; the copy stays intact. Copies stay available after editing and clearing. The copied and destination grid sizes must match.</p>
      <p>Choose <strong>Circle</strong> or <strong>Square</strong> to paint an area around the pointer. Set its diameter or side length with the size control. Turn the square with the <strong>Rotation</strong> slider or its ±5° buttons.</p>
      <p><strong>Line</strong> draws across the whole canvas through the pointer. Set its width and direction.</p>
      <p><strong>Wave</strong> paints alternating positive and negative bands across the whole canvas. Set its direction and frequency in cycles per grid. In Draw, Add, and Mask, a stroke keeps the wave aligned to where you first pressed.</p>
      <p><strong>Inverted Gaussian</strong> paints value × (1 − exp(−r²/(2σ²))) across the canvas, with zero at its center and values approaching the paint value outward. It shares Gaussian’s standard-deviation controls and preview rings. In Mask mode with paint value 1, apply it at the frequency origin for a smooth highpass. Enable Link editing to filter both real and imaginary components in Real / Imaginary view; in Magnitude / Phase view, filter magnitude alone to preserve phase. It follows the pointer in Wipe and stays anchored at the press position in Draw/Add/Mask.</p>
      <p><strong>Gaussian</strong> paints a smooth bell across the whole canvas, centered where you press. Its peak is the paint value. Set its standard deviation (σ) in pixels; the preview rings show 1σ and 2σ. In Draw, Add, and Mask it stays centered where you first pressed; in Wipe it follows the pointer.</p>
      <p><strong>Fill</strong> covers the entire selected canvas with the paint value. Wipe and Draw replace all samples, Add adds once per sample per stroke, and Mask scales existing samples. Erase clears the whole canvas. Link editing fills both components. Fill has no size or direction and is independent of symmetry and repeat; Live updates and Undo/Redo work as usual.</p>
      <p><strong>Noise</strong>, under Basic brushes, fills the Circle, Square, or whole-canvas Fill footprint with signed white noise between −|paint value| and +|paint value|. Each stroke gets a fresh pattern that stays stable while dragging. Size and Square rotation still apply, as do drawing modes, linked editing, symmetry, repeat, and undo. Erase clears the ordinary footprint. Noise does not affect advanced brushes.</p>
      <p><strong>Radial sine</strong> paints concentric sine bands centered on the pointer. <strong>Radial sinc</strong> paints a peak with fading rings using sin(t)/t, where t is radial distance scaled by frequency plus the phase offset; its value at t = 0 is 1. Scroll to change radial frequency in cycles per grid side, Ctrl+scroll to change phase by 5°, or use the sliders and ± buttons. Phase ranges from −180° to +180°. Each radial brush remembers its own frequency and phase. Both cover the canvas; Wipe follows the pointer, while Draw/Add/Mask keep the center where you first pressed. Shift+scroll changes paint value. Solid mint rings and dashed gold rings outline positive and negative extrema.</p>
      <p><strong>Symmetry</strong> divides every canvas into equal slices. Set the slice count and angle, then draw in one slice to copy it around the center. Draw, Add, and Mask use the slice where the stroke begins; Wipe follows the pointer's slice. Brushes and erase are clipped to that slice before copying. Changing the controls leaves existing values intact.</p>
      <p><strong>Horizontal repeat</strong> copies across columns; <strong>Vertical repeat</strong> copies down rows. Turn on both for a grid. Adjust each count from 2 to 16, limited by the grid size. Draw within one cell to copy the clipped brush to every other cell. Draw/Add/Mask use the starting cell; Wipe follows the current cell. On uneven divisions, cells differ by one pixel and copies keep their relative position. Repeat and rotational symmetry turn each other off. Existing drawings stay intact when settings change.</p>
      <p><strong>Snap to grid</strong>, at the top of the toolbox, also snaps drags back to the horizontal or vertical line through where you started dragging, within 8 screen pixels. Pan and Stretch snap each axis independently, including back to the exact starting position. Rotate snaps back to its starting angle near the starting horizontal line. Dashed guides mark these lines while dragging, with faint bands showing the snap distance; an engaged line becomes solid mint. A ring marks the starting point. The same toggle controls brush snapping and manipulation locking, and starts on.</p>
      <p><strong>Stretch</strong> (8), under <strong>Manipulate</strong>, stays pinned to the canvas origin. Press anywhere and drag right to stretch horizontally or up to stretch vertically. Drag left or down to shrink that axis. X and Y change independently; half a canvas of travel doubles or halves an axis, within 0.125×–8×. The fixed origin marker, deformed grid, ellipse, and X/Y arrows show the result. Mint arrows expand and gold arrows compress. The selected component changes, or both components when Link editing is enabled. Each gesture samples its initial snapshot with smooth interpolation and zero outside the edges. Returning to the starting pointer position restores the exact original. Live updates controls transform timing.</p>
      <p><strong>Pan</strong> (7), under <strong>Manipulate</strong>, moves the canvas you press with the pointer, one grid pixel at a time. Pixels wrap across both horizontal and vertical edges, retaining their exact values. Only the selected real or imaginary component moves. Returning to the starting point restores it. Live updates controls transform timing. With the canvas focused, arrow keys pan by one pixel.</p>
      <p><strong>Rotate</strong> (6), under <strong>Manipulate</strong>, turns the canvas you press about its origin. Drag up for counterclockwise rotation, down for clockwise: one canvas-height is 360°. Only that real or imaginary component changes. The drag uses its starting snapshot; returning to the starting height restores it. Quarter turns retain exact pixels. Other angles use smooth interpolation, with zero beyond the edges. Live updates controls transform timing. Focus a canvas and press Up/Down for ±5° steps.</p>
      <p><strong>Snap to grid</strong> is on by default. When enabled, brush positions within 8 screen pixels of the center X or Y line snap to that axis, or to the origin when near both. The preview and painting use the same snapped point, including erasing. Snapping works with grid lines hidden. This same option also locks Pan, Rotate, and Stretch near their starting reference lines.</p>
      <p>Hover over a grid to see the outline before painting. Wave previews show the peaks and troughs. Erase clears the selected brush's area; for Wave and Gaussian, that is the whole canvas.</p>
      <p><strong>Link editing</strong> in each canvas header applies brushes, erase, Rotate, Pan, and Stretch to both components of that domain. Spatial and Frequency have independent settings, both initially off; either header toggles the pair of link icons on that side. Each component keeps its own values during Add and manipulation. Canvas toolbar actions remain individual.</p>
      <p><strong>Draw</strong> replaces existing values. <strong>Add</strong> adds the brush values without a cap. <strong>Mask</strong> multiplies existing values by the brush values, once per pixel per stroke, leaving pixels outside the brush untouched. Zero clears values, negative factors reverse their sign, and one preserves them. Gaussian and wave brushes multiply across the full canvas. Add also applies once per pixel per stroke; start another stroke to apply either operation again.</p>
      <p><strong>Wipe</strong> clears the selected canvas and draws just one brush at the pointer. Drag to move it without leaving a trail.</p>
      <p>Scroll over a grid to adjust circle diameter, square side length, line width, wave or radial frequency, or Gaussian standard deviation. Scroll up to increase and down to decrease. Hold <strong>Ctrl</strong> while scrolling to rotate Square, Line, or Wave, or adjust radial sine/sinc phase. Each brush remembers its angle. Hold <strong>Shift</strong> while scrolling to change paint value by 0.1 per step, up to increase and down to decrease. Shift takes priority if Ctrl is also held. In Wipe you can also adjust these while dragging. Page scrolling stays disabled over canvases.</p>
      <p><strong>Live updates</strong> is on by default for every drawing mode. Turn it off to update the other side only when you release the mouse, including in Wipe.</p>
      <p>Mint is positive, gold is negative, and dark is zero. Each column uses its own brightness scale. <strong>Boost faint values</strong> makes small values easier to see.</p>
      <div class="shortcut-list"><span><kbd>B</kbd> Paint</span><span><kbd>E</kbd> Erase</span><span><kbd>1</kbd> Circle</span><span><kbd>2</kbd> Line</span><span><kbd>3</kbd> Wave</span><span><kbd>4</kbd> Square</span><span><kbd>5</kbd> Gaussian</span><span><kbd>6</kbd> Rotate</span><span><kbd>7</kbd> Pan</span><span><kbd>8</kbd> Stretch</span><span><kbd>[</kbd> <kbd>]</kbd> Brush size</span><span>Right-click to erase</span></div>
    </dialog>
  </div>
</template>
