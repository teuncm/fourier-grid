import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGrid } from '../src/lib/grid.js'
import { createHistory } from '../src/lib/history.js'

function state(size = 3, value = 0) {
  const result = { size, views: { spatial: false, frequency: false }, spatial: createGrid(size), frequency: createGrid(size) }
  for (const domain of ['spatial', 'frequency']) for (const key of ['real', 'imaginary']) result[domain][key].fill(value)
  return result
}

test('Undo and redo restore exact Float64 pairs, grid sizes and captured representations without aliasing', () => {
  const history = createHistory(), current = state(3)
  current.spatial.real[1] = Math.PI
  const before = structuredClone(current)
  history.begin(current)
  current.spatial.real[1] = 1e99; current.spatial.imaginary[2] = -7.1
  current.frequency.real[3] = -1e-100; current.frequency.imaginary[4] = 2.3
  current.views.frequency = true
  const after = structuredClone(current)
  assert.equal(history.commit(current), true)
  assert.equal(history.canUndo, true); assert.equal(history.canRedo, false)
  const restored = history.undo(current)
  assert.deepEqual(restored, before)
  current.spatial.real.fill(123)
  assert.deepEqual(history.redo(restored), after)
})

test('A live gesture captures its initial state once, and domain comparison ignores intermediate FFT output', () => {
  const history = createHistory(), current = state()
  history.begin(current)
  current.frequency.real.fill(.001)
  assert.equal(history.commit(current, 'spatial'), false)
  assert.equal(history.canUndo, false)
  const before = structuredClone(current)
  history.begin(current)
  current.spatial.real[0] = 1
  history.begin(current)
  current.spatial.real[1] = 2; current.frequency.imaginary.fill(3)
  assert.equal(history.undo(current), null)
  assert.equal(history.commit(current, 'spatial'), true)
  assert.deepEqual(history.undo(current), before)
  assert.equal(history.canUndo, false)
})

test('New edits discard redo, while no-ops preserve redo and do not consume steps', () => {
  const history = createHistory(), zero = state(), one = state(3, 1)
  history.begin(zero); history.commit(one)
  const restored = history.undo(one)
  history.begin(restored); assert.equal(history.commit(restored), false)
  assert.equal(history.canRedo, true)
  history.begin(restored); const two = state(3, 2); history.commit(two)
  assert.equal(history.canRedo, false)
  assert.deepEqual(history.undo(two), zero)
})

test('Resize checkpoints restore both old and new dimensions', () => {
  const history = createHistory(), small = state(1, 7), large = state(127, 3)
  history.begin(small); history.commit(large)
  const restored = history.undo(large)
  assert.deepEqual(restored, small)
  assert.deepEqual(history.redo(restored), large)
})

test('History obeys its combined step limit across undo/redo', () => {
  const history = createHistory({ maxSteps: 2 })
  for (let i = 0; i < 5; i++) { history.begin(state(1, i)); history.commit(state(1, i + 1)) }
  let current = history.undo(state(1, 5)); assert.equal(current.spatial.real[0], 4)
  current = history.undo(current); assert.equal(current.spatial.real[0], 3)
  assert.equal(history.canUndo, false)
  current = history.redo(current); assert.equal(current.spatial.real[0], 4)
  current = history.redo(current); assert.equal(current.spatial.real[0], 5)
  assert.equal(history.canRedo, false)
})

test('Byte budget evicts oldest snapshots, including mixed grid sizes and redo snapshots', () => {
  const history = createHistory({ maxBytes: 128 })
  for (let i = 0; i < 10; i++) { history.begin(state(1, i)); history.commit(state(1, i + 1)); assert.ok(history.retainedBytes <= 128) }
  let current = state(1, 10), steps = 0
  while (history.canUndo) { current = history.undo(current); steps++; assert.ok(history.retainedBytes <= 128) }
  assert.equal(steps, 4); assert.equal(current.spatial.real[0], 6)
  while (history.canRedo) { current = history.redo(current); assert.ok(history.retainedBytes <= 128) }
  assert.equal(current.spatial.real[0], 10)
  history.begin(current); history.commit(state(2, 20))
  current = history.undo(state(2, 20)); assert.equal(current.spatial.real[0], 10)
  assert.ok(history.retainedBytes <= 128)
})

test('Empty history and commit without a checkpoint are safe, and signed zero is a no-op', () => {
  const history = createHistory(), current = state(1)
  assert.equal(history.undo(current), null); assert.equal(history.redo(current), null)
  assert.equal(history.commit(current), false)
  history.begin(current); current.spatial.real[0] = -0
  assert.equal(history.commit(current), false)
  assert.equal(history.canUndo, false); assert.equal(history.retainedBytes, 0)
})
