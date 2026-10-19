// Rotate and Stretch share a frozen FFT-order copy plus display-order pixels
// with a zero border for bilinear sampling. Copy each row in two contiguous runs.
export function createCanvasSnapshot(values, size) {
  const original = values.slice(), stride = size + 2
  const pixels = new Float64Array(stride * stride), half = Math.ceil(size / 2)
  for (let y = 0; y < size; y++) {
    const row = ((y + half) % size) * size, target = (y + 1) * stride + 1
    pixels.set(original.subarray(row + half, row + size), target)
    pixels.set(original.subarray(row, row + half), target + size - half)
  }
  return { size, stride, original, pixels, anchor: { x: Math.floor(size / 2), y: Math.floor(size / 2) } }
}
