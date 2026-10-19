import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGrid, displayToIndex, valueRange, updateValueRange } from '../src/lib/grid.js'
import { paintBrushStroke } from '../src/lib/brushes.js'
import { paintSymmetricStroke, sliceAt, sliceGuidePath } from '../src/lib/symmetry.js'

const symmetry = { enabled: true, slices: 4, angle: 0 }
const center = { x: 6, y: 5 }
const brush = { shape: 'dot', size: 1, mode: 'paste' }
const sample = (values, x, y, size = 8) => values[displayToIndex(x, y, size)]

test('Odd-grid symmetry rotates around the central pixel without shifting copies', () => {
  const size = 9, point = { x: 7, y: 5 }, values = new Float64Array(size * size)
  paintSymmetricStroke(values, size, point, point, brush, 1, point, symmetry)
  for (const [x, y] of [[7,5], [3,7], [1,3], [5,1]]) assert.equal(sample(values,x,y,size),1)
  assert.equal(values.filter(v => v !== 0).length,4)
})

test('Four slices copy one pixel to exact quarter-turn positions around the canvas center', () => {
  const values = new Float64Array(64)
  paintSymmetricStroke(values, 8, center, center, brush, -.7, center, symmetry)
  for (const [x,y] of [[6,5],[2,6],[1,2],[5,1]]) assert.equal(sample(values,x,y),-.7)
  assert.equal(values.filter(v => v !== 0).length,4)
})

test('Symmetry can be disabled without changing ordinary brush behavior', () => {
  const actual = new Float64Array(64), expected = new Float64Array(64)
  const from = {x:1,y:2}, to = {x:5,y:6}
  const changes = paintSymmetricStroke(actual,8,from,to,brush,.5,from,{...symmetry,enabled:false})
  const original = paintBrushStroke(expected,8,from,to,brush,.5)
  assert.deepEqual(actual,expected)
  assert.deepEqual(changes,original)
})

test('A one-pixel brush retains a copy in every slice at non-right-angle rotations', () => {
  const values = new Float64Array(32*32), point={x:24,y:20}
  paintSymmetricStroke(values,32,point,point,brush,1,point,{enabled:true,slices:6,angle:30})
  for(let slice=0;slice<6;slice++) {
    let found=false
    for(let y=0;y<32;y++) for(let x=0;x<32;x++) {
      if(sliceAt({x,y},32,{slices:6,angle:30})===slice && values[displayToIndex(x,y,32)]===1) found=true
    }
    assert.equal(found,true,`Slice ${slice} retains a one-pixel copy`)
  }
})

test('Slice rotation changes boundary membership and copies the clipped source slice', () => {
  assert.equal(sliceAt({x:6,y:4},8,symmetry),0)
  assert.equal(sliceAt({x:6,y:4},8,{...symmetry,angle:45}),3)
  const values = new Float64Array(64)
  const point = {x:4,y:4}
  paintSymmetricStroke(values,8,point,point,{shape:'square',size:3,mode:'paste'},1,point,symmetry)
  // Source quadrant contains only (4,4), (5,4), (4,5), (5,5).
  assert.equal(values.filter(v=>v!==0).length,16)
  for(const [x,y] of [[4,4],[5,5],[2,2],[3,3],[4,3],[2,5]]) assert.equal(sample(values,x,y),1)
  assert.equal(sample(values,6,6),0)
})

test('Add contributes once per pixel across all copies and preserves uncapped values', () => {
  const values = new Float64Array(64).fill(1), visited = new Uint8Array(64)
  const additive = {...brush,mode:'add'}
  for(let i=0;i<3;i++) paintSymmetricStroke(values,8,center,center,additive,1,center,symmetry,{visited})
  assert.equal(values.filter(v=>v===2).length,4)
  assert.equal(values.filter(v=>v===1).length,60)
  paintSymmetricStroke(values,8,center,center,additive,1,center,symmetry)
  assert.equal(values.filter(v=>v===3).length,4)
})

test('Wipe clears once and retains every copy; erase removes every matching copy', () => {
  const values = new Float64Array(64).fill(2)
  const wiping = {...brush,mode:'wipe'}
  paintSymmetricStroke(values,8,center,center,wiping,1,center,symmetry)
  assert.equal(values.filter(v=>v===1).length,4)
  const next={x:5,y:4}
  paintSymmetricStroke(values,8,center,next,wiping,-1,center,symmetry)
  assert.equal(values.filter(v=>v===-1).length,4)
  assert.equal(sample(values,6,5),0)
  paintSymmetricStroke(values,8,next,next,wiping,1,next,symmetry,{erase:true})
  assert.ok(values.every(v=>v===0))
})

test('The 1x1 grid receives one Add contribution, even with many slices and arbitrary rotation', () => {
  const values = Float64Array.of(0), point={x:0,y:0}
  paintSymmetricStroke(values,1,point,point,{...brush,mode:'add'},1,point,{enabled:true,slices:24,angle:35})
  assert.equal(values[0],1)
})

test('Erasing in Wipe follows the current pointer slice, matching its preview', () => {
  const values=new Float64Array(64).fill(1), next={x:1,y:1}
  paintSymmetricStroke(values,8,center,next,{...brush,mode:'wipe'},1,center,symmetry,{erase:true})
  for(const [x,y] of [[1,1],[6,1],[6,6],[1,6]]) assert.equal(sample(values,x,y),0)
})

test('All brushes, modes, arbitrary slice counts, and rotations retain accurate ranges and bounds', () => {
  for(const size of [1,2,3,5,9,16,33]) for(const shape of ['dot','square','line','wave','gaussian','inverted-gaussian']) for(const slices of [2,3,6,8]) {
    const values = new Float64Array(size*size)
    let range=valueRange(values)
    for(let step=0;step<9;step++) {
      const point={x:step%size,y:(step*3)%size}
      const brush={shape,size:3,angle:35,sigma:2,wavelength:4,mode:['wipe','paste','add'][step%3]}
      const changes=paintSymmetricStroke(values,size,point,point,brush,[1,-.5,0][step%3],point,{enabled:true,slices,angle:step*5},{erase:step===7})
      range=updateValueRange(values,range,changes)
      assert.deepEqual(range,valueRange(values),`${size}px ${shape}, ${slices} slices, step ${step}`)
      assert.ok(values.every(Number.isFinite))
      if(changes.bounds) assert.ok(changes.bounds.left>=0 && changes.bounds.right<size && changes.bounds.top>=0 && changes.bounds.bottom<size)
    }
  }
})

test('Guides have one center-to-edge ray per slice and preserve rotation', () => {
  const path=sliceGuidePath(8,symmetry)
  assert.equal((path.match(/M/g)||[]).length,4)
  assert.ok(path.startsWith('M4,4L8,4'))
  assert.notEqual(sliceGuidePath(8,{...symmetry,angle:30}),path)
})
