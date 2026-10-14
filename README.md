# Fourier Grid

Four editable canvas grids show the real and imaginary parts of a drawing and
its Fourier transform. Paint on the left to run the forward transform, or on
the right to run the inverse transform. The responsive Tailwind interface is
a static SPA suitable for GitHub Pages.

Project requirements are in [AGENTS.md](AGENTS.md).

## Run

```sh
npm install
npm run dev
```

Use `npm run build` for a production build, `npm run preview` to serve it, and
`npm test` to run the numerical and drawing tests.

## Controls

- All four canvases start empty. Choose a pattern or draw to fill them.
- Drag on any of the four canvases to paint. Release to update the other domain.
- **Live updates** is on by default for every drawing mode. Turn it off to
  update the other domain only on release, including in Wipe. Releasing always
  includes the complete stroke.
- Select **Erase**, or right-click and drag, to set samples to zero.
- Use a canvas's trash button to clear just that real or imaginary component
  and update the other domain. The companion component stays intact.
- Each canvas shows its minimum and maximum numerical values below the grid.
  They update while drawing and after transforms; Boost faint values does not
  affect them. Hover over a displayed value to see its full precision.
- Enable **Symmetry** to repeat drawing around the center of any canvas.
  Choose 2–24 **Slices** and a **Slice angle** to rotate their boundaries.
  The controls apply to all four canvases; symmetry is off by default.
  Faint guides show the slices without competing with the center axes.
  Each Paste/Add stroke uses its starting slice; Wipe uses the pointer's current
  slice. The brush is clipped to that source slice and copied to the others at
  the same radius and relative angle. Raster copies use nearest-pixel sampling
  and clip at the canvas edges. This applies to all brushes and erasing.
  Wipe clears once before placing every copy; Add contributes once per
  destination pixel per stroke. Existing values stay intact when you change
  the toggle, slice count, or angle. Live updates still control transform timing.
- **Paste** replaces the samples under the brush.
  **Add** sums the brush values with existing samples without a cap.
  Each pixel receives one contribution per stroke, regardless of overlapping
  stamps or mouse event frequency. Start another stroke to add again.
  **Wipe** is the default draw mode. It clears the selected canvas and places just one brush at the pointer.
  Each movement clears the previous placement, so dragging leaves no trail.
  Wipe follows the same Live updates setting as Paste and Add. It
  changes only the selected real or imaginary canvas, preserving its companion.
  Erase always sets samples to zero under the brush in every mode.
- Choose **Circle**, **Line**, or **Wave** with the brush buttons or `1`, `2`, and `3`.
- Choose **Square** with its brush button or `4` to paint a filled square.
  Use its **Rotation** slider or ±5° buttons to set its angle.
- Choose **Gaussian** with its brush button or `5`. It paints
  `value × exp(−(dx² + dy²) / (2σ²))` across the canvas, centered where you press.
  Its peak is the paint value. Set the standard deviation **σ** in pixels with
  the slider, ±0.5 buttons, **Ctrl+scroll**, or `[` and `]`.
  Scroll up to increase σ and down to decrease it. The range is 0.5 to half the
  grid size; each brush remembers its setting, clamped on resizing.
  Preview rings show 1σ and 2σ. Paste and Add retain the initial center during
  a stroke; in Wipe the Gaussian follows the pointer and can be resized while
  dragging. Erasing with Gaussian clears the selected canvas.
- Scroll over a canvas to rotate Square, Line, or Wave, or use the **Rotation**
  or **Direction** slider. Scrolling down rotates clockwise and scrolling up rotates back.
  Each brush remembers its angle. In Wipe you can rotate while dragging;
  hovering alone changes the preview without painting.
- Every slider has plus/minus buttons: size changes by 2 pixels, rotation or
  direction by 5°, wave frequency by 0.5 cycles, Gaussian σ by 0.5 pixels,
  and paint value by 0.1.
  Buttons disable at the slider limits; angles wrap around.
- Adjust the circle diameter, square side length, or line width with the slider, plus/minus buttons,
  or `[` and `]`. Each brush remembers its size.
- Hold **Ctrl** and scroll over any canvas to adjust circle diameter, square
  side length, line width, wave frequency, or Gaussian σ. Scroll up to increase and down
  to decrease, in steps of 2 pixels or 0.5 cycles. Values stay within the slider
  limits. In Wipe, these adjustments also update the brush while dragging.
- **Line** extends across the entire canvas through the pointer. Set its width
  and **Direction**; dragging sweeps the line without gaps.
- **Wave** fills the entire canvas with positive and negative cosine bands.
  Set **Direction** and **Frequency**, measured in cycles per grid side along
  that direction. Frequency ranges from 0.5 to half the grid size.
  In Paste and Add, bands stay aligned to the starting point throughout each
  drag. In Wipe they follow the pointer. Changing
  resolution retains the frequency, clamped to the new grid's maximum.
- Hover over a canvas to preview the brush outline. Wave previews mark positive
  peaks and negative troughs in their respective colors. Erase previews show
  the whole area to be cleared; erasing with Wave clears the selected canvas.
  Hovering never changes the grids.
- Press `B` for paint and `E` for erase. Focus a canvas and use arrow keys to
  position the brush, then Enter or Space to stamp the selected brush.
- The brush value ranges from −1 to +1; Add can accumulate values beyond that.
  Mint represents positive values, coral
  represents negative values, and dark represents zero.
- Try a single point, double slit, ring, or cosine wave from the pattern menu.
- Resolutions are 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, and 1024 pixels per side. Changing resolution resets the
  grids and reloads the selected pattern, if any.

Both domains display their origin at the center, with labels on both axes.
X increases to the right and Y increases downward, matching the canvas readout.
The 1 × 1 grid contains only the origin; its complex transform is the same sample.
Brightness is normalized per
domain, with a shared scale for its real and imaginary components. Boost faint values
changes the display only; it never changes the underlying numerical values.

Drawing updates only the changed component and pixel region, coalescing edits
before each animation frame. Brightness changes still redraw the whole domain
to retain its shared scale. Unchanged stamps and repeated full-canvas wave
positions do no painting work, and maximum values are rescanned only when needed.

Canvases use WebGL 2 when available. A fragment shader colors normalized scalar
textures on the GPU, including the faint-value boost. Changed rectangles alone
are uploaded; canvas resizing, shared brightness changes, and context recovery
refresh the complete texture. Context restoration redraws the latest grid.
If WebGL 2 is unavailable or shader initialization fails, the app uses Canvas 2D.
Browsers select the graphics device and can use a software WebGL implementation.

The GPU display texture uses float32; the brush grids, range readouts, and WASM
FFT keep their original float64 data. GPU color rounding can differ from the CPU
by one RGB level near a boundary. Shader tests cover that tolerance, signed
colors, contrast, partial updates, tiny/large grids, and context recovery.

The Canvas 2D fallback writes packed RGBA pixels and caches exact color intervals. Values near
a color boundary use the original formula, preserving every output byte, including
Boost faint values. Moving waves use the cosine addition identity to reduce
trigonometric evaluations from O(N²) to O(N); painting still visits all N² samples.
Wave results match the direct formula within 2e-12 in tests through 1024 pixels.
Gaussians also use separable row/column factors, reducing exponential evaluations
to O(N) while retaining the full sampled field, without an artificial cutoff.

Per-canvas ranges retain counts of their minimum and maximum samples. Ordinary
edits update these counts, rescanning only if the last occurrence of an extreme
is removed. Wipe brushes and waves compute their final ranges during painting.

Worker transforms reuse retired grid buffers for input snapshots and transform
those transferred buffers in place, avoiding another copy and repeated allocations.
The worker also computes the transformed ranges and brightness peak before returning the result, keeping
that full-grid scan off the main thread. The drawing buffers remain available while
the worker runs, and the main-thread fallback retains its nonmutating API.

Use `npm run bench` to measure rendering, brush painting, previews, peak scans,
and fresh versus reused input copies at 512 and 1024 pixels. It prints median and
95th-percentile milliseconds after warmup and writes `.tmp/pipeline-latest.json`.
These are local Node microbenchmarks of the CPU path, excluding the FFT, GPU
shader execution, and browser compositing.
On the development machine, a dense 1024-pixel repaint dropped from about 55 ms
to 11 ms and a moving Wipe wave from about 25 ms to 7 ms. Browser profiling also
showed the 512-pixel line repaint dropping from about 3.4 ms to 0.7 ms.

The FFT uses [wat-fft](https://github.com/EmNudge/wat-fft) 0.5.0, an ISC-licensed
WebAssembly library with double-precision complex transforms. Its WASM kernels
select radix-4 or radix-2 for each grid size. JavaScript only arranges the row
and column passes and converts the buffers; the handwritten FFT is removed.

The WASM asset is bundled locally by Vite and loaded asynchronously in the
Web Worker. Contexts and buffers are reused, and messages use transferable
buffers. Live updates keep only the latest pending stroke, avoiding a backlog.
If a browser blocks workers, the same WASM library runs on the main thread.

Both directions retain unitary normalization (1/N for an N × N grid). The
library documents approximately 1e-9 numerical accuracy for typical signals;
tests cover direct DFT comparisons, energy conservation, complex round trips,
and concurrent context reuse. Complexity remains O(N² log N) time and O(N²)
storage. No native compiler or external CDN is needed to run or build the app.

## GitHub Pages

The interface uses Tailwind CSS with Vite. The production build is a static SPA;
relative asset URLs allow it to run at a repository subpath or a domain root.
The worker and WASM file are included in `dist` alongside the app.

In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
Push to `main`, or run the **Deploy to GitHub Pages** workflow manually. The
workflow runs the tests, builds the app, and deploys `dist`. It needs no backend
or secrets. For other static hosts, upload the contents of `dist`.
