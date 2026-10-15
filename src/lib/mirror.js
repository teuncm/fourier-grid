export function mirrorCanvasValues(values, size, direction) {
  if (direction !== 'horizontal' && direction !== 'vertical') throw new RangeError('Mirror direction must be horizontal or vertical.')
  const half = Math.floor(size / 2), shift = Math.ceil(size / 2)
  let changed = false
  const swap = (a, b) => {
    const value = values[a]
    if (value !== values[b]) changed = true
    values[a] = values[b]
    values[b] = value
  }
  if (direction === 'horizontal') {
    const left = new Uint32Array(half), right = new Uint32Array(half)
    for (let x = 0; x < half; x++) {
      left[x] = (x + shift) % size
      right[x] = (size - 1 - x + shift) % size
    }
    for (let row = 0; row < values.length; row += size) for (let x = 0; x < half; x++) swap(row + left[x], row + right[x])
  } else {
    for (let y = 0; y < half; y++) {
      const top = ((y + shift) % size) * size, bottom = ((size - 1 - y + shift) % size) * size
      for (let x = 0; x < size; x++) swap(top + x, bottom + x)
    }
  }
  return { bounds: changed ? { left: 0, top: 0, right: size - 1, bottom: size - 1 } : null }
}
