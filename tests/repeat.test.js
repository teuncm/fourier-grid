import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayToIndex, valueRange, updateValueRange } from '../src/lib/grid.js'
import { paintBrushStroke } from '../src/lib/brushes.js'
import { paintRepeatedStroke, repeatCell, repeatLayout, repeatGuidePath } from '../src/lib/repeat.js'

const dot = { shape: 'dot', size: 1, mode: 'paste' }
const sample = (values, size, x, y) => values[displayToIndex(x, y, size)]

test('Horizontal, vertical, and combined repeats preserve the relative pixel in every segment', () => {
  for (const repeat of [{columns:4,rows:1},{columns:1,rows:2},{columns:4,rows:2}]) {
    const values = new Float64Array(64), point = {x:5,y:3}
    paintRepeatedStroke(values,8,point,point,dot,-.7,point,repeat)
    const xs = repeat.columns === 1 ? [5] : [1,3,5,7], ys = repeat.rows === 1 ? [3] : [3,7]
    for (const y of ys) for (const x of xs) assert.equal(sample(values,8,x,y),-.7)
    assert.equal(values.filter(v=>v!==0).length,xs.length*ys.length)
  }
})

test('Repeat clips the brush to its starting segment without spilling across segment edges', () => {
  const values = new Float64Array(64), point={x:3,y:1}
  paintRepeatedStroke(values,8,point,point,{...dot,size:3,shape:'square'},1,point,{columns:2,rows:2})
  for (let y=0;y<8;y++) for (let x=0;x<8;x++) assert.equal(sample(values,8,x,y), [2,3,6,7].includes(x)&&[0,1,2,4,5,6].includes(y)?1:0)
})

test('Non-divisible odd grids keep one-pixel copies in every destination, including narrower segments', () => {
  const size=7, repeat={columns:3,rows:3}, values=new Float64Array(size*size), point={x:5,y:5}
  paintRepeatedStroke(values,size,point,point,dot,1,point,repeat)
  for(const y of [1,3,5]) for(const x of [1,3,5]) assert.equal(sample(values,size,x,y),1)
  assert.equal(values.filter(v=>v!==0).length,9)
  const layout=repeatLayout(size,repeat)
  assert.deepEqual(layout.xs,[0,2,4,7])
  assert.equal(repeatCell({x:4,y:2},size,repeat).column,2)
})

test('Add contributes once per destination per stroke, including resampling collisions', () => {
  const values=new Float64Array(49).fill(3), point={x:5,y:5}, visited=new Uint8Array(49)
  const brush={...dot,mode:'add'}, repeat={columns:3,rows:3}
  paintRepeatedStroke(values,7,point,point,brush,-5,point,repeat,{visited})
  const after=values.slice()
  paintRepeatedStroke(values,7,point,point,brush,-5,point,repeat,{visited})
  assert.deepEqual(values,after)
  assert.equal(values.filter(v=>v===-2).length,9)
  assert.ok(values.every(v=>v===-2||v===3))
})

test('Wipe clears once then keeps all copies, follows the current segment, and repeated erase removes them', () => {
  const values=new Float64Array(64).fill(2), start={x:1,y:1}, next={x:6,y:5}
  const brush={...dot,mode:'wipe'}, repeat={columns:2,rows:2}
  paintRepeatedStroke(values,8,start,start,brush,1,start,repeat)
  paintRepeatedStroke(values,8,start,next,brush,-1,start,repeat)
  for(const y of [1,5]) for(const x of [2,6]) assert.equal(sample(values,8,x,y),-1)
  assert.equal(values.filter(v=>v!==0).length,4)
  paintRepeatedStroke(values,8,next,next,brush,1,start,repeat,{erase:true})
  assert.ok(values.every(v=>v===0))
})

test('Wave and Gaussian repeat just the source tile, preserving their formulas', () => {
  const size=8, point={x:5,y:5}, repeat={columns:2,rows:2}
  for(const shape of ['wave','gaussian','inverted-gaussian']) {
    const values=new Float64Array(64), brush={shape,mode:'paste',angle:0,wavelength:4,sigma:1}
    paintRepeatedStroke(values,size,point,point,brush,-.5,point,repeat)
    for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
      const dx=x%4-1, dy=y%4-1
      const expected=-.5*(shape==='wave'?Math.cos(2*Math.PI*dx/4):shape==='inverted-gaussian'?1-Math.exp(-(dx*dx+dy*dy)/2):Math.exp(-(dx*dx+dy*dy)/2))
      assert.ok(Math.abs(sample(values,size,x,y)-expected)<1e-14)
    }
  }
})

test('All repeated brushes and modes retain accurate ranges and changed bounds on tiny, odd, and even grids', () => {
  for(const size of [1,2,3,7,16,31]) for(const shape of ['dot','square','line','wave','gaussian','inverted-gaussian']) {
    const values=new Float64Array(size*size)
    let range=valueRange(values)
    for(let step=0;step<9;step++) {
      const point={x:step%size,y:(step*3)%size}, before=values.slice()
      const brush={shape,size:3,angle:35,sigma:2,wavelength:4,mode:['wipe','paste','add'][step%3]}
      const changes=paintRepeatedStroke(values,size,point,point,brush,[1,-.5,0][step%3],point,{columns:3,rows:2},{erase:step===7})
      range=updateValueRange(values,range,changes)
      assert.deepEqual(range,valueRange(values))
      for(let y=0;y<size;y++) for(let x=0;x<size;x++) if(sample(values,size,x,y)!==sample(before,size,x,y)) {
        assert.ok(changes.bounds && x>=changes.bounds.left && x<=changes.bounds.right && y>=changes.bounds.top && y<=changes.bounds.bottom)
      }
    }
  }
})

test('Disabled repeat delegates normal drawing and guides follow actual pixel boundaries', () => {
  const actual=new Float64Array(64), expected=new Float64Array(64), point={x:3,y:4}
  paintRepeatedStroke(actual,8,point,point,dot,1,point,{columns:1,rows:1})
  paintBrushStroke(expected,8,point,point,dot,1,point)
  assert.deepEqual(actual,expected)
  assert.equal(repeatGuidePath(7,{columns:3,rows:2}),'M2,0V7M4,0V7M0,3H7')
  assert.equal(repeatGuidePath(1,{columns:16,rows:16}),'')
})
