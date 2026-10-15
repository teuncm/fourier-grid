/** Adapt wat-fft's complex WASM contexts to the editor's split 2D grids. */
export function createFFT2D(createContext) {
  const contexts = new Map()
  const chirps = new Map()

  function getChirp(size, context) {
    if (chirps.has(size)) return chirps.get(size)
    const { fft, buffer, length } = context
    const cosine = new Float64Array(size), sine = new Float64Array(size)
    buffer.fill(0)
    for (let i = 0; i < size; i++) {
      const angle = Math.PI * ((i * i) % (2 * size)) / size
      cosine[i] = Math.cos(angle)
      sine[i] = Math.sin(angle)
      buffer[2 * i] = cosine[i]
      buffer[2 * i + 1] = sine[i]
      if (i) {
        buffer[2 * (length - i)] = cosine[i]
        buffer[2 * (length - i) + 1] = sine[i]
      }
    }
    fft.forward()
    const chirp = { cosine, sine, kernel: buffer.slice() }
    chirps.set(size, chirp)
    return chirp
  }

  function getContext(size) {
    // The library starts at four samples. For shorter lines, zero-pad
    // to four and read bins at the matching stride.
    const length = Math.max(4, 2 ** Math.ceil(Math.log2(size)))
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
    if (!Number.isInteger(size) || size < 1) {
      throw new RangeError('The grid size must be a positive integer.')
    }
    if (real.length !== size * size || imaginary.length !== size * size) {
      throw new RangeError('Both components must contain size × size values.')
    }
    if (inPlace && (!(real instanceof Float64Array) || !(imaginary instanceof Float64Array))) {
      throw new TypeError('In-place transforms require Float64Array components.')
    }
    const bluestein = !Number.isInteger(Math.log2(size))
    const context = await getContext(bluestein ? 2 * size - 1 : size)
    const { fft, buffer, length } = context
    const chirp = bluestein ? getChirp(size, context) : null
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
        if (bluestein) {
          // Bluestein reduces an exact N-point DFT to a padded convolution.
          // Both convolution FFTs run in WASM; padding does not change grid size.
          const { cosine, sine, kernel } = chirp
          for (let i = 0; i < size; i++) {
            const index = offset + i * stride
            const r = outputReal[index], im = inverse ? -outputImaginary[index] : outputImaginary[index]
            buffer[2 * i] = r * cosine[i] + im * sine[i]
            buffer[2 * i + 1] = im * cosine[i] - r * sine[i]
          }
          fft.forward()
          for (let i = 0; i < 2 * length; i += 2) {
            const r = buffer[i], im = buffer[i + 1]
            buffer[i] = r * kernel[i] - im * kernel[i + 1]
            buffer[i + 1] = r * kernel[i + 1] + im * kernel[i]
          }
          fft.inverse()
          for (let i = 0; i < size; i++) {
            const index = offset + i * stride
            const r = buffer[2 * i], im = buffer[2 * i + 1]
            outputReal[index] = r * cosine[i] + im * sine[i]
            outputImaginary[index] = (im * cosine[i] - r * sine[i]) * (inverse ? -1 : 1)
          }
          continue
        }
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
    const scale = inverse && !bluestein ? (length * length) / size : 1 / size
    for (let i = 0; i < outputReal.length; i++) {
      outputReal[i] *= scale
      outputImaginary[i] *= scale
    }
    return { real: outputReal, imaginary: outputImaginary }
  }
}
