import { createFFT } from '@emnudge/wat-fft/browser'
import wasmUrl from '@emnudge/wat-fft/wasm/fft.wasm?url'
import { createFFT2D } from './fft.js'

export const fft2D = createFFT2D(size => createFFT(size, wasmUrl))
