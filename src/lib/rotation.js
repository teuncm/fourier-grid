import { displayToIndex } from './grid.js'
export { createCanvasSnapshot as createCanvasRotation } from './canvas-snapshot.js'

export function rotateCanvasValues(values, snapshot, radians) {
  if (!Number.isFinite(radians)) throw new RangeError('Rotation angle must be finite.')
  const { size, stride, original, pixels } = snapshot
  const angle = radians % (2 * Math.PI), origin = Math.floor(size / 2)
  const snap = value => Math.abs(value - Math.round(value)) < 1e-12 ? Math.round(value) : value
  const cosine = snap(Math.cos(angle)), sine = snap(Math.sin(angle))
  let changed = false, min = Infinity, max = -Infinity, minCount = 0, maxCount = 0
  for (let y = 0; y < size; y++) {
    const dy = y - origin
    let sx = origin - origin * cosine - dy * sine
    let sy = origin - origin * sine + dy * cosine
    for (let x = 0; x < size; x++, sx += cosine, sy += sine) {
      const index = displayToIndex(x, y, size)
      let value = 0
      if (angle === 0) value = original[index]
      else if (sx >= -1 && sy >= -1 && sx < size && sy < size) {
        const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy
        const offset = (iy + 1) * stride + ix + 1
        value = pixels[offset] * (1 - fx) * (1 - fy) + pixels[offset + 1] * fx * (1 - fy)
          + pixels[offset + stride] * (1 - fx) * fy + pixels[offset + stride + 1] * fx * fy
      }
      if (values[index] !== value) { values[index] = value; changed = true }
      if (value < min) { min = value; minCount = 1 } else if (value === min) minCount++
      if (value > max) { max = value; maxCount = 1 } else if (value === max) maxCount++
    }
  }
  return { bounds: changed ? { left: 0, top: 0, right: size - 1, bottom: size - 1 } : null, range: { min, max, minCount, maxCount } }
}
