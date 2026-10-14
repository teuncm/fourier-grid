import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stageTextureValues } from '../src/lib/canvas-renderer.js'
import { displayToIndex } from '../src/lib/grid.js'

test('GPU staging centers each grid and preserves the original float64 samples', () => {
  for (const size of [1, 2, 4, 128, 1024]) {
    const values = Float64Array.from({ length: size * size }, (_, i) => Math.sin(i * .73))
    values[0] = 1
    const before = values.slice(), upload = new Float32Array(values.length)
    const staged = stageTextureValues(values, size, 2, null, upload)
    assert.equal(staged.data.buffer, upload.buffer)
    assert.equal(staged.width, size)
    assert.equal(staged.height, size)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      assert.equal(staged.data[y * size + x], Math.fround(values[displayToIndex(x, y, size)] / 2))
    }
    assert.deepEqual(values, before)
  }
})

test('Dirty GPU uploads pack only the selected rectangle into reusable storage', () => {
  const size = 8, values = Float64Array.from({ length: 64 }, (_, i) => i - 32)
  const upload = new Float32Array(64).fill(99)
  const bounds = { left: 3, top: 2, right: 5, bottom: 4 }
  const staged = stageTextureValues(values, size, 32, bounds, upload)
  assert.deepEqual([staged.left, staged.top, staged.width, staged.height], [3, 2, 3, 3])
  const expected = []
  for (let y = 2; y <= 4; y++) for (let x = 3; x <= 5; x++) expected.push(values[displayToIndex(x, y, size)] / 32)
  assert.deepEqual(Array.from(staged.data), expected)
  assert.ok(upload.subarray(9).every(v => v === 99))
})

test('GPU normalization retains extreme signs and matches the near-zero brightness policy', () => {
  const upload = new Float32Array(4)
  const values = Float64Array.of(1e200, -1e200, 5e199, -5e199)
  assert.deepEqual(Array.from(stageTextureValues(values, 2, 1e200, null, upload).data), [-.5, .5, -1, 1])
  const tiny = Float64Array.of(1e-15)
  assert.equal(stageTextureValues(tiny, 1, 1e-15, null, upload).data[0], Math.fround(1e-15))
})
