import { getBrushFootprint } from './brushes.js'
import { displayToIndex } from './grid.js'

export function createPhaseSelection(grid, size, center, brush) {
  if (!['dot', 'square'].includes(brush.shape)) throw new RangeError('Phase rotation requires Circle or Square.')
  const { offsets } = getBrushFootprint(brush)
  let count = 0
  for (let i = 0; i < offsets.length; i += 2) {
    const x = center.x + offsets[i], y = center.y + offsets[i + 1]
    if (x >= 0 && x < size && y >= 0 && y < size) count++
  }
  const indices = new Uint32Array(count), positions = new Uint32Array(count)
  const real = new Float64Array(count), imaginary = new Float64Array(count)
  let cursor = 0
  for (let i = 0; i < offsets.length; i += 2) {
    const x = center.x + offsets[i], y = center.y + offsets[i + 1]
    if (x < 0 || x >= size || y < 0 || y >= size) continue
    const index = displayToIndex(x, y, size)
    indices[cursor] = index
    positions[cursor] = y * size + x
    real[cursor] = grid.real[index]
    imaginary[cursor++] = grid.imaginary[index]
  }
  return { size, indices, positions, real, imaginary }
}

function changes() {
  return { bounds: null, oldMin: Infinity, oldMax: -Infinity, newMin: Infinity, newMax: -Infinity, oldMinCount: 0, oldMaxCount: 0, newMinCount: 0, newMaxCount: 0 }
}

function record(result, previous, value, x, y) {
  if (previous < result.oldMin) { result.oldMin = previous; result.oldMinCount = 1 } else if (previous === result.oldMin) result.oldMinCount++
  if (previous > result.oldMax) { result.oldMax = previous; result.oldMaxCount = 1 } else if (previous === result.oldMax) result.oldMaxCount++
  if (value < result.newMin) { result.newMin = value; result.newMinCount = 1 } else if (value === result.newMin) result.newMinCount++
  if (value > result.newMax) { result.newMax = value; result.newMaxCount = 1 } else if (value === result.newMax) result.newMaxCount++
  if (!result.bounds) result.bounds = { left: x, top: y, right: x, bottom: y }
  else {
    result.bounds.left = Math.min(result.bounds.left, x); result.bounds.right = Math.max(result.bounds.right, x)
    result.bounds.top = Math.min(result.bounds.top, y); result.bounds.bottom = Math.max(result.bounds.bottom, y)
  }
}

export function rotatePhaseSelection(grid, selection, radians) {
  if (!Number.isFinite(radians)) throw new RangeError('Phase angle must be finite.')
  const angle = radians % (2 * Math.PI), cosine = Math.cos(angle), sine = Math.sin(angle)
  const result = { real: changes(), imaginary: changes() }
  const { size, indices, positions, real, imaginary } = selection
  for (let i = 0; i < indices.length; i++) {
    // Always rotate the captured values, so reversing a drag restores them
    // without accumulating numerical drift or depending on pointer frequency.
    const r = angle === 0 ? real[i] : real[i] * cosine - imaginary[i] * sine
    const im = angle === 0 ? imaginary[i] : real[i] * sine + imaginary[i] * cosine
    const index = indices[i], x = positions[i] % size, y = Math.floor(positions[i] / size)
    if (grid.real[index] !== r) { record(result.real, grid.real[index], r, x, y); grid.real[index] = r }
    if (grid.imaginary[index] !== im) { record(result.imaginary, grid.imaginary[index], im, x, y); grid.imaginary[index] = im }
  }
  return result
}
