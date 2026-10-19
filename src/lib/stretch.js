export { createCanvasSnapshot as createCanvasStretch } from './canvas-snapshot.js'

export function stretchFromDrag(dx, dy, size) {
  if (![dx, dy, size].every(Number.isFinite) || size < 1) throw new RangeError('Stretch drag must be finite and grid size positive.')
  // Screen y points down: right/up expands, left/down compresses.
  const factor = distance => Math.exp(Math.max(-Math.log(8), Math.min(Math.log(8), distance / size * Math.log(4))))
  const scaleX = factor(dx), scaleY = factor(-dy)
  return { a: scaleX, b: 0, c: 0, d: scaleY, scaleX, scaleY }
}

export function stretchCanvasValues(values, snapshot, matrix) {
  const { a, b, c, d } = matrix
  const determinant = a * d - b * c
  if (![a, b, c, d, determinant].every(Number.isFinite) || determinant <= 1e-12) throw new RangeError('Stretch must have a finite, positive scale.')
  const { size, stride, original, pixels, anchor } = snapshot
  const half = Math.ceil(size / 2)
  const identity = a === 1 && b === 0 && c === 0 && d === 1
  const ia = d / determinant, ib = -b / determinant, ic = -c / determinant, id = a / determinant
  let changed = false, min = Infinity, max = -Infinity, minCount = 0, maxCount = 0
  for (let y = 0; y < size; y++) {
    const row = ((y + half) % size) * size, rowEnd = row + size
    let index = row + half
    let sx = anchor.x - anchor.x * ia + (y - anchor.y) * ib
    let sy = anchor.y - anchor.x * ic + (y - anchor.y) * id
    for (let x = 0; x < size; x++, index++, sx += ia, sy += ic) {
      if (index === rowEnd) index = row
      let value = 0
      if (identity || (x === anchor.x && y === anchor.y)) value = original[index]
      else if (sx >= -1 && sy >= -1 && sx < size && sy < size) {
        const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy
        const offset = (iy + 1) * stride + ix + 1
        value = pixels[offset] * (1 - fx) * (1 - fy) + pixels[offset + 1] * fx * (1 - fy)
          + pixels[offset + stride] * (1 - fx) * fy + pixels[offset + stride + 1] * fx * fy
      }
      if (values[index] !== value) changed = true
      values[index] = value
      if (value < min) { min = value; minCount = 1 } else if (value === min) minCount++
      if (value > max) { max = value; maxCount = 1 } else if (value === max) maxCount++
    }
  }
  return { bounds: changed ? { left: 0, top: 0, right: size - 1, bottom: size - 1 } : null, range: { min, max, minCount, maxCount } }
}
