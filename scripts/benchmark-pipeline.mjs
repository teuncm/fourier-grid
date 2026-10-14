import { performance } from 'node:perf_hooks'
import { mkdir, writeFile } from 'node:fs/promises'
import { renderGridPixels } from '../src/lib/render.js'
import { paintBrushStroke, getLineFootprint } from '../src/lib/brushes.js'
import { gridPeak } from '../src/lib/grid.js'

const results = []
function measure(name, size, fn, repeats = 21) {
  for (let i = 0; i < 8; i++) fn(i)
  const times = []
  for (let i = 0; i < repeats; i++) { const start = performance.now(); fn(i + 8); times.push(performance.now() - start) }
  times.sort((a, b) => a - b)
  const result = { name, size, median: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * .95)] }
  results.push(result)
  console.log(JSON.stringify(result))
}
for (const size of [512, 1024]) {
  const real = new Float64Array(size * size), imaginary = new Float64Array(size * size)
  const pixels = new Uint8ClampedArray(size * size * 4)
  for (const kind of ['zero', 'sparse', 'bands', 'dense']) {
    for (let i = 0; i < real.length; i++) real[i] = kind === 'zero' ? 0 : kind === 'sparse' ? (i % 997 === 0 ? 1 : 0) : kind === 'bands' ? Math.sin((i % size) * .2) : Math.sin(i * .123) * Math.cos(i * .045)
    measure(`render-${kind}`, size, () => renderGridPixels(real, size, 1, true, pixels))
  }
  measure('scan-peak', size, () => gridPeak({ real, imaginary }))
  measure('copy-input', size, () => ({ real: real.slice(), imaginary: imaginary.slice() }))
  const snapshotReal = new Float64Array(real.length), snapshotImaginary = new Float64Array(imaginary.length)
  measure('copy-reused-input', size, () => { snapshotReal.set(real); snapshotImaginary.set(imaginary) })
  for (const shape of ['dot', 'square', 'wave', 'gaussian']) {
    const brush = { shape, size: 127, angle: 45, wavelength: size / 16, sigma: size / 32, mode: 'wipe' }
    measure(`wipe-${shape}`, size, i => {
      const point = { x: Math.floor(size / 2) + i % 9, y: Math.floor(size / 2) + i % 7 }
      paintBrushStroke(real, size, point, point, brush, 1, point)
    })
  }
  measure('preview-line', size, i => getLineFootprint({ size: 127, angle: 45 }, size, { x: size / 2 + i, y: size / 2 }))
}
await mkdir('.tmp', { recursive: true })
await writeFile('.tmp/pipeline-latest.json', JSON.stringify(results, null, 2))
