export function mergeBounds(first, second) {
  if (!first) return second ? { ...second } : null
  if (!second) return first
  return { left: Math.min(first.left, second.left), top: Math.min(first.top, second.top), right: Math.max(first.right, second.right), bottom: Math.max(first.bottom, second.bottom) }
}

// Keep every edit made before the next animation frame, using bounded storage.
export function createDirtyRegion() {
  let pending = null
  return {
    add(bounds) {
      if (!bounds) return
      if (!pending) pending = { ...bounds }
      else {
        pending.left = Math.min(pending.left, bounds.left)
        pending.top = Math.min(pending.top, bounds.top)
        pending.right = Math.max(pending.right, bounds.right)
        pending.bottom = Math.max(pending.bottom, bounds.bottom)
      }
    },
    take() {
      const bounds = pending
      pending = null
      return bounds
    },
  }
}

const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1
const packedViews = new WeakMap()
const packColor = (red, green, blue) => littleEndian
  ? (255 << 24) | (blue << 16) | (green << 8) | red
  : (red << 24) | (green << 16) | (blue << 8) | 255
const zeroColor = packColor(13, 22, 28)
const paletteSteps = 16384
const palettes = new Map()

function getPalette(logarithmic) {
  if (palettes.has(logarithmic)) return palettes.get(logarithmic)
  const positive = new Uint32Array(paletteSteps + 1)
  const negative = new Uint32Array(paletteSteps + 1)
  const denominator = Math.log(81)
  let previousPositive = zeroColor >>> 0, previousNegative = previousPositive
  for (let i = 1; i <= paletteSteps; i++) {
    const relative = i / paletteSteps
    const level = logarithmic ? Math.log1p(80 * relative) / denominator : relative
    const nextPositive = packColor(Math.round(13 + 157 * level), Math.round(22 + 233 * level), Math.round(28 + 194 * level)) >>> 0
    const nextNegative = packColor(Math.round(13 + 242 * level), Math.round(22 + 208 * level), Math.round(28 + 81 * level)) >>> 0
    // Only cache intervals whose endpoints round to the exact same RGB color.
    // Color boundaries retain the original formula, with no quantization.
    if (previousPositive === nextPositive) positive[i - 1] = previousPositive
    if (previousNegative === nextNegative) negative[i - 1] = previousNegative
    previousPositive = nextPositive
    previousNegative = nextNegative
  }
  positive[paletteSteps] = previousPositive
  negative[paletteSteps] = previousNegative
  const palette = { positive, negative }
  palettes.set(logarithmic, palette)
  return palette
}

export function renderGridPixels(values, size, peak, logarithmic, pixels, bounds = null) {
  const left = bounds ? bounds.left : 0
  const top = bounds ? bounds.top : 0
  const right = bounds ? bounds.right : size - 1
  const bottom = bounds ? bounds.bottom : size - 1
  const scale = peak > 1e-12 ? peak : 1
  const half = Math.ceil(size / 2)
  const logDenominator = Math.log(81)
  let packed = packedViews.get(pixels)
  if (!packed && pixels.byteOffset % 4 === 0) {
    packed = new Uint32Array(pixels.buffer, pixels.byteOffset, pixels.length / 4)
    packedViews.set(pixels, packed)
  }
  let previousValue = NaN, previousColor = zeroColor
  const palette = packed ? getPalette(logarithmic) : null
  for (let y = top; y <= bottom; y++) {
    const sourceRow = ((y + half) % size) * size
    let index = (y * size + left) * 4
    for (let x = left; x <= right; x++, index += 4) {
      const value = values[sourceRow + ((x + half) % size)]
      if (packed && value === 0) {
        packed[index / 4] = zeroColor
        continue
      }
      if (packed && value === previousValue) {
        packed[index / 4] = previousColor
        continue
      }
      const relative = Math.min(1, Math.abs(value) / scale)
      if (packed) {
        const color = (value >= 0 ? palette.positive : palette.negative)[Math.floor(relative * paletteSteps)]
        if (color) {
          previousValue = value
          previousColor = color
          packed[index / 4] = color
          continue
        }
      }
      const level = logarithmic ? Math.log1p(80 * relative) / logDenominator : relative
      const positive = value >= 0
      const red = Math.round(13 + ((positive ? 170 : 255) - 13) * level)
      const green = Math.round(22 + ((positive ? 255 : 230) - 22) * level)
      const blue = Math.round(28 + ((positive ? 222 : 109) - 28) * level)
      if (packed) {
        previousValue = value
        previousColor = packColor(red, green, blue)
        packed[index / 4] = previousColor
      } else {
        pixels[index] = red
        pixels[index + 1] = green
        pixels[index + 2] = blue
        pixels[index + 3] = 255
      }
    }
  }
}
