import { test } from 'node:test'
import assert from 'node:assert/strict'
import { radialValue, radialPreview } from '../src/lib/radial.js'
import { paintBrushStroke } from '../src/lib/brushes.js'
import { displayToIndex, valueRange, updateValueRange } from '../src/lib/grid.js'
import { paintRepeatedStroke } from '../src/lib/repeat.js'
import { paintSymmetricStroke } from '../src/lib/symmetry.js'

for (const shape of ['radial-sine', 'radial-sinc']) {
  test(`${shape}: full-canvas samples match the radial formula across sizes, centers, phases and frequencies`, () => {
    for (const size of [1, 2, 3, 16, 31, 32]) for (const phase of [-180, -90, 0, 90, 180]) {
      const brush = { shape, mode: 'paste', wavelength: Math.max(2, size / 3), phase }
      const origin = { x: Math.floor(size / 3), y: Math.floor(size / 2) }, values = new Float64Array(size * size)
      const result = paintBrushStroke(values, size, origin, origin, brush, -.75)
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const t = 2 * Math.PI * Math.hypot(x - origin.x, y - origin.y) / brush.wavelength + phase * Math.PI / 180
        const expected = -.75 * (shape === 'radial-sine' ? Math.sin(t) : Math.abs(t) < 1e-12 ? 1 : Math.sin(t) / t)
        assert.ok(Math.abs(values[displayToIndex(x, y, size)] - expected) < 1e-12)
        assert.ok(Number.isFinite(values[displayToIndex(x, y, size)]))
      }
      assert.deepEqual(result.range, valueRange(values))
    }
  })

  test(`${shape}: Paste, uncapped Add once per stroke, Wipe movement, and full-canvas erase work`, () => {
    const size = 31, origin = { x: 8, y: 13 }, next = { x: 24, y: 7 }
    const brush = { shape, wavelength: 9, phase: 45, mode: 'paste' }, values = new Float64Array(size * size).fill(5)
    paintBrushStroke(values, size, origin, origin, brush, 2)
    const stamp = values.slice(), visited = new Uint8Array(values.length)
    const result = paintBrushStroke(values, size, origin, next, { ...brush, mode: 'add' }, 2, origin, { visited })
    assert.deepEqual(values, Float64Array.from(stamp, v => v * 2))
    assert.deepEqual(result.range, valueRange(values))
    paintBrushStroke(values, size, origin, next, { ...brush, mode: 'add' }, 2, origin, { visited })
    assert.deepEqual(values, Float64Array.from(stamp, v => v * 2))
    paintBrushStroke(values, size, origin, next, { ...brush, mode: 'wipe' }, 2, origin)
    assert.notDeepEqual(values, stamp)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) assert.ok(Math.abs(values[displayToIndex(x, y, size)] - 2 * radialValue(Math.hypot(x - next.x, y - next.y), brush)) < 1e-12)
    paintBrushStroke(values, size, next, next, brush, 1, next, { erase: true })
    assert.ok(values.every(v => v === 0))
  })

  test(`${shape}: ring previews mark actual positive/negative extrema and stay bounded`, () => {
    for (const phase of [-180, -90, 0, 90, 180]) for (const wavelength of [2, 12, 64]) {
      const brush = { shape, wavelength, phase }, rings = radialPreview(brush, 127, { x: 23, y: 65 })
      assert.ok(rings.length > 0 && rings.length <= 96)
      for (const ring of rings) {
        const center = radialValue(ring.radius, brush), before = radialValue(ring.radius - 1e-5, brush), after = radialValue(ring.radius + 1e-5, brush)
        assert.equal(ring.negative, center < 0)
        assert.ok(ring.negative ? center <= before + 1e-12 && center <= after + 1e-12 : center >= before - 1e-12 && center >= after - 1e-12)
      }
    }
  })

  test(`${shape}: repeat and rotational symmetry retain range accounting in all modes`, () => {
    const size = 15, origin = { x: 10, y: 8 }, brush = { shape, wavelength: 7, phase: -90 }
    for (const mode of ['paste', 'add', 'wipe']) for (const operation of ['repeat', 'symmetry']) {
      const values = new Float64Array(size * size).fill(.25), before = valueRange(values)
      const result = operation === 'repeat'
        ? paintRepeatedStroke(values, size, origin, origin, { ...brush, mode }, -.7, origin, { columns: 3, rows: 2 })
        : paintSymmetricStroke(values, size, origin, origin, { ...brush, mode }, -.7, origin, { enabled: true, slices: 4, angle: 15 })
      assert.ok(values.every(Number.isFinite))
      assert.deepEqual(updateValueRange(values, before, result), valueRange(values))
    }
  })
}

test('Radial sine and sinc have finite, well-defined centers and phase-shifted removable limits', () => {
  assert.equal(radialValue(0, { shape: 'radial-sine', wavelength: 8, phase: 0 }), 0)
  assert.equal(radialValue(0, { shape: 'radial-sine', wavelength: 8, phase: 90 }), 1)
  assert.equal(radialValue(0, { shape: 'radial-sinc', wavelength: 8, phase: 0 }), 1)
  assert.equal(radialValue(2, { shape: 'radial-sinc', wavelength: 8, phase: -90 }), 1)
  for (const phase of [-1e-12, 1e-12]) assert.ok(Math.abs(radialValue(0, { shape: 'radial-sinc', wavelength: 8, phase }) - 1) < 1e-12)
})
