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
  // Stop comparing as soon as the shifted snapshot differs. This preserves
  // no-op handling for empty/periodic grids without a JS write for every pixel.
  for (let row = 0; row < size && !changed; row++) {
    const target = row * size, source = ((row - y + size) % size) * size
    for (let column = 0; column < x; column++) {
      if (values[target + column] !== original[source + size - x + column]) { changed = true; break }
    }
    if (!changed) for (let column = x; column < size; column++) {
      if (values[target + column] !== original[source + column - x]) { changed = true; break }
    }
  }
  if (!changed) return { bounds: null }
  for (let row = 0; row < size; row++) {
    const target = row * size, source = ((row - y + size) % size) * size
    if (x) values.set(original.subarray(source + size - x, source + size), target)
    values.set(original.subarray(source, source + size - x), target + x)
  }
  return { bounds: { left: 0, top: 0, right: size - 1, bottom: size - 1 } }
}
