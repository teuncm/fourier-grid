import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayToIndex, valueRange } from '../src/lib/grid.js'
import { createCanvasPan, panCanvasValues } from '../src/lib/pan.js'

test('Pan wraps every displayed pixel across both axes on tiny, odd, and even grids', () => {
  for (const size of [1, 2, 3, 7, 8, 31, 32, 127]) {
    const values = Float64Array.from({ length: size * size }, (_, i) => (i % 2 ? -1 : 1) * (i + .125))
    const original = values.slice(), range = valueRange(values)
    const snapshot = createCanvasPan(values, size)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [3, -2], [-size * 3 - 1, size * 2 + 2]]) {
      panCanvasValues(values, snapshot, dx, dy)
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const tx = ((x + dx) % size + size) % size, ty = ((y + dy) % size + size) % size
        assert.equal(values[displayToIndex(tx, ty, size)], original[displayToIndex(x, y, size)])
      }
      assert.deepEqual(valueRange(values), range, 'Every extreme and occurrence count stays unchanged')
    }
    assert.deepEqual(snapshot.original, original)
  }
})

test('Pan gestures use an immutable snapshot, preserve exact values, and reverse without drift', () => {
  const size = 31
  const values = Float64Array.from({ length: size * size }, (_, i) => Math.sin(i) * 7)
  values[2] = -0
  const original = values.slice(), snapshot = createCanvasPan(values, size)
  const first = panCanvasValues(values, snapshot, 4, -5)
  assert.deepEqual(first.bounds, { left: 0, top: 0, right: size - 1, bottom: size - 1 })
  const expected = values.slice()
  for (let i = 0; i < 50; i++) panCanvasValues(values, snapshot, i * 3, -i * 2)
  panCanvasValues(values, snapshot, 4, -5)
  assert.deepEqual(values, expected)
  assert.equal(panCanvasValues(values, snapshot, 4 + size, -5 - size).bounds, null)
  panCanvasValues(values, snapshot, 0, 0)
  assert.deepEqual(values, original)
  assert.deepEqual(snapshot.original, original)
})

test('Pan snaps to the nearest pixel and reports no redraw for repeated or uniform shifts', () => {
  const values = Float64Array.from({ length: 9 }, (_, i) => i)
  const snapshot = createCanvasPan(values, 3)
  assert.equal(panCanvasValues(values, snapshot, .49, -.49).bounds, null)
  panCanvasValues(values, snapshot, .51, -.51)
  assert.equal(values[displayToIndex(2, 0, 3)], snapshot.original[displayToIndex(1, 1, 3)])
  assert.equal(panCanvasValues(values, snapshot, 1.1, -1.2).bounds, null)
  const uniform = new Float64Array(49).fill(-3.25), uniformSnapshot = createCanvasPan(uniform, 7)
  assert.equal(panCanvasValues(uniform, uniformSnapshot, 3, -2).bounds, null)
  assert.ok(uniform.every(v => v === -3.25))
})

test('Large odd and even grids retain corner impulses through multi-canvas wrapping', () => {
  for (const size of [1023, 1024]) {
    const values = new Float64Array(size * size)
    values[displayToIndex(size - 1, size - 1, size)] = -2.75
    const snapshot = createCanvasPan(values, size)
    panCanvasValues(values, snapshot, size * 3 + 2, size * 2 + 3)
    assert.equal(values[displayToIndex(1, 2, size)], -2.75)
    assert.equal(values.filter(v => v !== 0).length, 1)
    panCanvasValues(values, snapshot, -size * 2, size * 4)
    assert.deepEqual(values, snapshot.original)
  }
})

test('Pan rejects non-finite offsets before modifying the gesture', () => {
  const values = Float64Array.of(2), snapshot = createCanvasPan(values, 1)
  for (const [x, y] of [[NaN, 0], [Infinity, 0], [0, -Infinity]]) {
    assert.throws(() => panCanvasValues(values, snapshot, x, y), RangeError)
  }
  assert.deepEqual(values, Float64Array.of(2))
  assert.equal(snapshot.x, 0)
  assert.equal(snapshot.y, 0)
})
