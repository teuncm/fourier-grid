import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayToIndex, valueRange } from '../src/lib/grid.js'
import { createCanvasRotation, rotateCanvasValues } from '../src/lib/rotation.js'

test('Quarter turns rotate signed values around the FFT origin with the expected direction', () => {
  for(const size of [7,8,31,32]) {
    const values=new Float64Array(size*size), origin=Math.floor(size/2)
    values[0]=3
    values[displayToIndex(origin+2,origin+1,size)]=-2
    const snapshot=createCanvasRotation(values,size)
    for(const [angle,x,y] of [[Math.PI/2,origin+1,origin-2],[-Math.PI/2,origin-1,origin+2],[Math.PI,origin-2,origin-1]]) {
      const result=rotateCanvasValues(values,snapshot,angle)
      assert.equal(values[0],3)
      assert.equal(values[displayToIndex(x,y,size)],-2)
      assert.equal(values.filter(v=>v!==0).length,2)
      assert.deepEqual(result.range,valueRange(values))
    }
  }
})

test('Arbitrary angles match independent bilinear sampling with zero beyond the canvas', () => {
  for(const size of [1,2,3,7,16,31]) for(const angle of [.2,-.7,Math.PI/4,2.1]) {
    const values=Float64Array.from({length:size*size},(_,i)=>Math.sin(i+.7)*3), before=values.slice()
    const origin=Math.floor(size/2), cosine=Math.cos(angle), sine=Math.sin(angle)
    const at=(x,y)=>x<0||y<0||x>=size||y>=size?0:before[displayToIndex(x,y,size)]
    const result=rotateCanvasValues(values,createCanvasRotation(values,size),angle)
    for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
      const sx=origin+(x-origin)*cosine-(y-origin)*sine, sy=origin+(x-origin)*sine+(y-origin)*cosine
      const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy
      const expected=at(ix,iy)*(1-fx)*(1-fy)+at(ix+1,iy)*fx*(1-fy)+at(ix,iy+1)*(1-fx)*fy+at(ix+1,iy+1)*fx*fy
      assert.ok(Math.abs(values[displayToIndex(x,y,size)]-expected)<1e-12)
    }
    assert.deepEqual(result.range,valueRange(values))
  }
})

test('Even grids rotate about the zero sample rather than halfway between pixels, clipping instead of wrapping', () => {
  const values=new Float64Array(64)
  values[displayToIndex(0,4,8)]=1
  const snapshot=createCanvasRotation(values,8)
  rotateCanvasValues(values,snapshot,Math.PI/2)
  assert.ok(values.every(v=>v===0),'The left edge moves below the last row when rotated about (4,4)')
  rotateCanvasValues(values,snapshot,0)
  assert.equal(values[displayToIndex(0,4,8)],1)
})

test('Rotation snapshots restore original values and do not accumulate interpolation blur during a drag', () => {
  const size=31, values=Float64Array.from({length:size*size},(_,i)=>Math.sin(i)*3), before=values.slice()
  const snapshot=createCanvasRotation(values,size)
  rotateCanvasValues(values,snapshot,.35)
  const expected=values.slice()
  for(let i=0;i<30;i++) rotateCanvasValues(values,snapshot,i*.1)
  rotateCanvasValues(values,snapshot,.35)
  assert.deepEqual(values,expected)
  rotateCanvasValues(values,snapshot,2*Math.PI)
  assert.deepEqual(values,before)
  assert.equal(rotateCanvasValues(values,snapshot,0).bounds,null)
})

test('Empty and tiny canvases remain stable; a large odd grid keeps exact quarter-turn positions', () => {
  for(const size of [1,2,3,1023]) {
    const values=new Float64Array(size*size), snapshot=createCanvasRotation(values,size)
    assert.equal(rotateCanvasValues(values,snapshot,.3).bounds,null)
    assert.deepEqual(valueRange(values),{min:0,max:0,minCount:size*size,maxCount:size*size})
    values[0]=-2
    const result=rotateCanvasValues(values,createCanvasRotation(values,size),Math.PI/2)
    assert.equal(values[0],-2)
    assert.equal(values.filter(v=>v!==0).length,1)
    assert.deepEqual(result.range,valueRange(values))
  }
  assert.throws(()=>rotateCanvasValues(new Float64Array(1),createCanvasRotation(new Float64Array(1),1),Infinity),RangeError)
})
