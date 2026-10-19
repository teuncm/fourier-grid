export const drawingModes = ['wipe', 'paste', 'add', 'multiply']
export const drawingModeLabels = { wipe: 'Wipe', paste: 'Draw', add: 'Add', multiply: 'Mask' }
export const isGaussianBrush = shape => shape === 'gaussian' || shape === 'inverted-gaussian'
export const isBasicBrush = shape => ['dot', 'square', 'fill'].includes(shape)
export const isFieldBrush = shape => isGaussianBrush(shape) || ['fill', 'wave', 'radial-sine', 'radial-sinc'].includes(shape)
export const isCanvasBrush = shape => ['rotation', 'pan', 'stretch'].includes(shape)
export const usesStrokeMask = mode => mode === 'add' || mode === 'multiply'
