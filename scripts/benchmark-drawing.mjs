import { performance } from 'node:perf_hooks'
import { mkdir, writeFile } from 'node:fs/promises'
import { paintBrushStroke } from '../src/lib/brushes.js'
import { createCanvasPan, panCanvasValues } from '../src/lib/pan.js'
import { stageTextureValues } from '../src/lib/canvas-renderer.js'

function previousPan(values, snapshot, dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new RangeError('Pan offsets must be finite.')
  const { size, original } = snapshot
  const x = ((Math.round(dx) % size) + size) % size
  const y = ((Math.round(dy) % size) + size) % size
  if (x === snapshot.x && y === snapshot.y) return { bounds: null }
  snapshot.x = x
  snapshot.y = y
  let changed = false
  // A cyclic shift works directly in FFT storage order as well as display order.
  // Split each row at the wrap, keeping modulo and interpolation out of the pixel loop.
  for (let row = 0; row < size; row++) {
    const target = row * size, source = ((row - y + size) % size) * size
    for (let column = 0; column < x; column++) {
      const index = target + column, value = original[source + size - x + column]
      if (values[index] !== value) changed = true
      values[index] = value
    }
    for (let column = x; column < size; column++) {
      const index = target + column, value = original[source + column - x]
      if (values[index] !== value) changed = true
      values[index] = value
    }
  }
  return { bounds: changed ? { left: 0, top: 0, right: size - 1, bottom: size - 1 } : null }
}

function previousUpload(values, size, peak, upload) {
  const half = Math.ceil(size / 2), scale = peak > 1e-12 ? peak : 1
  let offset = 0
  for (let y = 0; y < size; y++) {
    const row = ((y + half) % size) * size
    for (let x = 0; x < size; x++) upload[offset++] = values[row + (x + half) % size] / scale
  }
}
function measure(fn) {
  for (let i = 0; i < 64; i++) fn(i)
  const times = []
  for (let i = 64; i < 95; i++) { const start = performance.now(); fn(i); times.push(performance.now() - start) }
  times.sort((a, b) => a - b)
  return { medianMs: times[15], p95Ms: times[29] }
}
const results = []
function compare(size, operation, before, after) {
  const previous = measure(before), optimized = measure(after)
  const result = { size, operation, previous, optimized, speedup: previous.medianMs / optimized.medianMs }
  results.push(result); console.log(JSON.stringify(result))
}
for (const size of [512, 1024]) {
  const original = Float64Array.from({ length: size * size }, (_, i) => Math.sin(i) * Math.cos(i * .37))
  for (const diameter of [13, 127]) {
    const full = original.slice(), bounded = original.slice(), brush = { shape: 'dot', size: diameter, mode: 'wipe' }
    let clearBounds
    const point = i => ({ x: Math.floor(size / 2) + i % 9, y: Math.floor(size / 2) + i % 7 })
    compare(size, `wipe-${diameter}px-continuation`, i => paintBrushStroke(full, size, point(i), point(i), brush, 1), i => {
      const result = paintBrushStroke(bounded, size, point(i), point(i), brush, 1, point(i), { clearBounds })
      clearBounds = result.contentBounds
    })
    for (let i = 0; i < full.length; i++) if (full[i] !== bounded[i]) throw new Error('Wipe samples differ')
  }
  const oldPan = original.slice(), newPan = original.slice(), oldSnapshot = createCanvasPan(original, size), newSnapshot = createCanvasPan(original, size)
  compare(size, 'pan-dense', i => previousPan(oldPan, oldSnapshot, i + 1, -i - 1), i => panCanvasValues(newPan, newSnapshot, i + 1, -i - 1))
  for (let i = 0; i < oldPan.length; i++) if (oldPan[i] !== newPan[i]) throw new Error('Pan samples differ')
  const oldUpload = new Float32Array(original.length), newUpload = new Float32Array(original.length)
  for (const peak of [1, 3.7]) {
    compare(size, `texture-upload-peak-${peak}`, () => previousUpload(original, size, peak, oldUpload), () => stageTextureValues(original, size, peak, null, newUpload))
    for (let i = 0; i < oldUpload.length; i++) if (oldUpload[i] !== newUpload[i]) throw new Error('Texture values differ')
  }
}
await mkdir('.tmp', { recursive: true })
await writeFile('.tmp/drawing-benchmark.json', JSON.stringify({ runtime: process.version, results }, null, 2))
