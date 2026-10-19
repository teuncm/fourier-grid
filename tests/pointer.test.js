import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canvasPoint, snapManipulationDelta } from '../src/lib/pointer.js'

test('Pointer mapping preserves raw coordinates when snapping is disabled and snaps each axis independently within eight screen pixels', () => {
  const rect = { left: 40, top: 70, width: 256, height: 256 }
  assert.deepEqual(canvasPoint(40 + 123, 70 + 123, rect, 256), { x: 123, y: 123 })
  assert.deepEqual(canvasPoint(40 + 123, 70 + 123, rect, 256, true), { x: 128, y: 128 })
  assert.deepEqual(canvasPoint(40 + 120, 70 + 100, rect, 256, true), { x: 128, y: 100 })
  assert.deepEqual(canvasPoint(40 + 100, 70 + 136, rect, 256, true), { x: 100, y: 128 })
  assert.deepEqual(canvasPoint(40 + 119.9, 70 + 136.1, rect, 256, true), { x: 119, y: 136 })
})

test('Snapping uses screen distance consistently on small and large, odd and even grids', () => {
  for (const size of [1, 2, 3, 31, 32, 127, 128, 1023, 1024]) for (const width of [100, 300]) {
    const rect = { left: 13, top: 29, width, height: width }, origin = Math.floor(size / 2)
    assert.deepEqual(canvasPoint(13 + width / 2 - 7, 29 + width / 2 + 7, rect, size, true), { x: origin, y: origin })
    const point = canvasPoint(13 + width / 2 - 9, 29 + width / 2 + 9, rect, size, true)
    assert.equal(point.x, Math.floor((width / 2 - 9) / width * size))
    assert.equal(point.y, Math.floor((width / 2 + 9) / width * size))
  }
})

test('Pointer positions remain clamped during capture outside canvas edges, with or without snapping', () => {
  const rect = { left: 20, top: 30, width: 200, height: 100 }
  for (const snap of [false, true]) {
    assert.deepEqual(canvasPoint(-100, -100, rect, 31, snap), { x: 0, y: 0 })
    assert.deepEqual(canvasPoint(500, 500, rect, 31, snap), { x: 30, y: 30 })
    assert.deepEqual(canvasPoint(120, 500, rect, 31, snap), { x: 15, y: 30 })
  }
})

test('Manipulation snapping independently locks deltas to the axes through the drag start', () => {
  for (const sign of [-1, 1]) {
    assert.deepEqual(snapManipulationDelta(7 * sign, 30 * sign, true), { x: 0, y: 30 * sign })
    assert.deepEqual(snapManipulationDelta(30 * sign, 7 * sign, true), { x: 30 * sign, y: 0 })
    assert.deepEqual(snapManipulationDelta(8 * sign, 8 * sign, true), { x: 0, y: 0 })
    assert.deepEqual(snapManipulationDelta(8.01 * sign, 8.01 * sign, true), { x: 8.01 * sign, y: 8.01 * sign })
    assert.deepEqual(snapManipulationDelta(7 * sign, 7 * sign), { x: 7 * sign, y: 7 * sign })
  }
})

test('Axis locking stays relative to the press point across canvas sizes and capture outside its edges', () => {
  for (const start of [{ x: 15, y: 21 }, { x: 140, y: 270 }]) for (const size of [1, 31, 1024]) for (const width of [100, 400]) {
    const delta = snapManipulationDelta(start.x + 6 - start.x, start.y - width * .4 - start.y, true)
    assert.equal(delta.x * size / width, 0)
    assert.equal(delta.y * size / width, -.4 * size)
    assert.deepEqual(snapManipulationDelta(6, -6, true), { x: 0, y: 0 })
  }
})
