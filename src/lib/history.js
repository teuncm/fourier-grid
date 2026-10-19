const domains = ['spatial', 'frequency']
const components = ['real', 'imaginary']

function snapshot(state) {
  const copy = { size: state.size, views: { ...state.views } }
  for (const domain of domains) copy[domain] = Object.fromEntries(components.map(key => [key, state[domain][key].slice()]))
  return copy
}

function bytes(state) {
  return domains.reduce((sum, domain) => sum + components.reduce((n, key) => n + state[domain][key].byteLength, 0), 0)
}

function same(before, after, domain) {
  if (before.size !== after.size) return false
  for (const name of domain ? [domain] : domains) {
    if (before.views[name] !== after.views[name]) return false
    for (const key of components) {
      const a = before[name][key], b = after[name][key]
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    }
  }
  return true
}

// Keep exact Float64 snapshots of both domains. Pending gestures aren't history
// entries until release; live FFT results never create their own entries.
export function createHistory({ maxSteps = 50, maxBytes = 128 * 1024 * 1024 } = {}) {
  const undo = [], redo = []
  let pending = null, retainedBytes = 0
  function push(stack, state) { stack.push(state); retainedBytes += bytes(state) }
  function pop(stack) { const state = stack.pop(); retainedBytes -= bytes(state); return state }
  function clear(stack) { while (stack.length) pop(stack) }
  function trim() {
    while (undo.length + redo.length > maxSteps || retainedBytes > maxBytes) {
      const stack = undo.length ? undo : redo
      if (!stack.length) break
      retainedBytes -= bytes(stack.shift())
    }
  }
  function travel(from, to, current) {
    if (pending || !from.length) return null
    const restored = pop(from)
    push(to, snapshot(current))
    trim()
    return restored
  }
  return {
    get canUndo() { return undo.length > 0 },
    get canRedo() { return redo.length > 0 },
    get retainedBytes() { return retainedBytes },
    begin(state) { if (!pending) pending = snapshot(state) },
    commit(state, domain = null) {
      const before = pending
      pending = null
      if (!before || same(before, state, domain)) return false
      clear(redo)
      push(undo, before)
      trim()
      return true
    },
    undo(state) { return travel(undo, redo, state) },
    redo(state) { return travel(redo, undo, state) },
  }
}
