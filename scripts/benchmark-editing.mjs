import { performance } from 'node:perf_hooks'
import { mkdir, writeFile } from 'node:fs/promises'
import { createGrid } from '../src/lib/grid.js'
import { toCartesian, normalizePolar, normalizePolarRegion } from '../src/lib/complex-view.js'
import { createCanvasSnapshot } from '../src/lib/canvas-snapshot.js'

// Reference paths mirror the full-grid work performed before the cleanup.
function previousCartesian(grid) {
  const result = createGrid(Math.sqrt(grid.real.length))
  for (let i = 0; i < grid.real.length; i++) {
    result.real[i] = grid.real[i] * Math.cos(grid.imaginary[i])
    result.imaginary[i] = grid.real[i] * Math.sin(grid.imaginary[i])
  }
  return result
}
function measure(run) {
  for (let i = 0; i < 5; i++) run(i)
  const times = []
  for (let i = 5; i < 26; i++) { const start = performance.now(); run(i); times.push(performance.now() - start) }
  times.sort((a, b) => a - b)
  return { medianMs: times[10], p95Ms: times[19] }
}
const results = []
function compare(size, operation, before, after) {
  const previous = measure(before), optimized = measure(after)
  const result = { size, operation, previous, optimized, speedup: previous.medianMs / optimized.medianMs }
  results.push(result); console.log(JSON.stringify(result))
}
for (const size of [512, 1024]) {
  const grid = createGrid(size), target = createGrid(size), center = { x: size / 2, y: size / 2 }
  const bounds = { left: center.x - 6, top: center.y - 6, right: center.x + 6, bottom: center.y + 6 }
  for (const density of ['dense', 'sparse']) {
    for (let i = 0; i < grid.real.length; i++) { grid.real[i] = density === 'sparse' && i % 997 ? 0 : Math.abs(Math.sin(i)); grid.imaginary[i] = Math.cos(i) }
    compare(size, `polar-input-${density}`, () => { const source = previousCartesian(grid); target.real.set(source.real); target.imaginary.set(source.imaginary) }, () => toCartesian(grid, target))
  }
  compare(size, 'manipulation-snapshot', () => {
    const original = grid.real.slice(), stride = size + 2, pixels = new Float64Array(stride * stride), half = Math.ceil(size / 2)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) pixels[(y + 1) * stride + x + 1] = grid.real[((y + half) % size) * size + (x + half) % size]
    return { original, pixels }
  }, () => createCanvasSnapshot(grid.real, size))
  grid.real.fill(1); grid.imaginary.fill(.5)
  compare(size, 'canonical-brush-normalization-13px', () => normalizePolar(grid), () => normalizePolarRegion(grid, size, bounds))

}
await mkdir('.tmp', { recursive: true })
await writeFile('.tmp/editing-benchmark.json', JSON.stringify({ runtime: process.version, results }, null, 2))
