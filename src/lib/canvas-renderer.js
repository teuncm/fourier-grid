import { renderGridPixels } from './render.js'

const vertexSource = `#version 300 es
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}`

const fragmentSource = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D u_values;
uniform int u_size;
uniform bool u_logarithmic;
out vec4 color;
void main() {
  ivec2 pixel = ivec2(int(gl_FragCoord.x), u_size - 1 - int(gl_FragCoord.y));
  float value = texelFetch(u_values, pixel, 0).r;
  float relative = min(1.0, abs(value));
  // Avoid cancellation in log(1+x) for very faint values.
  float x = 80.0 * relative;
  float boosted = x < 0.001 ? x * (1.0 - x * 0.5) : log(1.0 + x);
  float level = u_logarithmic ? boosted / log(81.0) : relative;
  vec3 endpoint = value >= 0.0 ? vec3(170.0, 255.0, 222.0) : vec3(255.0, 230.0, 109.0);
  vec3 rgb = floor(vec3(13.0, 22.0, 28.0) + (endpoint - vec3(13.0, 22.0, 28.0)) * level + 0.5);
  color = vec4(rgb / 255.0, 1.0);
}`

function compile(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(message || 'Could not compile the canvas shader.')
  }
  return shader
}

export function stageTextureValues(values, size, peak, bounds, upload) {
  const left = bounds?.left ?? 0, top = bounds?.top ?? 0
  const width = bounds ? bounds.right - left + 1 : size
  const height = bounds ? bounds.bottom - top + 1 : size
  const scale = peak > 1e-12 ? peak : 1
  const half = Math.ceil(size / 2)
  let offset = 0
  for (let y = top; y < top + height; y++) {
    const row = ((y + half) % size) * size
    for (let x = left; x < left + width; x++) upload[offset++] = values[row + ((x + half) % size)] / scale
  }
  return { left, top, width, height, data: upload.subarray(0, offset) }
}

function createGPU(canvas, gl, { onRestore, onFailure }) {
  let program = null, texture = null, sizeLocation = null, logarithmicLocation = null
  let size = 0, upload = null, needsFullUpload = true

  function release() {
    if (texture) gl.deleteTexture(texture)
    if (program) gl.deleteProgram(program)
    texture = program = null
  }

  function initialize() {
    release()
    let vertex = null, fragment = null
    try {
      vertex = compile(gl, gl.VERTEX_SHADER, vertexSource)
      fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource)
      program = gl.createProgram()
      gl.attachShader(program, vertex)
      gl.attachShader(program, fragment)
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Could not link the canvas shader.')
      gl.useProgram(program)
      sizeLocation = gl.getUniformLocation(program, 'u_size')
      logarithmicLocation = gl.getUniformLocation(program, 'u_logarithmic')
      gl.uniform1i(gl.getUniformLocation(program, 'u_values'), 0)
      texture = gl.createTexture()
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.disable(gl.DITHER)
      gl.disable(gl.BLEND)
      size = 0
      needsFullUpload = true
    } catch (error) {
      release()
      throw error
    } finally {
      if (vertex) gl.deleteShader(vertex)
      if (fragment) gl.deleteShader(fragment)
    }
  }

  initialize()
  const lost = event => {
    event.preventDefault()
    program = texture = null
    size = 0
    needsFullUpload = true
  }
  const restored = () => {
    try { initialize(); onRestore?.() } catch { onFailure?.() }
  }
  canvas.addEventListener('webglcontextlost', lost)
  canvas.addEventListener('webglcontextrestored', restored)

  return {
    backend: 'webgl2',
    render(values, nextSize, peak, logarithmic, bounds = null) {
      if (gl.isContextLost()) return
      if (size !== nextSize) {
        size = nextSize
        canvas.width = canvas.height = size
        upload = new Float32Array(size * size)
        gl.viewport(0, 0, size, size)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, size, size, 0, gl.RED, gl.FLOAT, null)
        needsFullUpload = true
      }
      if (needsFullUpload) bounds = null
      // Only normalize and upload the changed rectangle. Coloring runs in GLSL.
      const { left, top, width, height, data } = stageTextureValues(values, size, peak, bounds, upload)
      gl.useProgram(program)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, left, top, width, height, gl.RED, gl.FLOAT, data)
      gl.uniform1i(sizeLocation, size)
      gl.uniform1i(logarithmicLocation, logarithmic ? 1 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      needsFullUpload = false
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', lost)
      canvas.removeEventListener('webglcontextrestored', restored)
      release()
    },
  }
}

export function createCanvasRenderer(canvas, options = {}) {
  if (options.gpu !== false) {
    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      // Retain static frames between edits and allow reliable canvas readback.
      preserveDrawingBuffer: true,
    })
    if (gl) return createGPU(canvas, gl, options)
  }
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No canvas renderer is available.')
  let image = null
  return {
    backend: '2d',
    render(values, size, peak, logarithmic, bounds = null) {
      if (!image || image.width !== size) {
        canvas.width = canvas.height = size
        image = context.createImageData(size, size)
        bounds = null
      }
      renderGridPixels(values, size, peak, logarithmic, image.data, bounds)
      if (bounds) context.putImageData(image, 0, 0, bounds.left, bounds.top, bounds.right - bounds.left + 1, bounds.bottom - bounds.top + 1)
      else context.putImageData(image, 0, 0)
    },
    dispose() {},
  }
}
