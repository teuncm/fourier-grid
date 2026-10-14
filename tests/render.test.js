import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGrid, displayToIndex } from '../src/lib/grid.js'
import { paintBrushStroke } from '../src/lib/brushes.js'
import { createDirtyRegion, renderGridPixels } from '../src/lib/render.js'

test('Packed rendering matches the original formula at color boundaries and across dense signed data', () => {
  const samples = [0, -0, Number.MIN_VALUE, -Number.MIN_VALUE, 1, -1, 2, -2]
  for (let i = 0; i < 20000; i++) samples.push(Math.sin(i * 1.73) * Math.cos(i * 0.41) * 2)
  // Probe both sides of every channel's rounding transition, for both scales.
  for (const boosted of [false, true]) {
    for (const [base, span, sign] of [[13, 102, 1], [22, 216, 1], [28, 174, 1], [13, 231, -1], [22, 119, -1], [28, 91, -1]]) {
      for (let channel = base; channel < base + span; channel++) {
        const level = (channel + 0.5 - base) / span
        const relative = boosted ? Math.expm1(level * Math.log(81)) / 80 : level
        for (const offset of [-1e-14, 0, 1e-14]) samples.push(sign * (relative + offset))
      }
    }
  }
  const size = 256
  const values = Float64Array.from({ length: size * size }, (_, i) => samples[i % samples.length])
  for (const peak of [1, 2, 1e-15]) for (const boosted of [false, true]) {
    const expected = new Uint8ClampedArray(size * size * 4)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const value = values[displayToIndex(x, y, size)]
      const relative = Math.min(1, Math.abs(value) / (peak > 1e-12 ? peak : 1))
      const level = boosted ? Math.log1p(80 * relative) / Math.log(81) : relative
      const start = (y * size + x) * 4, positive = value >= 0
      expected[start] = Math.round(13 + ((positive ? 115 : 244) - 13) * level)
      expected[start + 1] = Math.round(22 + ((positive ? 238 : 141) - 22) * level)
      expected[start + 2] = Math.round(28 + ((positive ? 202 : 119) - 28) * level)
      expected[start + 3] = 255
    }
    for (const offset of [0, 1, 4]) {
      const storage = new Uint8ClampedArray(expected.length + offset + 4).fill(99)
      const pixels = storage.subarray(offset, offset + expected.length)
      renderGridPixels(values, size, peak, boosted, pixels)
      assert.deepEqual(pixels, expected, `peak=${peak}, boost=${boosted}, offset=${offset}`)
      assert.ok(storage.subarray(0, offset).every(v => v === 99))
      assert.ok(storage.subarray(offset + expected.length).every(v => v === 99))
    }
  }
})

test('Tiny grids render the origin at the same pixel used by painting', () => {
  for (const size of [1, 2, 4]) {
    const grid = createGrid(size)
    const center = { x: Math.floor(size / 2), y: Math.floor(size / 2) }
    paintBrushStroke(grid.real, size, center, center, { shape: 'dot', size: 1 }, 1)
    const pixels = new Uint8ClampedArray(size * size * 4)
    renderGridPixels(grid.real, size, 1, false, pixels)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const start = (y * size + x) * 4
      assert.deepEqual(Array.from(pixels.slice(start, start + 4)), x === center.x && y === center.y ? [115, 238, 202, 255] : [13, 22, 28, 255])
    }
  }
})

test('Rendering retains centered coordinates, signed colors, and the exact faint-value boost', () => {
  const size = 16
  const values = new Float64Array(size * size)
  values[0] = 1
  values[displayToIndex(2, 3, size)] = -0.1
  values[displayToIndex(15, 15, size)] = -2
  const pixels = new Uint8ClampedArray(size * size * 4)
  const pixel = (x, y) => Array.from(pixels.slice((y * size + x) * 4, (y * size + x + 1) * 4))
  for (const boosted of [false, true]) {
    renderGridPixels(values, size, 1, boosted, pixels)
    assert.deepEqual(pixel(8, 8), [115, 238, 202, 255])
    assert.deepEqual(pixel(2, 3), boosted ? [129, 82, 74, 255] : [36, 34, 37, 255])
    assert.deepEqual(pixel(15, 15), [244, 141, 119, 255])
    assert.deepEqual(pixel(0, 0), [13, 22, 28, 255])
  }
})

test('Edits before one frame merge into a single region without dropping earlier edits', () => {
  const queue = createDirtyRegion()
  const first = { left: 2, top: 8, right: 4, bottom: 10 }
  queue.add(first)
  queue.add({ left: 9, top: 3, right: 12, bottom: 5 })
  queue.add(null)
  assert.deepEqual(queue.take(), { left: 2, top: 3, right: 12, bottom: 10 })
  assert.deepEqual(first, { left: 2, top: 8, right: 4, bottom: 10 })
  assert.equal(queue.take(), null)
})

for (const shape of ['dot', 'square', 'line', 'wave']) {
  test(`${shape}: partial repaints exactly match a full repaint after painting and erasing`, () => {
    const size = 32
    const grid = createGrid(size)
    const partial = new Uint8ClampedArray(size * size * 4)
    const full = new Uint8ClampedArray(partial.length)
    const brush = { shape, size: 5, angle: 45, wavelength: 8 }
    renderGridPixels(grid.real, size, 1, true, partial)
    for (const [from, to, value] of [[{ x: 4, y: 5 }, { x: 8, y: 9 }, 0.6], [{ x: 24, y: 18 }, { x: 31, y: 26 }, -0.4], [{ x: 4, y: 5 }, { x: 7, y: 8 }, 0]]) {
      const result = paintBrushStroke(grid.real, size, from, to, brush, value)
      if (result.bounds) renderGridPixels(grid.real, size, 1, true, partial, result.bounds)
      renderGridPixels(grid.real, size, 1, true, full)
      assert.deepEqual(partial, full)
    }
  })
}

test('A full repaint after the scale drops updates previously untouched faint values', () => {
  const size = 16
  const grid = createGrid(size)
  grid.real[0] = 1
  grid.real[displayToIndex(0, 0, size)] = 0.1
  const pixels = new Uint8ClampedArray(size * size * 4)
  renderGridPixels(grid.real, size, 1, true, pixels)
  const faintBefore = pixels.slice(0, 4)
  const point = { x: 8, y: 8 }
  const result = paintBrushStroke(grid.real, size, point, point, { shape: 'dot', size: 1 }, 0)
  assert.equal(result.oldPeak, 1)
  assert.equal(result.newPeak, 0)
  renderGridPixels(grid.real, size, 0.1, true, pixels)
  assert.notDeepEqual(pixels.slice(0, 4), faintBefore)
  assert.deepEqual(Array.from(pixels.slice(0, 4)), [115, 238, 202, 255])
})

test('Unchanged brush stamps report no work, and changed bounds stay inside the grid', () => {
  const size = 16
  const grid = createGrid(size)
  const point = { x: 0, y: 0 }
  const brush = { shape: 'square', size: 5 }
  const result = paintBrushStroke(grid.real, size, point, point, brush, 0.4)
  assert.deepEqual(result.bounds, { left: 0, top: 0, right: 2, bottom: 2 })
  assert.equal(result.oldPeak, 0)
  assert.equal(result.newPeak, 0.4)
  assert.equal(paintBrushStroke(grid.real, size, point, point, brush, 0.4).bounds, null)
})
