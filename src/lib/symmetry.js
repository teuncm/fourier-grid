import { paintBrushStroke } from './brushes.js'
import { valueRange } from './grid.js'

const turn = Math.PI * 2
let mapping = null, workspace = null, sectors = null

export function sliceAt(point, size, symmetry) {
  const center = (size - 1) / 2
  if (point.x === center && point.y === center) return 0
  const angle = Math.atan2(point.y - center, point.x - center) - (symmetry.angle % 360) * Math.PI / 180
  return Math.min(symmetry.slices - 1, Math.floor(((angle % turn + turn) % turn) / (turn / symmetry.slices)))
}

export function sliceGuidePath(size, symmetry) {
  const center = size / 2, lines = []
  for (let slice = 0; slice < symmetry.slices; slice++) {
    const angle = (symmetry.angle + slice * 360 / symmetry.slices) * Math.PI / 180
    const cosine = Math.cos(angle), sine = Math.sin(angle)
    const radius = center / Math.max(Math.abs(cosine), Math.abs(sine))
    lines.push(`M${center},${center}L${center + radius * cosine},${center + radius * sine}`)
  }
  return lines.join('')
}

export function slicePolygon(size, symmetry, slice) {
  const center = size / 2, radius = size * 4
  const segments = Math.ceil(360 / symmetry.slices / 90)
  const points = [`${center},${center}`]
  for (let step = 0; step <= segments; step++) {
    const angle = (symmetry.angle + (slice + step / segments) * 360 / symmetry.slices) * Math.PI / 180
    points.push(`${center + radius * Math.cos(angle)},${center + radius * Math.sin(angle)}`)
  }
  return points.join(' ')
}

function getMapping(size, symmetry, sourceSlice) {
  const key = `${size}:${symmetry.slices}:${symmetry.angle % 360}:${sourceSlice}`
  if (mapping?.key === key) return mapping
  const sourceMask = new Uint8Array(size * size), sources = new Int32Array(size * size).fill(-1)
  const center = (size - 1) / 2, half = Math.floor(size / 2), mask = size - 1
  const rotations = Array.from({ length: symmetry.slices }, (_, i) => ({ cosine: Math.cos(i * turn / symmetry.slices), sine: Math.sin(i * turn / symmetry.slices) }))
  const sectorKey = `${size}:${symmetry.slices}:${symmetry.angle % 360}`
  if (sectors?.key !== sectorKey) {
    const slices = new Uint8Array(size * size)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) slices[y * size + x] = sliceAt({ x, y }, size, symmetry)
    sectors = { key: sectorKey, slices }
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (sectors.slices[y * size + x] === sourceSlice) sourceMask[((y + half) & mask) * size + ((x + half) & mask)] = 1
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const slice = sectors.slices[y * size + x]
    const rotation = rotations[(sourceSlice - slice + symmetry.slices) % symmetry.slices]
    const dx = x - center, dy = y - center
    const sx = center + dx * rotation.cosine - dy * rotation.sine
    const sy = center + dx * rotation.sine + dy * rotation.cosine
    if (sx < -.5 || sy < -.5 || sx > size - .5 || sy > size - .5) continue
    const px = Math.round(sx), py = Math.round(sy)
    if (px >= 0 && py >= 0 && px < size && py < size) {
      const index = ((py + half) & mask) * size + ((px + half) & mask)
      if (sourceMask[index]) { sources[y * size + x] = index; continue }
    }
    // Nearest inverse sampling avoids holes in rotated raster copies. At a
    // boundary, choose the nearest source pixel that belongs to the source slice.
    let nearest = -1, distance = Infinity
    for (const py of [Math.floor(sy + 1e-10), Math.ceil(sy - 1e-10)]) for (const px of [Math.floor(sx + 1e-10), Math.ceil(sx - 1e-10)]) {
      if (px < 0 || py < 0 || px >= size || py >= size) continue
      const index = ((py + half) & mask) * size + ((px + half) & mask)
      const d = (px - sx) ** 2 + (py - sy) ** 2
      if (sourceMask[index] && d < distance) { nearest = index; distance = d }
    }
    sources[y * size + x] = nearest
  }
  mapping = { key, sourceMask, sources }
  return mapping
}

export function paintSymmetricStroke(values, size, from, to, brush, value, origin, symmetry, options = {}) {
  if (!symmetry?.enabled) return paintBrushStroke(values, size, from, to, brush, value, origin, options)
  const erase = options.erase || false, wiping = brush.mode === 'wipe' && !erase
  const sourceSlice = sliceAt(brush.mode === 'wipe' ? to : origin || from, size, symmetry)
  const { sourceMask, sources } = getMapping(size, symmetry, sourceSlice)
  if (!workspace || workspace.samples.length !== values.length) {
    workspace = { samples: new Float64Array(values.length), marks: new Uint32Array(values.length), hits: [], epoch: 0 }
  }
  if (++workspace.epoch > 0xffffffff) { workspace.marks.fill(0); workspace.epoch = 1 }
  const { samples, marks, hits, epoch } = workspace
  hits.length = 0
  const finiteBrush = !['wave', 'gaussian'].includes(brush.shape)
  paintBrushStroke(samples, size, from, to, { ...brush, mode: wiping ? 'wipe' : 'paste' }, value, origin || from, {
    erase, sampleOnly: true,
    onSample(index, sample) {
      if (sourceMask[index]) {
        if (finiteBrush && marks[index] !== epoch) hits.push(index)
        samples[index] = sample
        marks[index] = epoch
      }
    },
  })

  let left = size, top = size, right = -1, bottom = -1
  let oldMin = Infinity, oldMax = -Infinity, newMin = Infinity, newMax = -Infinity
  let oldMinCount = 0, oldMaxCount = 0, newMinCount = 0, newMaxCount = 0
  const half = Math.floor(size / 2), mask = size - 1
  const visited = brush.mode === 'add' && !erase ? options.visited || new Uint8Array(values.length) : null
  function write(index, sample, x, y) {
    const previous = values[index]
    if (visited) { if (visited[index]) return; visited[index] = 1; sample += previous }
    if (sample === previous) return
    values[index] = sample
    if (previous < oldMin) { oldMin = previous; oldMinCount = 1 } else if (previous === oldMin) oldMinCount++
    if (previous > oldMax) { oldMax = previous; oldMaxCount = 1 } else if (previous === oldMax) oldMaxCount++
    if (sample < newMin) { newMin = sample; newMinCount = 1 } else if (sample === newMin) newMinCount++
    if (sample > newMax) { newMax = sample; newMaxCount = 1 } else if (sample === newMax) newMaxCount++
    if (x < left) left = x
    if (x > right) right = x
    if (y < top) top = y
    if (y > bottom) bottom = y
  }
  if (wiping) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) write(((y + half) & mask) * size + ((x + half) & mask), 0, x, y)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const source = sources[y * size + x]
    if (source >= 0 && marks[source] === epoch) write(((y + half) & mask) * size + ((x + half) & mask), samples[source], x, y)
  }
  // Inverse sampling can miss a rotated one-pixel footprint. Seed the nearest
  // destination for each finite brush cell; shared Add masks prevent duplicates.
  const center = (size - 1) / 2
  if (finiteBrush) for (let slice = 0; slice < symmetry.slices; slice++) {
    const angle = slice * turn / symmetry.slices, cosine = Math.cos(angle), sine = Math.sin(angle)
    for (const source of hits) {
      const sx = ((source % size + half) & mask) - center
      const sy = ((Math.floor(source / size) + half) & mask) - center
      const x = Math.round(center + sx * cosine - sy * sine)
      const y = Math.round(center + sx * sine + sy * cosine)
      if (x < 0 || y < 0 || x >= size || y >= size || sectors.slices[y * size + x] !== (sourceSlice + slice) % symmetry.slices) continue
      write(((y + half) & mask) * size + ((x + half) & mask), samples[source], x, y)
    }
  }
  return {
    bounds: right < 0 ? null : { left, top, right, bottom },
    oldMin, oldMax, newMin, newMax, oldMinCount, oldMaxCount, newMinCount, newMaxCount,
    range: wiping ? valueRange(values) : null,
  }
}
