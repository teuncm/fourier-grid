import { paintBrushStroke } from './brushes.js'
import { displayToIndex, valueRange } from './grid.js'

let cachedMapping = null, workspace = null

export function repeatLayout(size, repeat) {
  const count = axis => repeat?.[axis] ? Math.max(1, Math.min(size, Math.round(repeat[axis]))) : 1
  const columns = count('columns'), rows = count('rows')
  const edges = count => Array.from({ length: count + 1 }, (_, i) => Math.floor(i * size / count))
  return { columns, rows, xs: edges(columns), ys: edges(rows) }
}

export function repeatCell(point, size, repeat) {
  const layout = repeatLayout(size, repeat)
  const column = Math.min(layout.columns - 1, Math.max(0, Math.ceil((point.x + 1) * layout.columns / size) - 1))
  const row = Math.min(layout.rows - 1, Math.max(0, Math.ceil((point.y + 1) * layout.rows / size) - 1))
  return { column, row, left: layout.xs[column], top: layout.ys[row], width: layout.xs[column + 1] - layout.xs[column], height: layout.ys[row + 1] - layout.ys[row], layout }
}

export function repeatGuidePath(size, repeat) {
  const { xs, ys } = repeatLayout(size, repeat)
  return xs.slice(1, -1).map(x => `M${x},0V${size}`).concat(ys.slice(1, -1).map(y => `M0,${y}H${size}`)).join('')
}

export function repeatTiles(size, repeat, point) {
  const source = repeatCell(point, size, repeat), tiles = []
  const { xs, ys, columns, rows } = source.layout
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const left = xs[column], top = ys[row], width = xs[column + 1] - left, height = ys[row + 1] - top
    const sx = width / source.width, sy = height / source.height
    tiles.push({ left, top, width, height, sx, sy, transform: `translate(${left} ${top}) scale(${sx} ${sy}) translate(${-source.left} ${-source.top})` })
  }
  return { source, tiles }
}

function getMapping(size, repeat, point) {
  const { source, tiles } = repeatTiles(size, repeat, point)
  const key = `${size}:${source.layout.columns}:${source.layout.rows}:${source.column}:${source.row}`
  if (cachedMapping?.key === key) return cachedMapping
  const sources = new Int32Array(size * size), sourceMask = new Uint8Array(size * size)
  for (let y = source.top; y < source.top + source.height; y++) for (let x = source.left; x < source.left + source.width; x++) sourceMask[displayToIndex(x, y, size)] = 1
  for (const tile of tiles) for (let y = tile.top; y < tile.top + tile.height; y++) for (let x = tile.left; x < tile.left + tile.width; x++) {
    const sx = source.left + Math.min(source.width - 1, Math.floor((x - tile.left + .5) / tile.sx))
    const sy = source.top + Math.min(source.height - 1, Math.floor((y - tile.top + .5) / tile.sy))
    sources[y * size + x] = displayToIndex(sx, sy, size)
  }
  cachedMapping = { key, sources, sourceMask, source, tiles }
  return cachedMapping
}

export function paintRepeatedStroke(values, size, from, to, brush, value, origin, repeat, options = {}) {
  const layout = repeatLayout(size, repeat)
  if (layout.columns === 1 && layout.rows === 1) return paintBrushStroke(values, size, from, to, brush, value, origin, options)
  const { sources, sourceMask, source, tiles } = getMapping(size, repeat, brush.mode === 'wipe' ? to : origin || from)
  if (workspace?.samples.length !== values.length) workspace = { samples: new Float64Array(values.length), marks: new Uint32Array(values.length), hits: [], epoch: 0 }
  if (++workspace.epoch > 0xffffffff) { workspace.marks.fill(0); workspace.epoch = 1 }
  const { samples, marks, hits, epoch } = workspace
  hits.length = 0
  const erase = options.erase || false, wiping = brush.mode === 'wipe' && !erase
  const finite = !['wave', 'gaussian'].includes(brush.shape)
  paintBrushStroke(samples, size, from, to, { ...brush, mode: wiping ? 'wipe' : 'paste' }, value, origin || from, {
    erase, sampleOnly: true,
    onSample(index, sample) {
      if (!sourceMask[index]) return
      if (finite && marks[index] !== epoch) hits.push(index)
      samples[index] = sample
      marks[index] = epoch
    },
  })
  const visited = brush.mode === 'add' && !erase ? options.visited || new Uint8Array(values.length) : null
  let left = size, top = size, right = -1, bottom = -1
  let oldMin = Infinity, oldMax = -Infinity, newMin = Infinity, newMax = -Infinity
  let oldMinCount = 0, oldMaxCount = 0, newMinCount = 0, newMaxCount = 0
  function write(index, sample, x, y) {
    const previous = values[index]
    if (visited) { if (visited[index]) return; visited[index] = 1; sample += previous }
    if (sample === previous) return
    values[index] = sample
    if (previous < oldMin) { oldMin = previous; oldMinCount = 1 } else if (previous === oldMin) oldMinCount++
    if (previous > oldMax) { oldMax = previous; oldMaxCount = 1 } else if (previous === oldMax) oldMaxCount++
    if (sample < newMin) { newMin = sample; newMinCount = 1 } else if (sample === newMin) newMinCount++
    if (sample > newMax) { newMax = sample; newMaxCount = 1 } else if (sample === newMax) newMaxCount++
    left = Math.min(left, x); right = Math.max(right, x)
    top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  // Wipe clears once before placing every copy, including untouched tiles.
  if (wiping) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) write(displayToIndex(x, y, size), 0, x, y)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sourceIndex = sources[y * size + x]
    if (marks[sourceIndex] === epoch) write(displayToIndex(x, y, size), samples[sourceIndex], x, y)
  }
  // A narrow destination tile can miss a source pixel during inverse sampling.
  // Seed its nearest cell too; the Add mask deduplicates both passes.
  if (finite) for (const tile of tiles) for (const index of hits) {
    const sx = (index % size + Math.floor(size / 2)) % size
    const sy = (Math.floor(index / size) + Math.floor(size / 2)) % size
    const x = tile.left + Math.min(tile.width - 1, Math.floor((sx - source.left + .5) * tile.sx))
    const y = tile.top + Math.min(tile.height - 1, Math.floor((sy - source.top + .5) * tile.sy))
    write(displayToIndex(x, y, size), samples[index], x, y)
  }
  return { bounds: right < 0 ? null : { left, top, right, bottom }, oldMin, oldMax, newMin, newMax, oldMinCount, oldMaxCount, newMinCount, newMaxCount, range: wiping ? valueRange(values) : null }
}
