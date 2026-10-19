import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paintBrushStroke } from '../src/lib/brushes.js'
import { paintSymmetricStroke } from '../src/lib/symmetry.js'
import { paintRepeatedStroke } from '../src/lib/repeat.js'
import { valueRange, updateValueRange } from '../src/lib/grid.js'

const shapes = ['fill', 'dot', 'square', 'line', 'wave', 'gaussian', 'inverted-gaussian', 'radial-sine', 'radial-sinc']
const patterns = {
  plain: paintBrushStroke,
  symmetry: (...args) => { const options = args.pop(); return paintSymmetricStroke(...args, { enabled: true, slices: 5, angle: 23 }, options) },
  repeat: (...args) => { const options = args.pop(); return paintRepeatedStroke(...args, { columns: 3, rows: 2 }, options) },
}
function brush(shape, mode = 'multiply') { return { shape, mode, size: 3, angle: 29, wavelength: 3.7, sigma: 1.3, phase: 37 } }

for (const shape of shapes) test(`${shape}: Multiply matches its stencil, leaves outside intact, and keeps exact ranges with symmetry/repeat`, () => {
  for (const size of [1, 3, 7, 8, 31]) for (const paint of Object.values(patterns)) for (const factor of [-1, -.4, 0, .3, 1]) {
    const origin = { x: Math.floor(size * .3), y: Math.floor(size * .6) }
    const original = Float64Array.from({ length: size * size }, (_, i) => Math.sin(i + .2) * 5)
    const stencil = new Float64Array(original.length).fill(NaN)
    paint(stencil, size, origin, origin, brush(shape, 'paste'), factor, origin, {})
    const values = original.slice(), visited = new Uint8Array(values.length), before = valueRange(values)
    const result = paint(values, size, origin, origin, brush(shape), factor, origin, { visited })
    for (let i = 0; i < values.length; i++) assert.ok(Math.abs(values[i] - (Number.isNaN(stencil[i]) ? original[i] : original[i] * stencil[i])) < 1e-12)
    assert.deepEqual(updateValueRange(values, before, result), valueRange(values))
    const once = values.slice(), range = valueRange(values)
    const repeated = paint(values, size, origin, origin, brush(shape), factor, origin, { visited })
    assert.deepEqual(values, once)
    assert.equal(repeated.bounds, null)
    assert.deepEqual(updateValueRange(values, range, repeated), range)
    const twice = paint(values, size, origin, origin, brush(shape), factor, origin, { visited: new Uint8Array(values.length) })
    for (let i = 0; i < values.length; i++) assert.ok(Math.abs(values[i] - (Number.isNaN(stencil[i]) ? once[i] : once[i] * stencil[i])) < 1e-12)
    assert.deepEqual(updateValueRange(values, range, twice), valueRange(values))
  }
})

test('Multiply drags never apply twice to overlaps, but follow newly visited cells', () => {
  for (const paint of Object.values(patterns)) for (const shape of ['dot', 'square', 'line']) {
    const size = 15, values = new Float64Array(size * size).fill(8), visited = new Uint8Array(values.length)
    const origin = { x: 3, y: 7 }, end = { x: 6, y: 6 }
    paint(values, size, origin, origin, brush(shape), .5, origin, { visited })
    const initialCount = values.filter(v => v === 4).length
    let range = valueRange(values)
    const result = paint(values, size, origin, end, brush(shape), .5, origin, { visited })
    assert.ok(values.every(v => v === 4 || v === 8))
    assert.ok(values.filter(v => v === 4).length >= initialCount)
    if (paint === paintBrushStroke) assert.ok(values.filter(v => v === 4).length > initialCount)
    assert.deepEqual(updateValueRange(values, range, result), valueRange(values))
    range = valueRange(values)
    const back = paint(values, size, end, origin, brush(shape), .5, origin, { visited })
    assert.ok(values.every(v => v === 4 || v === 8))
    assert.deepEqual(updateValueRange(values, range, back), valueRange(values))
  }
})

test('Erase ignores Multiply masks and clears the whole touched footprint; zero stays zero', () => {
  for (const paint of Object.values(patterns)) for (const shape of shapes) {
    const size = 7, origin = { x: 3, y: 3 }, values = new Float64Array(size * size).fill(4)
    const stencil = new Float64Array(values.length).fill(NaN)
    paint(stencil, size, origin, origin, brush(shape, 'paste'), 1, origin, {})
    const range = valueRange(values)
    const result = paint(values, size, origin, origin, brush(shape), .7, origin, { visited: new Uint8Array(values.length).fill(1), erase: true })
    for (let i = 0; i < values.length; i++) assert.equal(values[i], Number.isNaN(stencil[i]) ? 4 : 0)
    assert.deepEqual(updateValueRange(values, range, result), valueRange(values))
    const zero = new Float64Array(values.length)
    paint(zero, size, origin, origin, brush(shape), -.7, origin, {})
    assert.ok(zero.every(v => v === 0))
  }
})
