export function createFrameQueue(apply, { request = requestAnimationFrame, cancel = cancelAnimationFrame } = {}) {
  let frame = null, pending = null
  function flush() {
    if (frame !== null) cancel(frame)
    frame = null
    const latest = pending
    pending = null
    if (latest !== null) apply(latest)
  }
  return {
    set(value) {
      pending = value
      if (frame === null) frame = request(flush)
    },
    flush,
    clear() {
      if (frame !== null) cancel(frame)
      frame = pending = null
    },
  }
}
