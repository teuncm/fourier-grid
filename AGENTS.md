# Instructions for agents

This project is a live editable 2d Fourier grid. In fact, it is four html5 Canvas grids in a 2x2 layout, because the Fourier transform is a complex to complex transformation. The website is written responsively using Tailwind, written as SPA for hosting on GitHub Pages.

Draw on one side of the grid and see the effect on the other. There are several drawing operations: draw a circle of pixels, remove a circle of pixels, increase/decrease size of circle. Analogously you should be able to draw a square.

Analogously you can draw a line that extends over the entire canvas or draw a 2D wave (alternating positive and negative) in a certain direction, also over the full canvas. The frequency of the wave should be editable too. There should be a hover effect to show the outline of what is about to be drawn. For the wave it is sufficient to show the wave peaks and troughs outlined.

There should be different formula for drawing. "paste" for pasting the values of the brush, "add" for adding them.

The left grids is the "normal" side, real and complex, and the right side of the grid is the transformed side, real and complex.

Drawing on the left side does the forward transform and drawing on the right side does the inverse transform (after releasing the mouse)

The Fourier transform must use an efficient, well maintained libary, such as one written in WASM.
