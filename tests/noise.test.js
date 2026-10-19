import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paintBrushStroke } from '../src/lib/brushes.js'
import { paintSymmetricStroke } from '../src/lib/symmetry.js'
import { paintRepeatedStroke } from '../src/lib/repeat.js'
import { valueRange, updateValueRange } from '../src/lib/grid.js'

const patterns = [
  paintBrushStroke,
  (...args) => { const options = args.pop(); return paintSymmetricStroke(...args, { enabled: true, slices: 5, angle: 23 }, options) },
  (...args) => { const options = args.pop(); return paintRepeatedStroke(...args, { columns: 3, rows: 2 }, options) },
]
const brush = { shape: 'square', size: 9, angle: 35, noise: true, noiseSeed: 12345 }

test('Noise is signed, bounded, reproducible per seed, and stable across overlapping stamps', () => {
  const size = 127, point = { x: 63, y: 63 }, values = new Float64Array(size * size)
  const config = { ...brush, size: 99, mode: 'paste' }
  paintBrushStroke(values, size, point, point, config, .7)
  assert.ok(values.some(v => v < -.5) && values.some(v => v > .5))
  assert.ok(values.every(v => Math.abs(v) <= .7))
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  assert.ok(Math.abs(mean) < .02)
  const same = values.slice()
  paintBrushStroke(values, size, point, point, config, .7)
  assert.deepEqual(values, same)
  const changed = new Float64Array(values.length)
  paintBrushStroke(changed, size, point, point, { ...config, noiseSeed: 456 }, .7)
  assert.notDeepEqual(changed, same)
  const negative = new Float64Array(values.length)
  paintBrushStroke(negative, size, point, point, config, -.7)
  for (let i = 0; i < values.length; i++) assert.ok(Math.abs(values[i] + negative[i]) < 1e-15)
})

test('Noise supports every mode, exact ranges, single contributions, patterns, clipping, and tiny grids', () => {
  for (const paint of patterns) for (const size of [1, 2, 7, 16, 31]) for (const shape of ['dot', 'square', 'fill']) {
    const point = { x: 0, y: Math.floor(size / 2) }
    const stencil = new Float64Array(size * size).fill(NaN)
    paint(stencil, size, point, point, { ...brush, shape, mode: 'paste' }, .6, point, {})
    for (const mode of ['wipe', 'paste', 'add', 'multiply']) {
      const values = new Float64Array(size * size).fill(3), visited = new Uint8Array(values.length)
      const config = { ...brush, shape, mode }, before = valueRange(values)
      const result = paint(values, size, point, point, config, .6, point, { visited })
      for (let i = 0; i < values.length; i++) {
        const expected = Number.isNaN(stencil[i]) ? mode === 'wipe' ? 0 : 3
          : mode === 'add' ? 3 + stencil[i] : mode === 'multiply' ? 3 * stencil[i] : stencil[i]
        assert.ok(Math.abs(values[i] - expected) < 1e-14)
      }
      assert.deepEqual(updateValueRange(values, before, result), valueRange(values))
      if (mode === 'add' || mode === 'multiply') {
        const once = values.slice()
        paint(values, size, point, point, config, .6, point, { visited })
        assert.deepEqual(values, once)
      }
      paint(values, size, point, point, config, 1, point, { erase: true })
      for (let i = 0; i < values.length; i++) if (!Number.isNaN(stencil[i])) assert.equal(values[i], 0)
    }
  }
})

test('Noise Wipe reuses bounded clears and restores exactly on returning to the starting point', () => {
  const size = 31, values = new Float64Array(size * size).fill(7), point = { x: 15, y: 15 }
  const config = { ...brush, mode: 'wipe' }
  let result = paintBrushStroke(values, size, point, point, config, 1)
  const initial = values.slice()
  for (const end of [{ x: 0, y: 0 }, { x: 30, y: 30 }, point]) {
    const before = valueRange(values)
    result = paintBrushStroke(values, size, point, end, config, 1, point, { clearBounds: result.contentBounds })
    assert.deepEqual(updateValueRange(values, before, result), valueRange(values))
    const fresh = new Float64Array(values.length)
    paintBrushStroke(fresh, size, end, end, config, 1)
    assert.deepEqual(values, fresh)
  }
  assert.deepEqual(values, initial)
})
