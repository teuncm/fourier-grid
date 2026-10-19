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

test('Fill covers every sample in all modes, independent of position, symmetry, and repeat', () => {
  for (const size of [1, 2, 7, 16, 127, 1024]) for (const paint of patterns) {
    const start = { x: 0, y: size - 1 }, end = { x: size - 1, y: 0 }
    for (const mode of ['wipe', 'paste', 'add', 'multiply']) for (const value of [-1, 0, .5, 1]) {
      const values = Float64Array.from({ length: size * size }, (_, i) => (i % 13) - 6)
      const before = values.slice(), range = valueRange(values), visited = new Uint8Array(values.length)
      const brush = { shape: 'fill', mode }
      const result = paint(values, size, start, end, brush, value, start, { visited })
      for (let i = 0; i < values.length; i++) {
        const expected = mode === 'add' ? before[i] + value : mode === 'multiply' ? before[i] * value : value
        assert.ok(Math.abs(values[i] - expected) < 1e-15)
      }
      assert.deepEqual(updateValueRange(values, range, result), valueRange(values))
      if (mode === 'add' || mode === 'multiply') {
        const once = values.slice()
        const repeated = paint(values, size, end, start, brush, value, start, { visited })
        assert.deepEqual(values, once)
        assert.equal(repeated.bounds, null)
      }
      paint(values, size, end, end, brush, 1, start, { visited, erase: true })
      assert.ok(values.every(v => v === 0))
    }
  }
})

test('Fill sample-only stencils contain the paint value everywhere without modifying the workspace', () => {
  const size = 7, values = new Float64Array(size * size).fill(3), samples = new Map()
  paintBrushStroke(values, size, { x: 0, y: 0 }, { x: 6, y: 6 }, { shape: 'fill', mode: 'paste' }, -.3, undefined, {
    sampleOnly: true, onSample: (index, value) => samples.set(index, value),
  })
  assert.equal(samples.size, values.length)
  assert.ok([...samples.values()].every(v => v === -.3))
  assert.ok(values.every(v => v === 3))
})
