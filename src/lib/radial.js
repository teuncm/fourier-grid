export const isRadialBrush = shape => shape === 'radial-sine' || shape === 'radial-sinc'

export function radialValue(radius, brush) {
  const t = 2 * Math.PI * radius / brush.wavelength + (brush.phase || 0) * Math.PI / 180
  if (brush.shape === 'radial-sine') return Math.sin(t)
  return Math.abs(t) < 1e-6 ? 1 - t * t / 6 + t ** 4 / 120 : Math.sin(t) / t
}

let distances = null, field = null
export function getRadialField(size, brush, origin) {
  const geometry = `${size}:${origin.x}:${origin.y}`
  if (distances?.key !== geometry) {
    const values = distances?.values.length === size * size ? distances.values : new Float64Array(size * size)
    const columns = Float64Array.from({ length: size }, (_, x) => (x - origin.x) ** 2)
    const half = Math.ceil(size / 2)
    for (let y = 0; y < size; y++) {
      const row = ((y + half) % size) * size, dy2 = (y - origin.y) ** 2
      for (let x = 0; x < size; x++) values[row + ((x + half) % size)] = Math.sqrt(columns[x] + dy2)
    }
    distances = { key: geometry, values }
  }
  const key = `${geometry}:${brush.shape}:${brush.wavelength}:${brush.phase || 0}`
  if (field?.key === key) return field.values
  const values = field?.values.length === size * size ? field.values : new Float64Array(size * size)
  const scale = 2 * Math.PI / brush.wavelength, phase = (brush.phase || 0) * Math.PI / 180
  const sine = brush.shape === 'radial-sine'
  for (let i = 0; i < values.length; i++) {
    const t = distances.values[i] * scale + phase
    values[i] = sine ? Math.sin(t) : Math.abs(t) < 1e-6 ? 1 - t * t / 6 + t ** 4 / 120 : Math.sin(t) / t
  }
  field = { key, values }
  return values
}

export function radialPreview(brush, size, origin) {
  const phase = (brush.phase || 0) * Math.PI / 180, k = 2 * Math.PI / brush.wavelength
  const radius = Math.hypot(Math.max(origin.x + .5, size - origin.x - .5), Math.max(origin.y + .5, size - origin.y - .5))
  const rings = []
  const add = t => {
    const r = (t - phase) / k
    if (r > 1e-8 && r <= radius) rings.push({ radius: r, negative: (brush.shape === 'radial-sine' ? Math.sin(t) : Math.abs(t) < 1e-8 ? 1 : Math.sin(t) / t) < 0 })
  }
  const maximum = phase + k * radius
  if (brush.shape === 'radial-sine') {
    const first = Math.ceil((phase - Math.PI / 2) / Math.PI), last = Math.floor((maximum - Math.PI / 2) / Math.PI)
    const stride = Math.max(1, Math.ceil((last - first + 1) / 96))
    for (let j = first; j <= last; j += stride) add(Math.PI / 2 + j * Math.PI)
  } else {
    add(0)
    const count = Math.max(0, Math.ceil(maximum / Math.PI)), stride = Math.max(1, Math.ceil(count / 95))
    // Nonzero sinc extrema solve t*cos(t) - sin(t) = 0.
    for (let j = 1; j <= count; j += stride) {
      let t = (j + .5) * Math.PI
      t -= 1 / t
      for (let step = 0; step < 4; step++) t += (t * Math.cos(t) - Math.sin(t)) / (t * Math.sin(t))
      add(t)
    }
  }
  return rings
}
