import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGrid, displayToIndex, gridPeak, gridRanges, gridPeakFromRanges, valueRange, updateValueRange, makePreset, paintStroke } from '../src/lib/grid.js'
import { paintBrushStroke } from '../src/lib/brushes.js'
import { fft2D } from './helpers/fft.js'

test('Ranges use actual values for single samples and wholly positive or negative canvases', () => {
  for (const values of [[], [2], [-3], [1, 2, 1], [-4, -2, -4], [0, 0], [-2, 0, 3]]) {
    const range = valueRange(values)
    assert.equal(range.min, values.length ? Math.min(...values) : 0)
    assert.equal(range.max, values.length ? Math.max(...values) : 0)
    assert.equal(range.minCount, values.filter(v => v === range.min).length)
    assert.equal(range.maxCount, values.filter(v => v === range.max).length)
  }
  const grid = { real: Float64Array.of(2, 1), imaginary: Float64Array.of(-4, -3) }
  assert.equal(gridPeakFromRanges(gridRanges(grid)), gridPeak(grid))
})

test('Incremental ranges match complete scans for every brush and drawing mode', () => {
  for (const size of [1, 2, 16]) for (const shape of ['dot', 'square', 'line', 'wave', 'gaussian']) {
    const values = new Float64Array(size * size)
    let range = valueRange(values)
    for (let step = 0; step < 36; step++) {
      const brush = { shape, size: step % 2 ? 1 : 5, sigma: step % 2 ? .5 : 2, angle: step * 5, wavelength: Math.max(2, size / 3), mode: ['paste', 'add', 'wipe'][step % 3] }
      const from = { x: step % size, y: (step * 3) % size }
      const to = { x: (step + 1) % size, y: (step * 7) % size }
      const changes = paintBrushStroke(values, size, from, to, brush, [1, -.5, 0, .3][step % 4], from, { erase: step % 7 === 0 })
      range = updateValueRange(values, range, changes)
      assert.deepEqual(range, valueRange(values), `${size} ${shape}, step ${step}`)
    }
  }
})

test('Extrema counts avoid rescanning unchanged zero pixels and detect removal of the last extreme', () => {
  const values = new Float64Array(16)
  let range = valueRange(values)
  const point = { x: 2, y: 2 }
  let changes = paintBrushStroke(values, 4, point, point, { shape: 'dot', size: 1 }, 1)
  range = updateValueRange(new Proxy(values, { get() { throw new Error('Unexpected full scan') } }), range, changes)
  assert.equal(range.minCount, 15)
  changes = paintBrushStroke(values, 4, point, point, { shape: 'dot', size: 1 }, 0)
  assert.deepEqual(updateValueRange(values, range, changes), valueRange(values))
})

for (const size of [1, 2, 4, 8]) test(`${size} × ${size}: the displayed center maps to zero and every pixel maps uniquely`, () => {
  const center = Math.floor(size / 2)
  assert.equal(displayToIndex(center, center, size), 0)
  const indices = new Set()
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) indices.add(displayToIndex(x, y, size))
  assert.equal(indices.size, size * size)
  assert.equal(Math.min(...indices), 0)
  assert.equal(Math.max(...indices), size * size - 1)
})

test('One-pixel brush paints and erases exactly one sample', () => {
  const grid = createGrid(8)
  const point = { x: 4, y: 4 }
  paintStroke(grid.imaginary, 8, point, point, 1, -0.5)
  assert.equal(grid.imaginary[0], -0.5)
  assert.equal(grid.imaginary.filter(value => value !== 0).length, 1)
  assert.equal(gridPeak(grid), 0.5)
  paintStroke(grid.imaginary, 8, point, point, 1, 0)
  assert.equal(gridPeak(grid), 0)
})

test('Fast pointer movements produce a continuous stroke', () => {
  const grid = createGrid(16)
  paintStroke(grid.real, 16, { x: 1, y: 5 }, { x: 14, y: 5 }, 1, 1)
  for (let x = 1; x <= 14; x++) assert.equal(grid.real[displayToIndex(x, 5, 16)], 1)
  assert.equal(grid.real.filter(value => value !== 0).length, 14)
})

test('Circular brushes increase area and clip at the canvas boundary', () => {
  const small = createGrid(16)
  const large = createGrid(16)
  const point = { x: 8, y: 8 }
  paintStroke(small.real, 16, point, point, 3, 1)
  paintStroke(large.real, 16, point, point, 9, 1)
  assert.ok(large.real.filter(value => value !== 0).length > small.real.filter(value => value !== 0).length)
  const clipped = createGrid(16)
  paintStroke(clipped.real, 16, { x: 0, y: 0 }, { x: 0, y: 0 }, 9, 1)
  assert.equal(clipped.real[displayToIndex(15, 0, 16)], 0)
  assert.equal(clipped.real[displayToIndex(0, 15, 16)], 0)
})

test('Cosine preset produces two real frequencies and negligible imaginary values', async () => {
  const size = 64
  const grid = makePreset(size, 'wave')
  const transformed = await fft2D(grid.real, grid.imaginary, size)
  assert.ok(Math.abs(transformed.real[6] - size / 2) < 1e-8)
  assert.ok(Math.abs(transformed.real[size - 6] - size / 2) < 1e-8)
  assert.equal(transformed.real.filter(value => Math.abs(value) > 1e-8).length, 2)
  assert.ok(transformed.imaginary.every(value => Math.abs(value) < 1e-8))
})
