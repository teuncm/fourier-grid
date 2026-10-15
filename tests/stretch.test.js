import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayToIndex, valueRange } from '../src/lib/grid.js'
import { createCanvasStretch, stretchCanvasValues, stretchFromDrag } from '../src/lib/stretch.js'

test('Stretch controls horizontal and vertical scales independently, including shrinking and limits', () => {
  for (const size of [1, 31, 32, 127, 1024]) for (const [x, y] of [[0, 0], [size / 2, 0], [0, -size / 2], [size / 3, size / 4], [-size, size], [size * 100, -size * 100]]) {
    const m = stretchFromDrag(x, y, size)
    const expected = distance => Math.max(.125, Math.min(8, 2 ** (-2 * distance / size)))
    assert.ok(Math.abs(m.scaleX - expected(x)) < 1e-12)
    assert.ok(Math.abs(m.scaleY - expected(y)) < 1e-12)
    assert.ok(Math.abs(m.a - m.scaleX) < 1e-12)
    assert.ok(Math.abs(m.d - m.scaleY) < 1e-12)
    assert.ok(m.b === 0)
    assert.ok(m.c === 0)
    assert.ok(m.scaleX >= .125 - 1e-15 && m.scaleX <= 8)
    assert.ok(m.scaleY >= .125 - 1e-15 && m.scaleY <= 8)
  }
  assert.equal(stretchFromDrag(16, 0, 32).scaleX, .5)
  assert.equal(stretchFromDrag(16, 0, 32).scaleY, 1)
  assert.equal(stretchFromDrag(0, -16, 32).scaleX, 1)
  assert.equal(stretchFromDrag(0, -16, 32).scaleY, 2)
})

test('Stretch matches independent inverse sampling, fixes its anchor, and reports accurate ranges', () => {
  for (const size of [2, 3, 7, 16, 31, 32]) for (const [dx, dy] of [[.5, 0], [-.5, 0], [0, .5], [.3, -.4], [.25, .1]]) {
    const values = Float64Array.from({ length: size * size }, (_, i) => Math.sin(i + .7) * 3)
    const original = values.slice(), anchor = { x: Math.floor(size / 2), y: Math.floor(size / 2) }
    const scaleX = 2 ** (-2 * dx), scaleY = 2 ** (-2 * dy), m = stretchFromDrag(size * dx, size * dy, size)
    const sample = (x, y) => x < 0 || y < 0 || x >= size || y >= size ? 0 : original[displayToIndex(x, y, size)]
    const result = stretchCanvasValues(values, createCanvasStretch(values, size), m)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const sx = anchor.x + (x - anchor.x) / scaleX, sy = anchor.y + (y - anchor.y) / scaleY
      const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy
      const expected = sample(ix, iy) * (1 - fx) * (1 - fy) + sample(ix + 1, iy) * fx * (1 - fy)
        + sample(ix, iy + 1) * (1 - fx) * fy + sample(ix + 1, iy + 1) * fx * fy
      assert.ok(Math.abs(values[displayToIndex(x, y, size)] - expected) < 1e-11)
    }
    assert.equal(values[displayToIndex(anchor.x, anchor.y, size)], original[displayToIndex(anchor.x, anchor.y, size)])
    assert.deepEqual(result.range, valueRange(values))
  }
})

test('Stretch gestures use immutable snapshots and return to the exact original without cumulative blur', () => {
  const size = 31, values = Float64Array.from({ length: size * size }, (_, i) => Math.cos(i) * 4)
  values[0] = -0
  const original = values.slice(), anchor = { x: 15, y: 15 }, snapshot = createCanvasStretch(values, size)
  const target = stretchFromDrag(12, -7, size)
  stretchCanvasValues(values, snapshot, target)
  const expected = values.slice()
  for (let i = 0; i < 20; i++) stretchCanvasValues(values, snapshot, stretchFromDrag(i, i * -.4, size))
  stretchCanvasValues(values, snapshot, target)
  assert.deepEqual(values, expected)
  stretchCanvasValues(values, snapshot, stretchFromDrag(0, 0, size))
  assert.deepEqual(values, original)
  assert.deepEqual(snapshot.original, original)
  assert.equal(stretchCanvasValues(values, snapshot, stretchFromDrag(0, 0, size)).bounds, null)
})

test('Stretch stays pinned to the FFT origin with fixed X/Y axes on odd and even grids', () => {
  for (const size of [7, 8, 31, 32]) {
    const origin = Math.floor(size / 2), values = new Float64Array(size * size)
    values[0] = 4
    values[displayToIndex(origin - 1, origin, size)] = -2.75
    values[displayToIndex(origin, origin + 1, size)] = 3
    const snapshot = createCanvasStretch(values, size)
    assert.deepEqual(snapshot.anchor, { x: origin, y: origin })
    stretchCanvasValues(values, snapshot, stretchFromDrag(-size / 2, -size / 2, size))
    assert.equal(values[0], 4)
    assert.equal(values[displayToIndex(origin - 2, origin, size)], -2.75)
    assert.equal(values[displayToIndex(origin, origin + 2, size)], 3)
    stretchCanvasValues(values, snapshot, stretchFromDrag(0, 0, size))
    assert.deepEqual(values, snapshot.original)
  }
})

test('Stretch samples zero beyond the edges and handles empty, tiny, and large grids', () => {
  for (const size of [1, 2, 3, 1023, 1024]) {
    const values = new Float64Array(size * size), anchor = { x: Math.floor(size / 2), y: Math.floor(size / 2) }
    assert.equal(stretchCanvasValues(values, createCanvasStretch(values, size), stretchFromDrag(size / 2, 0, size)).bounds, null)
    values[displayToIndex(anchor.x, anchor.y, size)] = -2.75
    const result = stretchCanvasValues(values, createCanvasStretch(values, size), stretchFromDrag(size / 2, 0, size))
    assert.equal(values[displayToIndex(anchor.x, anchor.y, size)], -2.75)
    assert.deepEqual(result.range, valueRange(values))
    if (size > 2) assert.equal(values[displayToIndex(size - 1, 0, size)], 0)
  }
})

test('Stretch rejects invalid drags and singular matrices without changing values', () => {
  const values = Float64Array.of(2), snapshot = createCanvasStretch(values, 1)
  for (const [x, y, size] of [[NaN, 0, 1], [0, Infinity, 1], [0, 0, 0]]) assert.throws(() => stretchFromDrag(x, y, size), RangeError)
  for (const m of [{ a: 0, b: 0, c: 0, d: 1 }, { a: Infinity, b: 0, c: 0, d: 1 }]) assert.throws(() => stretchCanvasValues(values, snapshot, m), RangeError)
  assert.deepEqual(values, Float64Array.of(2))
})
