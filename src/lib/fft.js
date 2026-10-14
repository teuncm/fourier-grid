/** Adapt wat-fft's complex WASM contexts to the editor's split 2D grids. */
export function createFFT2D(createContext) {
  const contexts = new Map()

  function getContext(size) {
    // The library starts at four samples. For shorter lines, zero-pad
    // to four and read bins at the matching stride.
    const length = Math.max(4, size)
    if (!contexts.has(length)) {
      const pending = Promise.resolve().then(() => createContext(length)).then(fft => ({
        fft,
        buffer: fft.getInputBuffer(),
        length,
      })).catch(error => {
        contexts.delete(length)
        throw error
      })
      contexts.set(length, pending)
    }
    return contexts.get(length)
  }

  return async function fft2D(real, imaginary, size, inverse = false, { inPlace = false } = {}) {
    if (!Number.isInteger(size) || size < 1 || !Number.isInteger(Math.log2(size))) {
      throw new RangeError('The grid size must be a power of two, at least 1.')
    }
    if (real.length !== size * size || imaginary.length !== size * size) {
      throw new RangeError('Both components must contain size × size values.')
    }
    if (inPlace && (!(real instanceof Float64Array) || !(imaginary instanceof Float64Array))) {
      throw new TypeError('In-place transforms require Float64Array components.')
    }
    const { fft, buffer, length } = await getContext(size)
    // The worker owns its transferred inputs and can return those same buffers.
    const outputReal = inPlace ? real : new Float64Array(real)
    const outputImaginary = inPlace ? imaginary : new Float64Array(imaginary)
    const binStride = (length / size) * 2

    // JS packs/unpacks each line; every FFT calculation runs in WebAssembly.
    // Synchronous passes prevent calls from overwriting each other's buffer.
    for (const columns of [false, true]) {
      for (let line = 0; line < size; line++) {
        const offset = columns ? line : line * size
        const stride = columns ? size : 1
        if (length !== size) buffer.fill(0)
        for (let i = 0; i < size; i++) {
          const index = offset + i * stride
          buffer[2 * i] = outputReal[index]
          buffer[2 * i + 1] = outputImaginary[index]
        }
        if (inverse) fft.inverse()
        else fft.forward()
        for (let i = 0; i < size; i++) {
          const index = offset + i * stride
          outputReal[index] = buffer[i * binStride]
          outputImaginary[index] = buffer[i * binStride + 1]
        }
      }
    }

    // wat-fft normalizes each inverse line by 1/length. Match the editor's
    // unitary 1/size convention in both directions, including padded lines.
    const scale = inverse ? (length * length) / size : 1 / size
    for (let i = 0; i < outputReal.length; i++) {
      outputReal[i] *= scale
      outputImaginary[i] *= scale
    }
    return { real: outputReal, imaginary: outputImaginary }
  }
}
