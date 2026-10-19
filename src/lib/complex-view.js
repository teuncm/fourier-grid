import { createGrid, createValueChanges, recordValueChange } from './grid.js'

// Component slots stay real/imaginary internally; in polar view they hold magnitude/phase.
export function toPolar(grid, result = createGrid(Math.sqrt(grid.real.length))) {
  for (let i = 0; i < grid.real.length; i++) {
    const real = grid.real[i], imaginary = grid.imaginary[i]
    result.real[i] = Math.hypot(real, imaginary)
    result.imaginary[i] = result.real[i] === 0 ? 0 : Math.atan2(imaginary, real)
  }
  return result
}

export function toCartesian(grid, result = createGrid(Math.sqrt(grid.real.length))) {
  for (let i = 0; i < grid.real.length; i++) {
    const magnitude = grid.real[i], phase = grid.imaginary[i]
    // Empty samples and zero phase are common while drawing and after clearing.
    result.real[i] = magnitude === 0 ? 0 : phase === 0 ? magnitude : magnitude * Math.cos(phase)
    result.imaginary[i] = magnitude === 0 ? 0 : phase === 0 ? magnitude * phase : magnitude * Math.sin(phase)
  }
  return result
}

export function normalizePolar(grid) {
  let changed = false
  for (let i = 0; i < grid.real.length; i++) {
    let phase = grid.imaginary[i]
    if (grid.real[i] < 0) { grid.real[i] = -grid.real[i]; phase += Math.PI; changed = true }
    if (phase > Math.PI || phase < -Math.PI) phase = Math.atan2(Math.sin(phase), Math.cos(phase))
    if (phase !== grid.imaginary[i]) { grid.imaginary[i] = phase; changed = true }
  }
  return changed
}

// Only brush/manipulation bounds can have become noncanonical. Track any phase
// changes too, since a negative magnitude also shifts the companion component.
export function normalizePolarRegion(grid, size, bounds) {
  const result = { real: createValueChanges(), imaginary: createValueChanges() }
  if (!bounds) return result
  const half = Math.ceil(size / 2)
  for (let y = bounds.top; y <= bounds.bottom; y++) {
    const row = ((y + half) % size) * size
    for (let x = bounds.left; x <= bounds.right; x++) {
      const index = row + (x + half) % size
      const magnitude = grid.real[index], previousPhase = grid.imaginary[index]
      let phase = previousPhase
      if (magnitude < 0) {
        grid.real[index] = -magnitude
        recordValueChange(result.real, magnitude, -magnitude, x, y)
        phase += Math.PI
      }
      if (phase > Math.PI || phase < -Math.PI) phase = Math.atan2(Math.sin(phase), Math.cos(phase))
      if (phase !== previousPhase) {
        grid.imaginary[index] = phase
        recordValueChange(result.imaginary, previousPhase, phase, x, y)
      }
    }
  }
  return result
}
