import { fft2D } from '../lib/fft.browser.js'
import { gridRanges, gridPeakFromRanges } from '../lib/grid.js'

self.onmessage = async ({ data }) => {
  const { id, size, real, imaginary, inverse } = data
  try {
    const started = performance.now()
    const result = await fft2D(real, imaginary, size, inverse, { inPlace: true })
    const ranges = gridRanges(result)
    const peak = gridPeakFromRanges(ranges)
    self.postMessage(
      { id, ...result, ranges, peak, duration: performance.now() - started },
      [result.real.buffer, result.imaginary.buffer],
    )
  } catch (error) {
    self.postMessage({ id, error: error.message })
  }
}
