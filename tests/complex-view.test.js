import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGrid, gridRanges, updateValueRange } from '../src/lib/grid.js'
import { toCartesian, toPolar, normalizePolar, normalizePolarRegion } from '../src/lib/complex-view.js'
import { fft2D } from './helpers/fft.js'

function close(actual, expected, tolerance = 1e-12) {
  for (const key of ['real', 'imaginary']) for (let i = 0; i < actual[key].length; i++)
    assert.ok(Math.abs(actual[key][i] - expected[key][i]) <= tolerance * Math.max(1, Math.abs(expected[key][i])))
}

test('Polar conversion handles quadrants, zero, tiny/odd/even grids and preserves input', () => {
  for (const size of [1, 2, 3, 7, 16, 127]) {
    const grid = createGrid(size)
    for (let i = 0; i < grid.real.length; i++) { grid.real[i] = i % 5 ? Math.sin(i) * 9 : 0; grid.imaginary[i] = i % 7 ? Math.cos(i) * 3 : 0 }
    const original = structuredClone(grid), polar = toPolar(grid)
    assert.deepEqual(grid, original)
    for (let i = 0; i < grid.real.length; i++) {
      assert.equal(polar.real[i], Math.hypot(grid.real[i], grid.imaginary[i]))
      assert.ok(polar.imaginary[i] >= -Math.PI && polar.imaginary[i] <= Math.PI)
      if (polar.real[i] === 0) assert.equal(polar.imaginary[i], 0)
    }
    close(toCartesian(polar), grid)
  }
})

test('Signed magnitude and arbitrary phase normalize without changing the complex signal', () => {
  const polar = createGrid(7)
  for (let i = 0; i < polar.real.length; i++) { polar.real[i] = Math.sin(i) * 10; polar.imaginary[i] = (i - 24) * 3.7 }
  const expected = toCartesian(polar)
  assert.equal(normalizePolar(polar), true)
  assert.ok(polar.real.every(v => v >= 0))
  assert.ok(polar.imaginary.every(v => v >= -Math.PI && v <= Math.PI))
  close(toCartesian(polar), expected)
  assert.equal(normalizePolar(polar), false)
})

test('Phase edits at zero magnitude stay finite and take effect in the complex values when magnitude is added', () => {
  const polar = createGrid(1)
  polar.imaginary[0] = Math.PI / 2
  normalizePolar(polar)
  assert.equal(polar.imaginary[0], Math.PI / 2)
  close(toCartesian(polar), createGrid(1))
  polar.real[0] = 3
  const cartesian = toCartesian(polar)
  assert.ok(Math.abs(cartesian.real[0]) < 1e-14)
  assert.equal(cartesian.imaginary[0], 3)
})

test('Editing magnitude preserves phase, editing phase preserves magnitude, and conversion leaves snapshots intact', () => {
  const original = createGrid(2); original.real.fill(3); original.imaginary.fill(4)
  const polar = toPolar(original), phase = polar.imaginary.slice()
  polar.real.fill(10)
  const scaled = toCartesian(polar)
  assert.deepEqual(polar.imaginary, phase)
  for (let i = 0; i < 4; i++) { assert.ok(Math.abs(scaled.real[i] - 6) < 1e-14); assert.ok(Math.abs(scaled.imaginary[i] - 8) < 1e-14) }
  const magnitude = polar.real.slice()
  for (let i = 0; i < 4; i++) polar.imaginary[i] += 1.7
  normalizePolar(polar)
  assert.deepEqual(polar.real, magnitude)
  const rotated = toPolar(toCartesian(polar))
  close(rotated, polar)
  assert.ok(original.real.every(v => v === 3)); assert.ok(original.imaginary.every(v => v === 4))
})

test('Forward and inverse FFTs agree across independently selected representations', async () => {
  for (const size of [1, 3, 8, 15]) {
    const grid = createGrid(size)
    for (let i = 0; i < grid.real.length; i++) { grid.real[i] = Math.sin(i * .3); grid.imaginary[i] = Math.cos(i * .7) }
    const expected = await fft2D(grid.real, grid.imaginary, size)
    const input = toCartesian(toPolar(grid)), transformed = await fft2D(input.real, input.imaginary, size)
    close(transformed, expected)
    const output = toCartesian(toPolar(transformed)), restored = await fft2D(output.real, output.imaginary, size, true)
    close(restored, grid, 1e-8)
  }
})

test('Complex conversions reuse supplied buffers and support in-place conversion without source aliasing errors', () => {
  for (const size of [1, 2, 7, 32]) {
    const grid = createGrid(size)
    for (let i = 0; i < grid.real.length; i++) { grid.real[i] = Math.sin(i) * 4; grid.imaginary[i] = Math.cos(i) * 7 }
    const original = structuredClone(grid), expected = toPolar(grid), target = createGrid(size)
    assert.equal(toPolar(grid, target), target); assert.deepEqual(target, expected)
    assert.deepEqual(grid, original)
    assert.equal(toPolar(grid, grid), grid); assert.deepEqual(grid, expected)
    assert.equal(toCartesian(grid, grid), grid); close(grid, original)
    assert.equal(toCartesian(expected, target), target); close(target, original)
  }
})

test('Regional normalization matches full normalization with exact incremental ranges on tiny, odd and even grids', () => {
  for (const size of [1, 2, 3, 7, 8, 127]) {
    const grid = createGrid(size)
    grid.real.fill(1); grid.imaginary.fill(.2)
    const bounds = { left: 0, top: Math.floor(size / 3), right: Math.floor(size * .7), bottom: size - 1 }
    const half = Math.ceil(size / 2)
    for (let y = bounds.top; y <= bounds.bottom; y++) for (let x = bounds.left; x <= bounds.right; x++) {
      const i = ((y + half) % size) * size + (x + half) % size
      grid.real[i] = Math.sin(i) * 3; grid.imaginary[i] = Math.cos(i) * 20
    }
    const expected = structuredClone(grid), ranges = gridRanges(grid)
    normalizePolar(expected)
    const changes = normalizePolarRegion(grid, size, bounds)
    assert.deepEqual(grid, expected)
    for (const component of ['real', 'imaginary']) assert.deepEqual(updateValueRange(grid[component], ranges[component], changes[component]), gridRanges(grid)[component])
  }
})

test('Regional normalization leaves samples outside its bounds untouched and returns empty changes for no work', () => {
  const grid = createGrid(3); grid.real.fill(-1); grid.imaginary.fill(10)
  const before = structuredClone(grid)
  const result = normalizePolarRegion(grid, 3, { left: 1, top: 1, right: 1, bottom: 1 })
  assert.equal(grid.real[0], 1); assert.ok(Math.abs(grid.imaginary[0]) <= Math.PI)
  for (let i = 1; i < 9; i++) { assert.equal(grid.real[i], before.real[i]); assert.equal(grid.imaginary[i], before.imaginary[i]) }
  assert.deepEqual(result.real.bounds, { left: 1, top: 1, right: 1, bottom: 1 })
  assert.equal(normalizePolarRegion(grid, 3, null).imaginary.bounds, null)
  assert.equal(normalizePolarRegion(grid, 3, { left: 1, top: 1, right: 1, bottom: 1 }).real.bounds, null)
})
