# Fourier Grid

Four editable canvas grids show the real and imaginary parts of a drawing and
its Fourier transform. Paint on the left to run the forward transform, or on
the right to run the inverse transform. The responsive Tailwind interface is
a static SPA suitable for GitHub Pages.

[Open Fourier Grid](https://teuncm.nl/fourier-grid/) · [teuncm.nl](https://teuncm.nl/)

Project requirements are in [AGENTS.md](AGENTS.md).

## Run

```sh
npm install
npm run dev
```

Use `npm run build` for a production build, `npm run preview` to serve it, and
`npm test` to run the numerical and drawing tests.

## Controls

- The **2×2 layout stays fixed**, with Spatial and Frequency beside each other.
  On laptop/desktop screens the workspace fills the viewport, and square canvases
  use the available row height and column width without the old size caps. Wide
  plot cards put numerical readouts in the side margins to give the canvas more
  height; narrow cards keep them underneath. The toolbox keeps its controls and
  styling, with independent scrolling. Small screens retain normal page scrolling.
- Use **Fullscreen** in the footer, or press **F**, to fill the display. Press F,
  Escape, or the exit button to return. The same four-canvas layout and toolbox
  remain available; entering/exiting preserves data, history, and tool settings.

- **Grid size** is at the top of the controls. Use **Tools** to expand or
  collapse the drawing and manipulation controls; they start expanded. Grid
  size, Live updates, Boost faint values, Show grid lines, Snap to grid, and
  Clear all grids stay accessible while collapsed. Brush/settings choices
  are preserved.
- Clicking the selected brush or manipulation again deselects it and hides its
  properties and canvas preview. With no tool selected, canvas gestures and wheel
  adjustments do not edit values. Selecting another tool restores its settings;
  number shortcuts select a tool without toggling it off.
- All four canvases start empty. Draw on any canvas to experiment.
- Drag on any of the four canvases to paint. Release to update the other domain.
- **Live updates** is on by default for every drawing mode. Turn it off to
  update the other domain only on release, including in Wipe. Releasing always
  includes the complete stroke.
- **Snap to grid**, below **Show grid lines**, is on by default. When enabled,
  brushes snap to the center X/Y axes within 8 CSS pixels, independently per
  axis; near both, they snap to the origin. Preview, painting, and erase use the same point. It works with hidden grid lines. The same toggle
  also locks Pan, Rotate, and Stretch near their starting reference lines.
- When brush snapping engages, a bright ring marks its position on the X/Y axis,
  with a short illuminated tick along each engaged axis. Near the origin both
  ticks appear. Markers remain visible with grid lines hidden and disappear when
  snapping is disabled, the pointer leaves, or a whole-canvas manipulation is selected.
- Select **Erase**, or right-click and drag, to set samples to zero.
- Use each canvas's **Mirror horizontally** or **Mirror vertically** button
  in its top bar to flip left/right or top/bottom in displayed coordinates.
  Flips preserve exact values and their range, leave the companion component
  intact, and update the transform immediately, even with Live updates off.
- Use a canvas's trash button to clear just that real or imaginary component
  and update the other domain. The companion component stays intact.
- **Copy** and **Paste** sit beside each canvas's trash button. Copy snapshots
  that canvas's numerical values; Paste adds to one destination component without a cap and
  updates the other domain, preserving the destination's companion component.
  Any of the four canvases can copy to any other, retaining signed, uncapped
  float64 values. The copy stays available after edits, transforms, and clearing.
  After resizing, Paste is disabled until the grid matches the copied size or
  you copy a canvas at the new size. These controls are disabled during drawing
  and transforms. Paste always updates the transform immediately.
  **Invert** (±) multiplies the current canvas values by −1 and updates the
  transform immediately. It works without a copied canvas and preserves the copy.
- Each canvas shows its minimum and maximum numerical values below the grid.
  They update while drawing and after transforms; Boost faint values does not
  affect them. Hover over a displayed value to see its full precision.
- Enable **Symmetry** to repeat drawing around the center of any canvas.
  Choose 2–24 **Slices** and a **Slice angle** to rotate their boundaries.
  The controls apply to all four canvases; symmetry is off by default.
  Faint guides show the slices without competing with the center axes.
  Each Draw/Add/Mask stroke uses its starting slice; Wipe uses the pointer's current
  slice. The brush is clipped to that source slice and copied to the others at
  the same radius and relative angle. Raster copies use nearest-pixel sampling
  and clip at the canvas edges. This applies to all brushes and erasing.
  Wipe clears once before placing every copy; Add contributes once per
  destination pixel per stroke. Existing values stay intact when you change
  the toggle, slice count, or angle. Live updates still control transform timing.
- Under **Manipulate**, choose **Stretch** (or press `8`). The anchor always
  stays at the FFT origin, including on odd and even grids. Press anywhere and
  drag right to stretch X or up to stretch Y; drag left/down to shrink the
  corresponding axis. X and Y change independently with fixed horizontal and
  vertical directions. Half a canvas of travel doubles or halves an axis,
  within 0.125×–8×. A fixed origin marker, deformed grid, ellipse, and labelled
  X/Y arrows show the mapping. Mint arrows expand and gold arrows compress.
  The sidebar shows both scale factors. Only the selected real or imaginary
  canvas changes. Each gesture samples its starting snapshot using bilinear
  interpolation; pixels beyond the edges are zero. Returning to the starting
  pointer position restores the exact original. Live updates controls transform
  timing. Paint/Erase, drawing modes, wheel adjustments, symmetry, and repeat
  do not alter this whole-canvas operation.
- Under **Manipulate**, choose **Pan** (or press `7`) to move the selected real or imaginary canvas
  with the pointer. Motion snaps to whole grid pixels and wraps across both
  edges, preserving every value exactly. Each drag uses its starting snapshot;
  returning to the start restores it, and dragging beyond the canvas keeps
  wrapping. The companion component stays intact. Live updates controls
  transform timing; with it off, the transform waits for release. Paint value,
  Erase, size, and drawing modes do not apply. With the canvas focused, arrow
  keys pan by one pixel. Like Rotate, Pan moves the whole canvas regardless
  of symmetry or repeat settings.
- Under **Manipulate**, choose **Rotate** (or press `6`) to rotate the selected canvas about its
  origin. Drag up for counterclockwise rotation or down for clockwise; one
  canvas-height of travel is 360°. It affects the real or imaginary canvas you
  press. The companion component stays intact. Each gesture rotates its initial
  snapshot, so returning to the starting height restores it without cumulative
  blur. Quarter turns retain exact pixels; other angles use bilinear sampling,
  with zero beyond the canvas edges. Live updates controls transform timing.
  Paint value, Erase, brush size, and drawing modes do not apply. With the canvas
  focused, Up/Down rotates by 5°.
- Enable **Horizontal repeat** to copy across columns or **Vertical repeat**
  to copy down rows. Combine them for a grid of repeated cells. Each direction
  has a count from 2 to 16 (limited by the grid size), with plus/minus controls.
  Both are off initially. Enabling either turns off rotational symmetry;
  enabling rotational symmetry turns off both repeat directions.
  Faint guides and clipped brush previews show the copies on every canvas.
  Draw/Add/Mask use the cell where the stroke starts; Wipe uses the current cell.
  Brushes are clipped to that cell and copied at the same relative position.
  Non-divisible grids use cells differing by one pixel, with nearest-pixel
  resampling between them. Wipe clears once before all copies; Add contributes
  once per destination pixel per stroke. Erasing repeats too. Changing repeat
  settings leaves existing values intact, and Live updates controls transform
  timing as usual. Repeats are unavailable on the 1 × 1 grid.
- **Draw** replaces the samples under the brush.
  **Add** sums the brush values with existing samples without a cap.
  Each pixel receives one contribution per stroke, regardless of overlapping
  stamps or mouse event frequency. Start another stroke to add again.
  **Wipe** is the default draw mode. It clears the selected canvas and places just one brush at the pointer.
  Each movement clears the previous placement, so dragging leaves no trail.
  Wipe follows the same Live updates setting as Draw, Add, and Mask. It
  changes only the selected real or imaginary canvas, preserving its companion.
  Erase always sets samples to zero under the brush in every mode.
- **Brushes** contains Circle, Square, and Fill, followed by a gap separating
  Line/Wave, Gaussian/Inverted Gaussian, and Radial sine/Radial sinc.
- Choose **Circle**, **Line**, or **Wave** with the brush buttons or `1`, `2`, and `3`.
- Choose **Square** with its brush button or `4` to paint a filled square.
  Use its **Rotation** slider or ±5° buttons to set its angle.
- **Fill** covers the entire selected canvas with the paint value. Wipe/Draw
  replace all values, Add adds once per pixel per stroke, and Mask scales all
  existing values. Erase clears the entire component. Link editing applies it
  to both components. Fill has no size/direction and ignores symmetry/repeat;
  Live updates and Undo/Redo work as usual. Hover outlines the full canvas.
- **Noise**, below the basic brushes, fills the Circle, Square, or entire Fill footprint with uniform signed
  white noise scaled by the paint value (−|value| to +|value|). Each stroke gets
  a fresh pattern, stable at each canvas pixel throughout dragging. Brush size,
  Square rotation, all drawing modes, linked editing, symmetry/repeat, Live updates,
  and Undo/Redo still apply. Erase clears the normal footprint. Noise defaults off,
  and is inactive for advanced brushes.
- Choose **Radial sine** for concentric sine bands or **Radial sinc** for
  a central peak with fading rings. Both cover the whole canvas, centered on
  the pointer. With radius `r`, wavelength `λ`, and phase `φ`, the samples are
  `sin(t)` or `sin(t)/t`, where `t = 2πr/λ + φ` (phase in radians).
  Sinc uses its removable limit of 1 at `t = 0`, so every phase stays finite.
  Scroll adjusts frequency by 0.5 cycles per grid side; **Ctrl+scroll** adjusts
  phase by 5°, between −180° and +180°. Sliders and ± buttons are available.
  Each radial brush remembers its own frequency and phase. **Shift+scroll**
  changes paint value. Wipe follows the pointer; Draw/Add/Mask keep the press
  position as their center for the stroke. Ring previews mark positive and
  negative extrema. Erase clears the whole canvas. Snap, Live updates,
  rotational symmetry, and horizontal/vertical repeat work as with other brushes.
- Choose **Gaussian** with its brush button or `5`. It paints
  `value × exp(−(dx² + dy²) / (2σ²))` across the canvas, centered where you press.
  Its peak is the paint value. Set the standard deviation **σ** in pixels with
  the slider, ±0.5 buttons, **scroll**, or `[` and `]`.
  Scroll up to increase σ and down to decrease it. The range is 0.5 to half the
  grid size; each brush remembers its setting, clamped on resizing.
  Preview rings show 1σ and 2σ. Draw, Add, and Mask retain the initial center during
  a stroke; in Wipe the Gaussian follows the pointer and can be resized while
  dragging. Erasing with Gaussian clears the selected canvas.
- **Inverted Gaussian** paints `value × (1 − exp(−r² / (2σ²)))`, using the same
  standard-deviation slider, ± buttons, scroll/bracket controls, and preview rings.
  Its center is zero and its outer values approach the paint value. It covers the
  entire canvas, follows the pointer in Wipe, and stays anchored to the initial
  press in Draw/Add/Mask. Erase clears the entire component.
  For a smooth highpass, use Mask with paint value 1 at the frequency origin.
  In Real / Imaginary view, enable Link editing to filter both components;
  in Magnitude / Phase view, filter magnitude alone so phase is preserved.
- Hold **Ctrl** and scroll over a canvas to rotate Square, Line, or Wave, or use the **Rotation**
  or **Direction** slider. Scrolling down rotates clockwise and scrolling up rotates back.
  Each brush remembers its angle. In Wipe you can rotate while dragging;
  hovering alone changes the preview without painting.
- Every slider has plus/minus buttons: size changes by 2 pixels, rotation or
  direction by 5°, wave frequency by 0.5 cycles, Gaussian σ by 0.5 pixels,
  and paint value by 0.1.
  Buttons disable at the slider limits; angles wrap around.
- Adjust the circle diameter, square side length, or line width with the slider, plus/minus buttons,
  or `[` and `]`. Each brush remembers its size.
- Scroll over any canvas to adjust circle diameter, square
  side length, line width, wave frequency, or Gaussian σ. Scroll up to increase and down
  to decrease, in steps of 2 pixels or 0.5 cycles. Values stay within the slider
  limits. In Wipe, these adjustments also update the brush while dragging.
- Hold **Shift** and scroll to adjust paint value by 0.1 per step: up increases,
  down decreases. Shift takes priority over Ctrl. Paint value stays between −1
  and +1. In Wipe, changing value while dragging updates the current brush.
  Pan, Rotate, and Stretch do not use these brush adjustments. Page scrolling is blocked
  over all canvases, regardless of the selected tool or modifiers.
- **Line** extends across the entire canvas through the pointer. Set its width
  and **Direction**; dragging sweeps the line without gaps.
- **Wave** fills the entire canvas with positive and negative cosine bands.
  Set **Direction** and **Frequency**, measured in cycles per grid side along
  that direction. Frequency ranges from 0.5 to half the grid size.
  In Draw, Add, and Mask, bands stay aligned to the starting point throughout each
  drag. In Wipe they follow the pointer. Changing
  resolution retains the frequency, clamped to the new grid's maximum.
- Hover over a canvas to preview the brush outline. Wave previews mark positive
  peaks and negative troughs in their respective colors. Erase previews show
  the whole area to be cleared; erasing with Wave clears the selected canvas.
  Hovering never changes the grids.
- Press `B` for paint and `E` for erase. Focus a canvas and use arrow keys to
  position the brush, then Enter or Space to stamp the selected brush.
- The brush value ranges from −1 to +1; Add can accumulate values beyond that.
  Mint represents positive values, gold
  represents negative values, and dark represents zero.
- Resolutions include powers of two from 1 through 1024, plus each positive size minus 1 (3, 7, 15, 31, 63, 127, 255, 511, and 1023). Odd sizes use Bluestein convolution through the same WASM FFT, with exact grid dimensions. Changing resolution resets all four grids to empty.

Both domains display their origin at the center, with labels on both axes.
Real canvases have blue outlines and imaginary canvases amber outlines, using
a Wolfram-inspired palette. The paired arrows between the column headings show
the forward Fourier transform to the right and the inverse transform to the left.
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

**Snap to grid**, at the top of the toolbox, also controls manipulation locking
and is on by default. Pan and
Stretch snap independently to the horizontal/vertical lines through the starting
pointer position when a delta is within 8 screen pixels of zero. Returning near
both lines restores zero displacement / unit scale. Rotate snaps to its starting
angle near its starting horizontal line. The same toggle controls brush snapping
and applies with linked editing, Live updates, and either representation.
While dragging with the lock enabled, dashed lines through the press point show
where snapping occurs. Faint bands mark the eight-pixel tolerance, engaged lines
turn solid mint, and a small ring marks the fixed starting point. Rotate shows
its horizontal reference line. These active tool guides stay visible when static
grid lines are hidden and disappear on release or cancellation.
Keyboard manipulation shortcuts retain their existing behavior.

## Views and editing history

The **Link editing** button in each canvas header applies brushes, erase, Rotate,
Pan, and Stretch to both components of that domain. Spatial and Frequency have
independent settings, both initially off. Either header toggles both link icons
on that side; their highlight stays on while linked. Add and
manipulation preserve each component's independent values.
Other canvas toolbar actions remain individual. Every enabled header button
briefly glows when pressed, with a soft red flash for Trash. Live updates transforms
the paired edit together.

Each domain has an independent **Real / Imaginary ↔ Magnitude / Phase** switch
above its plots (Real / Imaginary by default). Magnitude is on top; phase is below,
in radians from −π to +π. All brushes, manipulation tools, linking, and toolbar
operations edit the displayed representation. Transforms always operate on complex
Cartesian values; switching views does not run a transform. Negative magnitude
edits become positive magnitude with a π phase shift, and phase edits wrap at ±π.
Phase can be painted at zero magnitude before adding magnitude. Magnitude uses its
own brightness scale; phase uses a fixed ±π scale. Edit the phase canvas directly
with linking off to change phase while preserving magnitude. Copy stores the displayed scalar values, so they can be
added to any other canvas with Paste.

**Undo / Redo** buttons stay visible above Clear all. Ctrl/Cmd+Z undoes;
Ctrl/Cmd+Shift+Z or Ctrl+Y redoes. Each completed gesture is one step, including
live brush updates, linked edits, Rotate, Pan, and Stretch.
Canvas Paste, Invert, mirrors, clear, Clear all, and grid-size changes are also
undoable. Both domains restore together without another FFT. View and tool
settings stay selected, and Copy does not change history. Undo/Redo are disabled
while drawing or transforming. New edits discard redo; no-ops preserve it.
History holds up to 50 steps with a combined 128 MiB snapshot budget.

**Mask** is a draw mode alongside Wipe, Draw, and Add. It multiplies the
existing values by the brush samples once per pixel per stroke, including
symmetry and repeat copies; pixels outside the footprint stay unchanged.
A factor of 1 preserves values, 0 clears them, and negative factors flip signs.
Gaussian, Wave, and radial brushes multiply their full fields, anchored at the
initial press. Erase continues to clear the brush footprint in every mode.
Mask supports linked edits, magnitude/phase views, Live updates, and Undo/Redo.

## Performance checks

`npm run bench:editing` compares the previous full-grid editing paths with the
optimized paths at 512×512 and 1024×1024. It reports median and p95 times and
writes `.tmp/editing-benchmark.json`. These are isolated CPU measurements;
they exclude FFT, history snapshots, GPU rendering, and input/display latency.
`npm run bench` measures the existing brush and CPU rendering pipeline.
`npm run bench:drawing` compares full-clear versus bounded Wipe continuations,
previous versus native-copy Pan, and GPU texture preparation. It checks numerical
equivalence and writes `.tmp/drawing-benchmark.json`. Texture timings measure CPU
packing for upload, not GPU draw calls or complete input-to-display latency.

During a plain Circle, Square, or Line Wipe gesture, later stamps clear only the
previous stamp's known nonzero bounds. The first stamp still clears all existing
contents, and every new gesture discards the cached footprint. Symmetry and repeat
retain their full-clear path. Resize, rotation, value changes, zero stamps,
linked editing, and polar normalization keep the cached footprint valid.

Pan compares against the frozen, wrapped source until it finds a difference,
then copies contiguous row segments using native TypedArray operations. Identical
and periodic shifts still report no changes. GPU packing also splits wrapped rows
into contiguous segments; a scale of 1 uses native Float64-to-Float32 conversion.


The editing pipeline shares component range tracking, brush capabilities, canvas
toolbar handlers, and frame queues for Wipe and manipulation gestures. Unchanged
strokes and manipulation frames skip transform work. Small polar edits normalize
only their changed bounds, avoiding unnecessary full-canvas conversion and scans. Global extrema still require a scan when
the last occurrence of an existing minimum/maximum disappears.

Polar FFT input writes directly into reusable worker buffers; polar FFT output
converts in place. At 1024×1024, each avoids a temporary 16 MiB pair of Float64
arrays. Rotate and Stretch share frozen snapshots with row copies into their
zero-bordered sampling buffers. Numerical data stays Float64 throughout editing.

## GitHub Pages

The interface uses Tailwind CSS with Vite. The production build is a static SPA;
relative asset URLs allow it to run at a repository subpath or a domain root.
The worker and WASM file are included in `dist` alongside the app.

In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
Push to `main`, or run the **Deploy to GitHub Pages** workflow manually. The
workflow runs the tests, builds the app, and deploys `dist`. It needs no backend
or secrets. For other static hosts, upload the contents of `dist`.

Publishing the source repository directly skips Vite and causes module-loading
errors. Relative asset URLs support `https://teuncm.nl/fourier-grid/`; the custom
domain stays configured on the account's main Pages site.

Search metadata, sharing artwork, the project sitemap, and a ready-to-use link
for the main site are described in [Search and sharing](docs/seo.md).
