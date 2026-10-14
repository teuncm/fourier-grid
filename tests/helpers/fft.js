import { createFFT } from '@emnudge/wat-fft'
import { createFFT2D } from '../../src/lib/fft.js'

export const fft2D = createFFT2D(createFFT)
