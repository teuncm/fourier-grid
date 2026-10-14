const footprints = new Map()
let waveField = null
let gaussianField = null

function cachedFootprint(key) {
  if (!footprints.has(key)) return null
  const result = footprints.get(key)
  footprints.delete(key)
  footprints.set(key, result)
  return result
}

function rememberFootprint(key, result) {
  footprints.set(key, result)
  if (footprints.size > 12) footprints.delete(footprints.keys().next().value)
  return result
}

function outlineCells(offsets, mask, columns, rows, left, top, edgeOffset = -0.5) {
  const edges = []
  const right = left + columns - 1
  const bottom = top + rows - 1
  for (let i = 0; i < offsets.length; i += 2) {
    const x = offsets[i]
    const y = offsets[i + 1]
    const index = (y - top) * columns + x - left
    if (y === top || !mask[index - columns]) edges.push(`M${x + edgeOffset},${y + edgeOffset}h1`)
    if (y === bottom || !mask[index + columns]) edges.push(`M${x + edgeOffset},${y + edgeOffset + 1}h1`)
    if (x === left || !mask[index - 1]) edges.push(`M${x + edgeOffset},${y + edgeOffset}v1`)
    if (x === right || !mask[index + 1]) edges.push(`M${x + edgeOffset + 1},${y + edgeOffset}v1`)
  }
  return edges.join('')
}

export function getBrushFootprint(brush) {
  const square = brush.shape === 'square'
  const diameter = brush.size
  const rotation = square ? ((brush.angle || 0) % 90 + 90) % 90 : 0
  const angle = rotation * Math.PI / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const key = `${square ? 'square' : 'circle'}:${diameter}:${rotation}`
  const cached = cachedFootprint(key)
  if (cached) return cached

  const radius = diameter / 2
  const extentX = Math.ceil(square ? radius * (Math.abs(cosine) + Math.abs(sine)) : radius)
  const extentY = extentX
  const columns = 2 * extentX + 1
  const rows = 2 * extentY + 1
  const mask = new Uint8Array(columns * rows)
  const offsets = []
  for (let y = -extentY; y <= extentY; y++) {
    for (let x = -extentX; x <= extentX; x++) {
      const inside = square
        ? Math.abs(x * cosine + y * sine) <= radius + 1e-10 && Math.abs(-x * sine + y * cosine) <= radius + 1e-10
        : x * x + y * y <= radius * radius
      if (inside) {
        mask[(y + extentY) * columns + x + extentX] = 1
        offsets.push(x, y)
      }
    }
  }

  // Outline the exact cells used by the brush, without filling the preview.
  const outline = outlineCells(offsets, mask, columns, rows, -extentX, -extentY)
  return rememberFootprint(key, { offsets: Int16Array.from(offsets), outline, extentX, extentY })
}

function visitLine(size, from, to, brush, visit) {
  const angle = (brush.angle || 0) * Math.PI / 180
  const normalX = -Math.sin(angle)
  const normalY = Math.cos(angle)
  const a = from.x * normalX + from.y * normalY
  const b = to.x * normalX + to.y * normalY
  // Sweeping the infinite strip continuously avoids gaps during fast drags.
  const low = Math.min(a, b) - brush.size / 2 - 1e-10
  const high = Math.max(a, b) + brush.size / 2 + 1e-10
  for (let y = 0; y < size; y++) {
    let first = 0
    let last = size - 1
    if (Math.abs(normalX) < 1e-10) {
      if (y * normalY < low || y * normalY > high) continue
    } else {
      const start = (low - y * normalY) / normalX
      const end = (high - y * normalY) / normalX
      first = Math.max(0, Math.ceil(Math.min(start, end)))
      last = Math.min(size - 1, Math.floor(Math.max(start, end)))
    }
    for (let x = first; x <= last; x++) visit(x, y)
  }
}

export function getLineFootprint(brush, size, center) {
  const key = `line:${size}:${brush.size}:${brush.angle || 0}:${center.x}:${center.y}`
  const cached = cachedFootprint(key)
  if (cached) return cached
  const mask = new Uint8Array(size * size)
  const offsets = []
  visitLine(size, center, center, brush, (x, y) => {
    mask[y * size + x] = 1
    offsets.push(x, y)
  })
  const outline = outlineCells(offsets, mask, size, size, 0, 0, 0)
  return rememberFootprint(key, { offsets: Int16Array.from(offsets), outline })
}

export function getWaveValue(x, y, brush, origin) {
  const angle = (brush.angle || 0) * Math.PI / 180
  const projection = (x - origin.x) * Math.cos(angle) + (y - origin.y) * Math.sin(angle)
  return Math.cos(2 * Math.PI * projection / brush.wavelength)
}

function getWaveField(size, brush, origin) {
  const key = `${size}:${brush.angle || 0}:${brush.wavelength}:${origin.x}:${origin.y}`
  if (waveField?.key === key) return waveField.values
  const angle = (brush.angle || 0) * Math.PI / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const values = waveField?.values.length === size * size ? waveField.values : new Float64Array(size * size)
  const half = Math.floor(size / 2)
  const mask = size - 1
  const columnCosines = new Float64Array(size)
  const columnSines = new Float64Array(size)
  // cos(a + b) separates the 2D wave into O(size) trigonometric evaluations.
  for (let x = 0; x < size; x++) {
    const phase = 2 * Math.PI * (x - origin.x) * cosine / brush.wavelength
    columnCosines[x] = Math.cos(phase)
    columnSines[x] = Math.sin(phase)
  }
  for (let y = 0; y < size; y++) {
    const phase = 2 * Math.PI * (y - origin.y) * sine / brush.wavelength
    const rowCosine = Math.cos(phase)
    const rowSine = Math.sin(phase)
    const row = ((y + half) & mask) * size
    for (let x = 0; x < size; x++) {
      values[row + ((x + half) & mask)] = columnCosines[x] * rowCosine - columnSines[x] * rowSine
    }
  }
  waveField = { key, values }
  return values
}

function getGaussianField(size, brush, origin) {
  const key = `${size}:${brush.sigma}:${origin.x}:${origin.y}`
  if (gaussianField?.key === key) return gaussianField.values
  const values = gaussianField?.values.length === size * size ? gaussianField.values : new Float64Array(size * size)
  const columns = new Float64Array(size)
  const denominator = 2 * brush.sigma * brush.sigma
  const half = Math.floor(size / 2), mask = size - 1
  // A Gaussian is separable: evaluate only one exponential per row/column.
  for (let x = 0; x < size; x++) columns[x] = Math.exp(-((x - origin.x) ** 2) / denominator)
  for (let y = 0; y < size; y++) {
    const rowValue = Math.exp(-((y - origin.y) ** 2) / denominator)
    const row = ((y + half) & mask) * size
    for (let x = 0; x < size; x++) values[row + ((x + half) & mask)] = columns[x] * rowValue
  }
  gaussianField = { key, values }
  return values
}

function clipBand(size, cosine, sine, projection) {
  const points = []
  const add = (x, y) => {
    if (x < -1e-9 || x > size + 1e-9 || y < -1e-9 || y > size + 1e-9) return
    x = Math.max(0, Math.min(size, x))
    y = Math.max(0, Math.min(size, y))
    if (!points.some(p => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9)) points.push({ x, y })
  }
  if (Math.abs(sine) > 1e-10) {
    add(0, projection / sine)
    add(size, (projection - size * cosine) / sine)
  }
  if (Math.abs(cosine) > 1e-10) {
    add(projection / cosine, 0)
    add((projection - size * sine) / cosine, size)
  }
  if (points.length < 2) return ''
  return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}`
}

export function getWavePreview(brush, size, origin) {
  const angle = (brush.angle || 0) * Math.PI / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  // SVG coordinates are pixel edges; wave values are sampled at pixel centers.
  const phase = (origin.x + 0.5) * cosine + (origin.y + 0.5) * sine
  const minimum = Math.min(0, size * cosine) + Math.min(0, size * sine)
  const maximum = Math.max(0, size * cosine) + Math.max(0, size * sine)
  const spacing = brush.wavelength / 2
  const peaks = []
  const troughs = []
  const first = Math.ceil((minimum - phase) / spacing)
  const last = Math.floor((maximum - phase) / spacing)
  for (let band = first; band <= last; band++) {
    const path = clipBand(size, cosine, sine, phase + band * spacing)
    if (band % 2 === 0) peaks.push(path)
    else troughs.push(path)
  }
  return { peaks: peaks.join(''), troughs: troughs.join('') }
}

export function paintBrushStroke(values, size, from, to, brush, value, origin = from, { visited, erase = false, onSample, sampleOnly = false } = {}) {
  const additive = brush.mode === 'add' && !erase
  // A shared mask applies one contribution per pixel over the whole stroke.
  const touched = additive ? visited || new Uint8Array(values.length) : null
  let changed = false
  let left = size, top = size, right = -1, bottom = -1
  let oldPeak = 0, newPeak = 0
  let oldMin = Infinity, oldMax = -Infinity, newMin = Infinity, newMax = -Infinity
  let oldMinCount = 0, oldMaxCount = 0, newMinCount = 0, newMaxCount = 0
  const replacing = brush.mode === 'wipe' && !erase
  const fullCanvas = brush.shape === 'wave' || brush.shape === 'gaussian'
  const trackRangeChanges = !replacing && !fullCanvas
  let clearing = false, paintedCount = 0, range = null
  const write = (index, sample, x, y) => {
    onSample?.(index, sample, x, y)
    if (sampleOnly) return
    const previous = values[index]
    if (additive) {
      if (touched[index]) return
      touched[index] = 1
      sample = previous + sample
    }
    if (sample === previous) return
    values[index] = sample
    changed = true
    if (trackRangeChanges) {
      if (previous < oldMin) { oldMin = previous; oldMinCount = 1 }
      else if (previous === oldMin) oldMinCount++
      if (previous > oldMax) { oldMax = previous; oldMaxCount = 1 }
      else if (previous === oldMax) oldMaxCount++
      if (sample < newMin) { newMin = sample; newMinCount = 1 }
      else if (sample === newMin) newMinCount++
      if (sample > newMax) { newMax = sample; newMaxCount = 1 }
      else if (sample === newMax) newMaxCount++
    }
    if (replacing && !clearing && sample !== 0) paintedCount++
    const oldMagnitude = Math.abs(previous)
    const newMagnitude = Math.abs(sample)
    if (oldMagnitude > oldPeak) oldPeak = oldMagnitude
    if (newMagnitude > newPeak) newPeak = newMagnitude
    if (x !== undefined) {
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  const result = () => ({
    bounds: changed ? { left, top, right, bottom } : null, oldPeak, newPeak,
    oldMin, oldMax, newMin, newMax, oldMinCount, oldMaxCount, newMinCount, newMaxCount,
    range: range || (replacing ? {
      min: paintedCount === values.length ? value : Math.min(0, value),
      max: paintedCount === values.length ? value : Math.max(0, value),
      minCount: value === 0 || paintedCount === values.length ? values.length : value < 0 ? paintedCount : values.length - paintedCount,
      maxCount: value === 0 || paintedCount === values.length ? values.length : value > 0 ? paintedCount : values.length - paintedCount,
    } : null),
  })
  if (erase) value = 0
  if (brush.mode === 'wipe' && !erase) {
    // Replace the selected canvas with one stamp, including on every drag move.
    from = to
    origin = to
    // Full-canvas brushes overwrite every sample; other shapes clear old pixels.
    if (!fullCanvas && !sampleOnly) {
      clearing = true
      const half = Math.floor(size / 2)
      for (let i = 0; i < values.length; i++) {
        if (values[i] !== 0) write(i, 0, (i % size + half) % size, (Math.floor(i / size) + half) % size)
      }
      clearing = false
    }
  }
  if (fullCanvas) {
    const field = value === 0 ? null : brush.shape === 'gaussian'
      ? getGaussianField(size, brush, origin) : getWaveField(size, brush, origin)
    if (sampleOnly) {
      for (let i = 0; i < values.length; i++) write(i, field ? value * field[i] : 0)
      return result()
    }
    let min = Infinity, max = -Infinity
    let minCount = 0, maxCount = 0
    for (let i = 0; i < values.length; i++) {
      write(i, field ? value * field[i] : 0)
      const sample = values[i]
      if (sample < min) { min = sample; minCount = 1 }
      else if (sample === min) minCount++
      if (sample > max) { max = sample; maxCount = 1 }
      else if (sample === max) maxCount++
    }
    range = { min, max, minCount, maxCount }
    left = top = 0; right = bottom = size - 1
    return result()
  }
  const half = Math.floor(size / 2)
  if (brush.shape === 'line') {
    visitLine(size, from, to, brush, (x, y) => {
      const index = ((y + half) % size) * size + ((x + half) % size)
      write(index, value, x, y)
    })
    return result()
  }
  const { offsets } = getBrushFootprint(brush)
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y))))
  for (let step = 0; step <= steps; step++) {
    const x = Math.round(from.x + (to.x - from.x) * step / steps)
    const y = Math.round(from.y + (to.y - from.y) * step / steps)
    for (let i = 0; i < offsets.length; i += 2) {
      const px = x + offsets[i]
      const py = y + offsets[i + 1]
      if (px < 0 || py < 0 || px >= size || py >= size) continue
      const index = ((py + half) % size) * size + ((px + half) % size)
      write(index, value, px, py)
    }
  }
  return result()
}
