import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGrid, displayToIndex } from '../src/lib/grid.js'
import { paintBrushStroke } from '../src/lib/brushes.js'
import { fft2D } from './helpers/fft.js'

const size = 32
const point = { x: 16, y: 16 }
const index = displayToIndex(point.x, point.y, size)

for (const shape of ['dot', 'square', 'line', 'wave']) {
  test(`${shape}: Wipe replaces the selected canvas with only the latest brush placement`, () => {
    const grid = createGrid(size)
    grid.real.fill(2)
    grid.imaginary.fill(-0.3)
    const brush = { shape, size: 5, angle: 30, wavelength: 8, mode: 'wipe' }
    const origin = { x: 4, y: 5 }
    let previous = origin
    for (const end of [{ x: 14, y: 16 }, { x: 25, y: 23 }]) {
      const result = paintBrushStroke(grid.real, size, previous, end, brush, -0.5, origin)
      const expected = createGrid(size)
      paintBrushStroke(expected.real, size, end, end, { ...brush, mode: 'paste' }, -0.5, end)
      assert.deepEqual(grid.real, expected.real)
      assert.ok(grid.imaginary.every(value => value === -0.3))
      assert.ok(result.bounds)
      previous = end
    }
    const beforeErase = grid.real.slice()
    paintBrushStroke(grid.real, size, previous, previous, brush, -0.5, origin, { erase: true })
    const expectedErase = beforeErase.slice()
    paintBrushStroke(expectedErase, size, previous, previous, { ...brush, mode: 'paste' }, 0)
    assert.deepEqual(grid.real, expectedErase)
  })
}

test('Wipe dirty regions clear old pixels when the brush moves to a distant point', () => {
  const grid = createGrid(size)
  const brush = { shape: 'square', size: 3, mode: 'wipe' }
  const start = { x: 3, y: 4 }
  const end = { x: 25, y: 26 }
  paintBrushStroke(grid.real, size, start, start, brush, 1)
  const result = paintBrushStroke(grid.real, size, start, end, brush, 1)
  assert.deepEqual(result.bounds, { left: 2, top: 3, right: 26, bottom: 27 })
  assert.equal(grid.real.filter(value => value === 1).length, 9)
  assert.equal(grid.real[displayToIndex(start.x, start.y, size)], 0)
})

for (const shape of ['dot', 'square', 'line', 'wave']) {
  test(`${shape}: Add accumulates beyond either sign of 1 and applies once per stroke`, () => {
    const grid = createGrid(size)
    grid.real.fill(0.25)
    const brush = { shape, size: 5, angle: 0, wavelength: 8, mode: 'add' }
    for (const [value, expected] of [[0.5, 0.75], [0.5, 1.25], [-1, 0.25], [-1, -0.75], [-0.5, -1.25]]) {
      const stroke = { visited: new Uint8Array(size * size) }
      for (let event = 0; event < 3; event++) paintBrushStroke(grid.real, size, point, point, brush, value, point, stroke)
      assert.equal(grid.real[index], expected)
    }
    // Paste replaces the value, and Erase takes priority over Add.
    paintBrushStroke(grid.real, size, point, point, { ...brush, mode: 'paste' }, 0.25)
    assert.equal(grid.real[index], 0.25)
    paintBrushStroke(grid.real, size, point, point, brush, 0.5, point, { erase: true })
    assert.equal(grid.real[index], 0)
  })
}

test('An additive drag gives the same result with fast or frequent mouse events', () => {
  const fast = createGrid(size)
  const slow = createGrid(size)
  fast.real.fill(0.125)
  slow.real.fill(0.125)
  const brush = { shape: 'square', size: 5, mode: 'add' }
  const from = { x: 4, y: 16 }
  const to = { x: 9, y: 16 }
  paintBrushStroke(fast.real, size, from, to, brush, 0.25)
  const stroke = { visited: new Uint8Array(size * size) }
  for (let x = from.x; x < to.x; x++) {
    paintBrushStroke(slow.real, size, { x, y: 16 }, { x: x + 1, y: 16 }, brush, 0.25, from, stroke)
  }
  paintBrushStroke(slow.real, size, to, to, brush, 0.25, from, stroke)
  assert.deepEqual(slow.real, fast.real)
  assert.equal(fast.real.filter(value => value === 0.375).length, 50)
  assert.equal(fast.real.filter(value => value === 0.125).length, size * size - 50)
})

test('Add retains existing transform values beyond 1 in either direction', () => {
  const grid = createGrid(size)
  grid.real.fill(3)
  const brush = { shape: 'dot', size: 1, mode: 'add' }
  paintBrushStroke(grid.real, size, point, point, brush, -0.25)
  assert.equal(grid.real[index], 2.75)
  assert.equal(grid.real[displayToIndex(0, 0, size)], 3)
  grid.real[index] = -3
  paintBrushStroke(grid.real, size, point, point, brush, 0.25)
  assert.equal(grid.real[index], -2.75)
})

test('Adding a zero-valued wave preserves values beyond 1; pasting it clears them', () => {
  const grid = createGrid(size)
  grid.real.fill(3)
  grid.real[index] = -3
  const before = grid.real.slice()
  const brush = { shape: 'wave', wavelength: 8, angle: 0, mode: 'add' }
  paintBrushStroke(grid.real, size, point, point, brush, 0)
  assert.deepEqual(grid.real, before)
  paintBrushStroke(grid.real, size, point, point, { ...brush, mode: 'paste' }, 0)
  assert.ok(grid.real.every(value => value === 0))
})

test('Adding perpendicular waves preserves both pairs of Fourier frequencies', async () => {
  const grid = createGrid(size)
  const brush = { shape: 'wave', wavelength: 8, angle: 0, mode: 'add' }
  paintBrushStroke(grid.real, size, point, point, brush, 1)
  paintBrushStroke(grid.real, size, point, point, { ...brush, angle: 90 }, 1)
  assert.equal(grid.real[index], 2)
  assert.equal(grid.real[displayToIndex(20, 20, size)], -2)
  const transformed = await fft2D(grid.real, grid.imaginary, size)
  const peaks = [[4, 16], [size - 4, 16], [4 * size, 16], [(size - 4) * size, 16]]
  for (const [frequency, amplitude] of peaks) assert.ok(Math.abs(transformed.real[frequency] - amplitude) < 1e-8)
  assert.equal(transformed.real.filter(value => Math.abs(value) > 1e-8).length, 4)
  assert.ok(transformed.imaginary.every(value => Math.abs(value) < 1e-8))
})
