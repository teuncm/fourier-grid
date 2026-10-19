import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFrameQueue } from '../src/lib/frame-queue.js'

function scheduler() {
  const pending = new Map(); let id = 0
  return {
    request(callback) { pending.set(++id, callback); return id },
    cancel(key) { pending.delete(key) },
    get size() { return pending.size },
    tick() { const callbacks = [...pending.values()]; pending.clear(); for (const callback of callbacks) callback() },
  }
}
test('Frame queue applies only the latest gesture value once per frame', () => {
  const clock = scheduler(), applied = [], queue = createFrameQueue(value => applied.push(value), clock)
  queue.set(1); queue.set(2); queue.set(3)
  assert.equal(clock.size, 1); assert.deepEqual(applied, [])
  clock.tick(); assert.deepEqual(applied, [3]); assert.equal(clock.size, 0)
  queue.set(4); clock.tick(); assert.deepEqual(applied, [3, 4])
})
test('Flushing on release applies the final edit immediately without a duplicate scheduled frame', () => {
  const clock = scheduler(), applied = [], queue = createFrameQueue(value => applied.push(value), clock)
  queue.set(0); queue.flush(); assert.deepEqual(applied, [0]); assert.equal(clock.size, 0)
  clock.tick(); queue.flush(); assert.deepEqual(applied, [0])
})
test('Clearing on disposal drops stale gestures and allows a clean new session', () => {
  const clock = scheduler(), applied = [], queue = createFrameQueue(value => applied.push(value), clock)
  queue.set('old'); queue.clear(); queue.flush(); clock.tick(); assert.deepEqual(applied, [])
  queue.set('new'); clock.tick(); assert.deepEqual(applied, ['new'])
})
test('Applying a value may schedule another frame without losing the new edit', () => {
  const clock = scheduler(), applied = []
  const queue = createFrameQueue(value => { applied.push(value); if (value === 1) queue.set(2) }, clock)
  queue.set(1); clock.tick(); assert.equal(clock.size, 1); assert.deepEqual(applied, [1])
  clock.tick(); assert.deepEqual(applied, [1, 2])
})
