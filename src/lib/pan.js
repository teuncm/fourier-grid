export function createCanvasPan(values, size) {
  return { size, original: values.slice(), x: 0, y: 0 }
}

export function panCanvasValues(values, snapshot, dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new RangeError('Pan offsets must be finite.')
  const { size, original } = snapshot
  const x = ((Math.round(dx) % size) + size) % size
  const y = ((Math.round(dy) % size) + size) % size
  if (x === snapshot.x && y === snapshot.y) return { bounds: null }
  snapshot.x = x
  snapshot.y = y
  let changed = false
  // A cyclic shift works directly in FFT storage order as well as display order.
  // Split each row at the wrap, keeping modulo and interpolation out of the pixel loop.
  for (let row = 0; row < size; row++) {
    const target = row * size, source = ((row - y + size) % size) * size
    for (let column = 0; column < x; column++) {
      const index = target + column, value = original[source + size - x + column]
      if (values[index] !== value) changed = true
      values[index] = value
    }
    for (let column = x; column < size; column++) {
      const index = target + column, value = original[source + column - x]
      if (values[index] !== value) changed = true
      values[index] = value
    }
  }
  return { bounds: changed ? { left: 0, top: 0, right: size - 1, bottom: size - 1 } : null }
}
