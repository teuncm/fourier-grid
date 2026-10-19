import { paintBrushStroke } from './brushes.js'

export function createGrid(size) {
  return {
    real: new Float64Array(size * size),
    imaginary: new Float64Array(size * size),
  }
}

// Both canvases show the origin in the middle; arrays use FFT ordering.
export function displayToIndex(x, y, size) {
  const half = Math.ceil(size / 2)
  return ((y + half) % size) * size + ((x + half) % size)
}

export function paintStroke(values, size, from, to, diameter, value) {
  paintBrushStroke(values, size, from, to, { shape: 'dot', size: diameter }, value)
}

export function gridPeak(grid) {
  let peak = 0
  for (let i = 0; i < grid.real.length; i++) {
    peak = Math.max(peak, Math.abs(grid.real[i]), Math.abs(grid.imaginary[i]))
  }
  return peak
}

export function valueRange(values) {
  if (!values.length) return { min: 0, max: 0, minCount: 0, maxCount: 0 }
  let min = values[0], max = min
  let minCount = 1, maxCount = 1
  for (let i = 1; i < values.length; i++) {
    const value = values[i]
    if (value < min) { min = value; minCount = 1 }
    else if (value === min) minCount++
    if (value > max) { max = value; maxCount = 1 }
    else if (value === max) maxCount++
  }
  return { min, max, minCount, maxCount }
}

export function gridRanges(grid) {
  return { real: valueRange(grid.real), imaginary: valueRange(grid.imaginary) }
}

export function gridPeakFromRanges(ranges) {
  return Math.max(Math.abs(ranges.real.min), Math.abs(ranges.real.max), Math.abs(ranges.imaginary.min), Math.abs(ranges.imaginary.max))
}

export function updateValueRange(values, current, changes) {
  if (changes.range) return changes.range
  if (!changes.bounds) return current
  const min = Math.min(current.min, changes.newMin), max = Math.max(current.max, changes.newMax)
  const minCount = min < current.min ? changes.newMinCount : current.minCount
    - (changes.oldMin === min ? changes.oldMinCount : 0) + (changes.newMin === min ? changes.newMinCount : 0)
  const maxCount = max > current.max ? changes.newMaxCount : current.maxCount
    - (changes.oldMax === max ? changes.oldMaxCount : 0) + (changes.newMax === max ? changes.newMaxCount : 0)
  // Rescan only when the last occurrence of an extreme was removed.
  if (minCount === 0 || maxCount === 0) return valueRange(values)
  return { min, max, minCount, maxCount }
}

export function createValueChanges() {
  return { bounds: null, oldMin: Infinity, oldMax: -Infinity, newMin: Infinity, newMax: -Infinity, oldMinCount: 0, oldMaxCount: 0, newMinCount: 0, newMaxCount: 0 }
}

export function recordValueChange(result, previous, value, x, y) {
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
