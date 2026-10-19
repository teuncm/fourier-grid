export function canvasPoint(clientX, clientY, rect, size, snapToGrid = false) {
  const x = clientX - rect.left, y = clientY - rect.top
  const origin = Math.floor(size / 2)
  return {
    x: snapToGrid && Math.abs(x - rect.width / 2) <= 8
      ? origin : Math.max(0, Math.min(size - 1, Math.floor(x / rect.width * size))),
    y: snapToGrid && Math.abs(y - rect.height / 2) <= 8
      ? origin : Math.max(0, Math.min(size - 1, Math.floor(y / rect.height * size))),
  }
}

export const manipulationSnapDistance = 8

// Keep the tolerance in screen pixels, before converting a drag to grid units.
// Each axis snaps independently to its value at the start of the gesture.
export function snapManipulationDelta(dx, dy, enabled = false) {
  return {
    x: enabled && Math.abs(dx) <= manipulationSnapDistance ? 0 : dx,
    y: enabled && Math.abs(dy) <= manipulationSnapDistance ? 0 : dy,
  }
}
