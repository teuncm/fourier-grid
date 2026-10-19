import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGrid, displayToIndex } from '../src/lib/grid.js'
import { getBrushFootprint, getLineFootprint, getWavePreview, getWaveValue, paintBrushStroke } from '../src/lib/brushes.js'
import { fft2D } from './helpers/fft.js'

const sample = (grid, x, y, size) => grid.real[displayToIndex(x, y, size)]
const waveBrush = { shape: 'wave', wavelength: 8, angle: 0 }

test('Inverted Gaussian is the signed Gaussian complement across tiny, odd, even, and large grids', () => {
  for (const size of [1, 2, 7, 32, 127, 1024]) {
    for (const center of [{ x: 0, y: 0 }, { x: Math.floor(size / 2), y: Math.floor(size / 2) }]) {
      for (const sigma of [.5, Math.max(.5, size / 4)]) {
        const normal = new Float64Array(size * size), inverted = new Float64Array(size * size)
        const brush = { shape: 'gaussian', sigma, mode: 'wipe' }
        paintBrushStroke(normal, size, center, center, brush, -.7)
        paintBrushStroke(inverted, size, center, center, { ...brush, shape: 'inverted-gaussian' }, -.7)
        assert.equal(inverted[displayToIndex(center.x, center.y, size)], 0)
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          const i = displayToIndex(x, y, size)
          const expected = -.7 * (1 - Math.exp(-((x - center.x) ** 2 + (y - center.y) ** 2) / (2 * sigma ** 2)))
          assert.ok(Math.abs(inverted[i] - expected) < 1e-15)
          assert.ok(Math.abs(normal[i] + inverted[i] + .7) < 1e-15)
        }
      }
    }
  }
})

test('Gaussian and inverted Gaussian frequency masks reconstruct the original complex signal', async () => {
  const size = 15, center = { x: 7, y: 7 }, input = createGrid(size)
  for (let i = 0; i < size * size; i++) {
    input.real[i] = Math.sin(i * .7) + .3
    input.imaginary[i] = Math.cos(i * .3) - .2
  }
  const spectrum = await fft2D(input.real, input.imaginary, size)
  const filtered = []
  for (const shape of ['gaussian', 'inverted-gaussian']) {
    const grid = { real: spectrum.real.slice(), imaginary: spectrum.imaginary.slice() }
    for (const values of Object.values(grid)) paintBrushStroke(values, size, center, center, { shape, sigma: 2, mode: 'multiply' }, 1)
    if (shape === 'inverted-gaussian') {
      assert.ok(grid.real[0] === 0)
      assert.ok(grid.imaginary[0] === 0)
    }
    filtered.push(await fft2D(grid.real, grid.imaginary, size, true))
  }
  for (const component of ['real', 'imaginary']) for (let i = 0; i < size * size; i++) {
    assert.ok(Math.abs(filtered[0][component][i] + filtered[1][component][i] - input[component][i]) < 1e-9)
  }
})

test('Gaussian samples match the 2D formula with signed peak values, changing σ, and clipped centers', () => {
  for (const size of [1, 2, 3, 5, 32, 33, 1024, 1025]) {
    const values = new Float64Array(size * size)
    for (const [sigma, center, value] of [[.5, { x: 0, y: 0 }, 1], [Math.max(.5, size / 8), { x: Math.floor(size / 2), y: Math.floor(size / 2) }, -.7]]) {
      paintBrushStroke(values, size, center, center, { shape: 'gaussian', sigma, mode: 'wipe' }, value)
      assert.equal(values[displayToIndex(center.x, center.y, size)], value)
      let error = 0
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const expected = value * Math.exp(-((x - center.x) ** 2 + (y - center.y) ** 2) / (2 * sigma * sigma))
        error = Math.max(error, Math.abs(values[displayToIndex(x, y, size)] - expected))
      }
      assert.ok(error < 1e-15)
    }
  }
})

test('Gaussian supports Paste, uncapped Add once per stroke, Wipe movement, erase, and 1x1', () => {
  for (const size of [1, 16]) {
    const values = new Float64Array(size * size).fill(2)
    const center = { x: Math.floor(size / 2), y: Math.floor(size / 2) }
    const brush = { shape: 'gaussian', sigma: 2, mode: 'paste' }
    paintBrushStroke(values, size, center, center, brush, .5)
    assert.equal(values[0], .5)
    const before = values.slice(), visited = new Uint8Array(values.length)
    brush.mode = 'add'
    paintBrushStroke(values, size, center, center, brush, 1, center, { visited })
    assert.equal(values[0], 1.5)
    const after = values.slice()
    paintBrushStroke(values, size, center, center, brush, 1, center, { visited })
    assert.deepEqual(values, after)
    for (let i = 0; i < values.length; i++) assert.ok(Math.abs(values[i] - before[i] * 3) < 1e-15)
    brush.mode = 'wipe'
    const next = { x: 0, y: 0 }
    paintBrushStroke(values, size, center, next, brush, -.5)
    assert.equal(values[displayToIndex(0, 0, size)], -.5)
    paintBrushStroke(values, size, next, next, brush, 1, next, { erase: true })
    assert.ok(values.every(v => v === 0))
  }
})

test('A centered Gaussian transforms into a Gaussian spectrum', async () => {
  const size = 128, sigma = 4, center = { x: size / 2, y: size / 2 }
  const grid = createGrid(size)
  paintBrushStroke(grid.real, size, center, center, { shape: 'gaussian', sigma, mode: 'wipe' }, 1)
  const spectrum = await fft2D(grid.real, grid.imaginary, size)
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [3, 4], [-3, -4]]) {
    const index = ((v + size) % size) * size + ((u + size) % size)
    const expected = 2 * Math.PI * sigma * sigma / size * Math.exp(-2 * Math.PI ** 2 * sigma * sigma * (u * u + v * v) / (size * size))
    assert.ok(Math.abs(spectrum.real[index] - expected) < 1e-8)
    assert.ok(Math.abs(spectrum.imaginary[index]) < 1e-8)
  }
})

test('Separated wave generation matches the direct cosine formula while moving, rotating, and changing frequency', () => {
  for (const size of [1, 2, 3, 4, 5, 32, 33, 1024, 1025]) {
    const values = new Float64Array(size * size)
    for (const [angle, frequency, origin] of [[0, .5, { x: 0, y: 0 }], [45, size / 2, { x: size - 1, y: 0 }], [175, Math.max(.5, size / 3), { x: 0, y: size - 1 }], [45, 1, { x: 0, y: 0 }]]) {
      const brush = { shape: 'wave', mode: 'wipe', angle, wavelength: size / frequency }
      paintBrushStroke(values, size, origin, origin, brush, 1, origin)
      let error = 0
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        error = Math.max(error, Math.abs(values[displayToIndex(x, y, size)] - getWaveValue(x, y, brush, origin)))
      }
      assert.ok(error < 2e-12, `${size}px angle=${angle}, frequency=${frequency}, error=${error}`)
    }
  }
})

test('Every brush paints, adds, wipes, and erases the sole sample on a 1 × 1 grid', () => {
  const point = { x: 0, y: 0 }
  for (const shape of ['dot', 'square', 'line', 'wave']) {
    const values = new Float64Array(1)
    const brush = { shape, size: 1, angle: 45, wavelength: 2 }
    for (const [mode, value, expected, erase] of [['paste', 0.6, 0.6], ['add', 0.7, 1.3], ['wipe', -0.4, -0.4], ['wipe', 1, 0, true]]) {
      const result = paintBrushStroke(values, 1, point, point, { ...brush, mode }, value, point, { erase })
      assert.ok(Math.abs(values[0] - expected) < 1e-12, `${shape} ${mode}`)
      assert.deepEqual(result.bounds, { left: 0, top: 0, right: 0, bottom: 0 })
      assert.ok(Number.isFinite(result.newPeak))
    }
  }
})

test('Square size sets its side length and paints the corners with signed values', () => {
  const size = 32
  const point = { x: 16, y: 16 }
  for (const side of [1, 5, 9]) {
    const grid = createGrid(size)
    paintBrushStroke(grid.real, size, point, point, { shape: 'square', size: side }, -0.5)
    assert.equal(grid.real.filter(value => value === -0.5).length, side * side)
    const half = (side - 1) / 2
    for (const dx of [-half, half]) {
      for (const dy of [-half, half]) assert.equal(sample(grid, point.x + dx, point.y + dy, size), -0.5)
    }
    assert.equal(sample(grid, point.x + half + 1, point.y, size), 0)
  }
})

test('A line extends across the entire grid with the requested width and direction', () => {
  const size = 32
  const point = { x: 16, y: 16 }
  const horizontal = createGrid(size)
  const vertical = createGrid(size)
  const brush = { shape: 'line', size: 3, angle: 0 }
  paintBrushStroke(horizontal.real, size, point, point, brush, 0.5)
  paintBrushStroke(vertical.real, size, point, point, { ...brush, angle: 90 }, 0.5)
  assert.equal(horizontal.real.filter(value => value === 0.5).length, size * 3)
  assert.equal(sample(horizontal, 0, 16, size), 0.5)
  assert.equal(sample(horizontal, size - 1, 16, size), 0.5)
  assert.equal(sample(horizontal, 16, 18, size), 0)
  assert.equal(vertical.real.filter(value => value === 0.5).length, size * 3)
  assert.equal(sample(vertical, 16, 0, size), 0.5)
  assert.equal(sample(vertical, 16, size - 1, size), 0.5)
  assert.equal(sample(vertical, 18, 16, size), 0)
})

test('Rotating a square changes its painted cells and the matching outline', () => {
  const size = 32
  const center = { x: 16, y: 16 }
  const brush = { shape: 'square', size: 9, angle: 45 }
  const grid = createGrid(size)
  paintBrushStroke(grid.real, size, center, center, brush, 0.7)
  assert.equal(sample(grid, 22, 16, size), 0.7)
  assert.equal(sample(grid, 20, 20, size), 0)
  const aligned = getBrushFootprint({ ...brush, angle: 0 })
  const rotated = getBrushFootprint(brush)
  assert.notEqual(rotated.outline, aligned.outline)
  assert.equal(getBrushFootprint({ ...brush, angle: 90 }), aligned)
  const expected = new Set()
  for (let i = 0; i < rotated.offsets.length; i += 2) expected.add((center.y + rotated.offsets[i + 1]) * size + center.x + rotated.offsets[i])
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) assert.equal(sample(grid, x, y, size), expected.has(y * size + x) ? 0.7 : 0)
  }
})

test('A diagonal one-pixel line reaches both grid corners', () => {
  const size = 32
  const point = { x: 16, y: 16 }
  const grid = createGrid(size)
  paintBrushStroke(grid.real, size, point, point, { shape: 'line', size: 1, angle: 45 }, 1)
  for (let x = 0; x < size; x++) assert.equal(sample(grid, x, x, size), 1)
  assert.equal(sample(grid, 19, 16, size), 0)
})

test('Dragging a thin diagonal line sweeps every band without gaps', () => {
  const size = 32
  const grid = createGrid(size)
  paintBrushStroke(grid.real, size, { x: 6, y: 6 }, { x: 12, y: 12 }, { shape: 'line', size: 1, angle: 135 }, 0.7)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) assert.equal(sample(grid, x, y, size), x + y >= 12 && x + y <= 24 ? 0.7 : 0)
  }
})

test('An off-center line clips at the grid edges without wrapping', () => {
  const size = 32
  const grid = createGrid(size)
  const point = { x: 0, y: 5 }
  paintBrushStroke(grid.real, size, point, point, { shape: 'line', size: 1, angle: 45 }, 1)
  assert.equal(sample(grid, 0, 5, size), 1)
  assert.equal(sample(grid, 26, 31, size), 1)
  assert.equal(sample(grid, 31, 5, size), 0)
  assert.equal(sample(grid, 0, 0, size), 0)
})

test('Wave brush fills the grid with positive peaks, negative troughs, and zero crossings', () => {
  const size = 32
  const point = { x: 16, y: 16 }
  const grid = createGrid(size)
  paintBrushStroke(grid.real, size, point, point, waveBrush, 0.6)
  assert.equal(sample(grid, 16, 16, size), 0.6)
  assert.equal(sample(grid, 20, 16, size), -0.6)
  assert.ok(Math.abs(sample(grid, 18, 16, size)) < 1e-12)
  assert.equal(sample(grid, 16, 20, size), 0.6)
  assert.ok(Math.abs(sample(grid, 25, 16, size) - 0.6 * Math.cos(Math.PI / 4)) < 1e-12)
  assert.equal(sample(grid, 0, 0, size), 0.6)
  assert.ok(Math.abs(sample(grid, 31, 31, size) - 0.6 * Math.cos(Math.PI / 4)) < 1e-12)
})

test('Direction rotates the bands and a negative value reverses their signs', () => {
  const size = 32
  const point = { x: 16, y: 16 }
  const grid = createGrid(size)
  paintBrushStroke(grid.real, size, point, point, { ...waveBrush, angle: 90 }, -0.7)
  assert.equal(sample(grid, 16, 16, size), -0.7)
  assert.equal(sample(grid, 16, 20, size), 0.7)
  assert.equal(sample(grid, 20, 16, size), -0.7)
})

test('Full-grid waves stay aligned to the stroke origin while dragging', () => {
  const size = 32
  const origin = { x: 8, y: 16 }
  const middle = { x: 12, y: 16 }
  const end = { x: 16, y: 16 }
  const grid = createGrid(size)
  paintBrushStroke(grid.real, size, origin, middle, waveBrush, 1, origin)
  const before = grid.real.slice()
  paintBrushStroke(grid.real, size, middle, end, waveBrush, 1, origin)
  assert.deepEqual(grid.real, before)
  assert.equal(sample(grid, 12, 16, size), -1)
  assert.equal(sample(grid, 16, 16, size), 1)
  assert.ok(Math.abs(sample(grid, 14, 16, size)) < 1e-12)
})

for (const shape of ['dot', 'square']) {
  test(`${shape} brush erases its whole footprint and clips at the grid edge`, () => {
    const size = 16
    const brush = { shape, size: 9 }
    const grid = createGrid(size)
    grid.real.fill(0.8)
    const point = { x: 0, y: 0 }
    paintBrushStroke(grid.real, size, point, point, brush, 0)
    assert.equal(sample(grid, 0, 0, size), 0)
    assert.equal(sample(grid, 4, 0, size), 0)
    assert.equal(sample(grid, 15, 0, size), 0.8)
    assert.equal(sample(grid, 0, 15, size), 0.8)
    assert.equal(sample(grid, 15, 15, size), 0.8)
  })
}

test('Line erase clears its full span while preserving neighboring samples', () => {
  const size = 16
  const grid = createGrid(size)
  grid.real.fill(0.8)
  const point = { x: 0, y: 0 }
  paintBrushStroke(grid.real, size, point, point, { shape: 'line', size: 3, angle: 0 }, 0)
  for (let x = 0; x < size; x++) {
    assert.equal(sample(grid, x, 0, size), 0)
    assert.equal(sample(grid, x, 1, size), 0)
    assert.equal(sample(grid, x, 2, size), 0.8)
    assert.equal(sample(grid, x, size - 1, size), 0.8)
  }
})

test('Wave erase clears the entire selected component', () => {
  const size = 16
  const grid = createGrid(size)
  grid.real.fill(0.8)
  grid.imaginary.fill(-0.4)
  paintBrushStroke(grid.real, size, { x: 0, y: 0 }, { x: 0, y: 0 }, waveBrush, 0)
  assert.ok(grid.real.every(value => value === 0))
  assert.ok(grid.imaginary.every(value => value === -0.4))
})

test('Changing size or line width changes the footprint used for paint and preview', () => {
  const center = { x: 16, y: 16 }
  const thin = getLineFootprint({ shape: 'line', size: 1, angle: 0 }, 32, center)
  const thick = getLineFootprint({ shape: 'line', size: 5, angle: 0 }, 32, center)
  const large = getBrushFootprint({ shape: 'dot', size: 17 })
  const small = getBrushFootprint({ shape: 'dot', size: 5 })
  assert.ok(thick.offsets.length > thin.offsets.length)
  assert.notEqual(thick.outline, thin.outline)
  assert.ok(large.offsets.length > small.offsets.length)
  assert.notEqual(large.outline, small.outline)
})

test('Line preview marks exactly the painted cells across the canvas at every angle', () => {
  const size = 32
  for (const angle of [0, 15, 45, 90, 135, 180]) {
    const brush = { shape: 'line', size: 3, angle }
    const center = { x: 13, y: 9 }
    const grid = createGrid(size)
    paintBrushStroke(grid.real, size, center, center, brush, 1)
    const preview = getLineFootprint(brush, size, center)
    const painted = new Set()
    for (let i = 0; i < preview.offsets.length; i += 2) painted.add(preview.offsets[i + 1] * size + preview.offsets[i])
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) assert.equal(sample(grid, x, y, size), painted.has(y * size + x) ? 1 : 0)
    }
    assert.ok(preview.outline.length > 0)
  }
})

test('Wave preview peaks and troughs match the full-grid wave and end at canvas edges', () => {
  const size = 32
  for (const angle of [0, 15, 45, 90, 135, 180]) {
    const brush = { ...waveBrush, angle }
    const origin = { x: 10, y: 10 }
    const preview = getWavePreview(brush, size, origin)
    for (const [path, expected] of [[preview.peaks, 1], [preview.troughs, -1]]) {
      const segments = [...path.matchAll(/M([^,]+),([^L]+)L([^,]+),([^M]+)/g)]
      assert.ok(segments.length > 0)
      for (const segment of segments) {
        const x = (Number(segment[1]) + Number(segment[3])) / 2 - 0.5
        const y = (Number(segment[2]) + Number(segment[4])) / 2 - 0.5
        assert.ok(Math.abs(getWaveValue(x, y, brush, origin) - expected) < 1e-12)
        for (const [px, py] of [[Number(segment[1]), Number(segment[2])], [Number(segment[3]), Number(segment[4])]]) {
          assert.ok(px >= 0 && px <= size && py >= 0 && py <= size)
          assert.ok(px === 0 || px === size || py === 0 || py === size)
        }
      }
    }
  }
})

for (const angle of [0, 90]) {
  test(`A ${angle}° painted wave has the expected pair of Fourier frequencies`, async () => {
    const size = 32
    const point = { x: 16, y: 16 }
    const grid = createGrid(size)
    paintBrushStroke(grid.real, size, point, point, { ...waveBrush, angle }, 1)
    const transformed = await fft2D(grid.real, grid.imaginary, size)
    const a = angle === 0 ? 4 : 4 * size
    const b = angle === 0 ? size - 4 : (size - 4) * size
    assert.ok(Math.abs(transformed.real[a] - size / 2) < 1e-8)
    assert.ok(Math.abs(transformed.real[b] - size / 2) < 1e-8)
    assert.equal(transformed.real.filter(value => Math.abs(value) > 1e-8).length, 2)
    assert.ok(transformed.imaginary.every(value => Math.abs(value) < 1e-8))
  })
}
