import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGrid, displayToIndex, valueRange, updateValueRange } from '../src/lib/grid.js'
import { createPhaseSelection, rotatePhaseSelection } from '../src/lib/phase.js'

test('Positive and negative quarter turns exchange real and imaginary values with the correct signs', () => {
  const grid=createGrid(7), center={x:3,y:3}, index=displayToIndex(3,3,7)
  grid.real[index]=3; grid.imaginary[index]=4
  const selection=createPhaseSelection(grid,7,center,{shape:'dot',size:1})
  for(const [angle,r,im] of [[Math.PI/2,-4,3],[-Math.PI/2,4,-3],[Math.PI,-3,-4],[0,3,4]]) {
    rotatePhaseSelection(grid,selection,angle)
    assert.ok(Math.abs(grid.real[index]-r)<1e-14)
    assert.ok(Math.abs(grid.imaginary[index]-im)<1e-14)
    assert.ok(Math.abs(Math.hypot(grid.real[index],grid.imaginary[index])-5)<1e-14)
  }
})

test('Circle and rotated Square phase selections clip at the edges and preserve all outside samples', () => {
  for(const size of [1,2,3,7,16,31]) for(const shape of ['dot','square']) {
    const grid=createGrid(size)
    grid.real.fill(2); grid.imaginary.fill(-3)
    const selection=createPhaseSelection(grid,size,{x:0,y:size-1},{shape,size:5,angle:35})
    assert.equal(new Set(selection.indices).size,selection.indices.length)
    const selected=new Set(selection.indices)
    rotatePhaseSelection(grid,selection,.7)
    for(let i=0;i<grid.real.length;i++) {
      if(!selected.has(i)) { assert.equal(grid.real[i],2); assert.equal(grid.imaginary[i],-3) }
      else assert.ok(Math.abs(grid.real[i]**2+grid.imaginary[i]**2-13)<1e-13)
    }
  }
})

test('Phase gestures use initial snapshots, so event count and reversals do not accumulate drift', () => {
  const size=31, grid=createGrid(size)
  grid.real.set(Float64Array.from(grid.real,(_,i)=>Math.sin(i)*3))
  grid.imaginary.set(Float64Array.from(grid.real,(_,i)=>Math.cos(i)*2))
  const before={real:grid.real.slice(),imaginary:grid.imaginary.slice()}
  const selection=createPhaseSelection(grid,size,{x:15,y:15},{shape:'square',size:9,angle:45})
  rotatePhaseSelection(grid,selection,1.2)
  const expected={real:grid.real.slice(),imaginary:grid.imaginary.slice()}
  for(let i=0;i<100;i++) rotatePhaseSelection(grid,selection,i*.03)
  rotatePhaseSelection(grid,selection,1.2)
  assert.deepEqual(grid,expected)
  rotatePhaseSelection(grid,selection,2*Math.PI)
  assert.deepEqual(grid,before)
})

test('Both component ranges and dirty bounds stay correct during arbitrary phase changes', () => {
  const size=15, grid=createGrid(size)
  grid.real.set(Float64Array.from(grid.real,(_,i)=>Math.sin(i)*3))
  grid.imaginary.set(Float64Array.from(grid.real,(_,i)=>Math.cos(i)*2))
  const selection=createPhaseSelection(grid,size,{x:4,y:6},{shape:'dot',size:9})
  const ranges={real:valueRange(grid.real),imaginary:valueRange(grid.imaginary)}
  for(const angle of [.1,1,-2.4,Math.PI/2,0]) {
    const before={real:grid.real.slice(),imaginary:grid.imaginary.slice()}
    const changes=rotatePhaseSelection(grid,selection,angle)
    for(const component of ['real','imaginary']) {
      ranges[component]=updateValueRange(grid[component],ranges[component],changes[component])
      assert.deepEqual(ranges[component],valueRange(grid[component]))
      for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
        const index=displayToIndex(x,y,size), bounds=changes[component].bounds
        if(grid[component][index]!==before[component][index]) assert.ok(bounds && x>=bounds.left && x<=bounds.right && y>=bounds.top && y<=bounds.bottom)
      }
    }
  }
})

test('Phase rotation does not paint empty samples or change values on a click without a drag', () => {
  const grid=createGrid(8), selection=createPhaseSelection(grid,8,{x:4,y:4},{shape:'dot',size:3})
  const result=rotatePhaseSelection(grid,selection,1)
  assert.equal(result.real.bounds,null)
  assert.equal(result.imaginary.bounds,null)
  assert.ok(grid.real.every(v=>v===0)&&grid.imaginary.every(v=>v===0))
  assert.throws(()=>createPhaseSelection(grid,8,{x:4,y:4},{shape:'wave',size:3}),RangeError)
  assert.throws(()=>rotatePhaseSelection(grid,selection,NaN),RangeError)
})
