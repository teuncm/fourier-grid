import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayToIndex, valueRange } from '../src/lib/grid.js'
import { mirrorCanvasValues } from '../src/lib/mirror.js'

test('Mirroring reverses displayed columns or rows exactly on tiny, odd, and even grids', () => {
  for (const size of [1, 2, 3, 7, 8, 31, 32, 127, 1023, 1024]) for (const direction of ['horizontal', 'vertical']) {
    const values = Float64Array.from({ length: size * size }, (_, i) => (i % 2 ? -1 : 1) * (i + .125))
    values[0] = -0
    const before = values.slice(), range = valueRange(values)
    const result = mirrorCanvasValues(values, size, direction)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const sx = direction === 'horizontal' ? size - 1 - x : x, sy = direction === 'vertical' ? size - 1 - y : y
      assert.equal(values[displayToIndex(x, y, size)], before[displayToIndex(sx, sy, size)])
    }
    assert.deepEqual(valueRange(values), range)
    assert.deepEqual(result.bounds, size === 1 ? null : { left: 0, top: 0, right: size - 1, bottom: size - 1 })
    mirrorCanvasValues(values, size, direction)
    assert.deepEqual(values, before, 'Mirroring twice restores every exact value')
  }
})

test('Horizontal and vertical mirrors commute and leave uniform canvases unchanged', () => {
  const size = 31, original = Float64Array.from({ length: size * size }, (_, i) => Math.sin(i) * 5)
  const a = original.slice(), b = original.slice()
  mirrorCanvasValues(a, size, 'horizontal'); mirrorCanvasValues(a, size, 'vertical')
  mirrorCanvasValues(b, size, 'vertical'); mirrorCanvasValues(b, size, 'horizontal')
  assert.deepEqual(a, b)
  for (const value of [0, -2.75]) for (const direction of ['horizontal', 'vertical']) {
    const uniform = new Float64Array(49).fill(value)
    assert.equal(mirrorCanvasValues(uniform, 7, direction).bounds, null)
    assert.ok(uniform.every(v => v === value))
  }
})

test('Invalid mirror directions cannot modify the canvas', () => {
  const values = Float64Array.of(1, -2, 3, -4), before = values.slice()
  assert.throws(() => mirrorCanvasValues(values, 2, 'diagonal'), RangeError)
  assert.deepEqual(values, before)
})
