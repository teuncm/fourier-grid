import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFFT } from '@emnudge/wat-fft'
import { createFFT2D } from '../src/lib/fft.js'
import { fft2D } from './helpers/fft.js'

// wat-fft documents ~1e-9 accuracy from its WASM twiddle approximation.
function close(actual, expected, tolerance = 1e-9) {
  assert.equal(actual.length, expected.length)
  for (let i = 0; i < actual.length; i++) {
    assert.ok(Math.abs(actual[i] - expected[i]) < tolerance * (1 + Math.abs(expected[i])), `Sample ${i}: ${actual[i]} ≠ ${expected[i]}`)
  }
}

// Direct definition of a unitary DFT, independent of the FFT algorithm.
function directDFT(real, imaginary, size, inverse) {
  const result = { real: new Float64Array(size * size), imaginary: new Float64Array(size * size) }
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const angle = (inverse ? 1 : -1) * 2 * Math.PI * (u * x + v * y) / size
          const input = y * size + x
          result.real[v * size + u] += (real[input] * Math.cos(angle) - imaginary[input] * Math.sin(angle)) / size
          result.imaginary[v * size + u] += (real[input] * Math.sin(angle) + imaginary[input] * Math.cos(angle)) / size
        }
      }
    }
  }
  return result
}

for (const inverse of [false, true]) {
  for (const size of [1, 2, 4, 8, 16, 32]) {
    test(`${inverse ? 'Inverse' : 'Forward'} ${size} × ${size} FFT matches direct complex DFT`, async () => {
      const real = Float64Array.from({ length: size * size }, (_, i) => Math.sin(i * 1.3))
      const imaginary = Float64Array.from({ length: size * size }, (_, i) => Math.cos(i * 0.7))
      const actual = await fft2D(real, imaginary, size, inverse)
      const expected = directDFT(real, imaginary, size, inverse)
      close(actual.real, expected.real)
      close(actual.imaginary, expected.imaginary)
    })
  }
}

test('Worker-owned in-place buffers match complex DFTs and remain the returned buffers', async () => {
  for (const size of [1, 2, 4, 16]) for (const inverse of [false, true]) {
    const real = Float64Array.from({ length: size * size }, (_, i) => Math.sin(i * 1.3))
    const imaginary = Float64Array.from({ length: size * size }, (_, i) => Math.cos(i * .7))
    const expected = directDFT(real, imaginary, size, inverse)
    const actual = await fft2D(real, imaginary, size, inverse, { inPlace: true })
    assert.equal(actual.real, real)
    assert.equal(actual.imaginary, imaginary)
    close(real, expected.real)
    close(imaginary, expected.imaginary)
  }
  await assert.rejects(fft2D([1], [0], 1, false, { inPlace: true }), TypeError)
})

for (const size of [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024]) {
  test(`Complex ${size} × ${size} forward/inverse round trip`, async () => {
    const real = Float64Array.from({ length: size * size }, (_, i) => Math.sin(i * 1.1) * 3)
    const imaginary = Float64Array.from({ length: size * size }, (_, i) => Math.cos(i * 0.3) - 0.5)
    const transformed = await fft2D(real, imaginary, size)
    const restored = await fft2D(transformed.real, transformed.imaginary, size, true)
    close(restored.real, real)
    close(restored.imaginary, imaginary)
  })
}

test('Centered real impulse produces a constant real spectrum', async () => {
  const size = 8
  const real = new Float64Array(size * size)
  real[0] = 1
  const transformed = await fft2D(real, new Float64Array(size * size), size)
  close(transformed.real, new Float64Array(size * size).fill(1 / size))
  close(transformed.imaginary, new Float64Array(size * size))
})

test('Imaginary input remains part of the complex transform', async () => {
  const size = 8
  const imaginary = new Float64Array(size * size)
  imaginary[0] = -1
  const transformed = await fft2D(new Float64Array(size * size), imaginary, size)
  close(transformed.real, new Float64Array(size * size))
  close(transformed.imaginary, new Float64Array(size * size).fill(-1 / size))
})

test('A complex wave has one frequency with the correct sign and orientation', async () => {
  const size = 16
  const real = new Float64Array(size * size)
  const imaginary = new Float64Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const angle = 2 * Math.PI * (3 * x + 2 * y) / size
      real[y * size + x] = Math.cos(angle)
      imaginary[y * size + x] = Math.sin(angle)
    }
  }
  const transformed = await fft2D(real, imaginary, size)
  const expected = new Float64Array(size * size)
  expected[2 * size + 3] = size
  close(transformed.real, expected)
  close(transformed.imaginary, new Float64Array(size * size))
})

test('Unitary normalization preserves complex energy without mutating inputs', async () => {
  const size = 8
  const real = Float64Array.from({ length: size * size }, (_, i) => Math.sin(i))
  const imaginary = Float64Array.from({ length: size * size }, (_, i) => Math.cos(i * 3))
  const realBefore = real.slice()
  const imaginaryBefore = imaginary.slice()
  const transformed = await fft2D(real, imaginary, size)
  const energy = (r, im) => r.reduce((sum, value, i) => sum + value * value + im[i] * im[i], 0)
  const inputEnergy = energy(real, imaginary)
  assert.ok(Math.abs(inputEnergy - energy(transformed.real, transformed.imaginary)) < inputEnergy * 1e-9)
  assert.deepEqual(real, realBefore)
  assert.deepEqual(imaginary, imaginaryBefore)
})

test('Invalid dimensions fail clearly', async () => {
  await assert.rejects(fft2D([], [], 3), RangeError)
  await assert.rejects(fft2D([], [], 0), RangeError)
  await assert.rejects(fft2D(new Float64Array(8), new Float64Array(16), 4), RangeError)
})

test('Concurrent transforms do not overwrite the shared WASM buffers', async () => {
  const inputs = [16, 32, 16].map((size, index) => ({
    size,
    real: new Float64Array(size * size).fill(index + 1),
    imaginary: new Float64Array(size * size).fill(-0.5),
  }))
  const results = await Promise.all(inputs.map(input => fft2D(input.real, input.imaginary, input.size)))
  for (let i = 0; i < results.length; i++) {
    const expectedReal = new Float64Array(inputs[i].size ** 2)
    const expectedImaginary = new Float64Array(inputs[i].size ** 2)
    expectedReal[0] = inputs[i].size * (i + 1)
    expectedImaginary[0] = -inputs[i].size / 2
    close(results[i].real, expectedReal)
    close(results[i].imaginary, expectedImaginary)
  }
})

test('A failed WASM initialization can be retried', async () => {
  let attempts = 0
  const transform = createFFT2D(async size => {
    if (++attempts === 1) throw new Error('Initialization failed')
    return createFFT(size)
  })
  const real = new Float64Array(16 * 16)
  const imaginary = new Float64Array(16 * 16)
  real[0] = 1
  await assert.rejects(transform(real, imaginary, 16), /Initialization failed/)
  const result = await transform(real, imaginary, 16)
  close(result.real, new Float64Array(16 * 16).fill(1 / 16))
  assert.equal(attempts, 2)
})
