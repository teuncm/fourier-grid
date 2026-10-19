# Fourier playground requirements

Consolidated requirements for the current 2D app, incorporating the final decisions from development. Use this as a design reference for a 1D playground; the adaptation notes at the end are suggestions, not additional requirements.

## Signal and transforms

- Provide four editable scalar canvases in a fixed 2×2 layout: **Spatial domain** on the left, **Frequency domain** on the right; real above imaginary in each domain. Both domains are inputs, not separate “drawing” and “output” areas.
- Editing either component on the left runs the forward transform; editing on the right runs the inverse. Preserve the unedited companion component unless editing is explicitly linked.
- Start with all canvases empty. Default resolution: **127×127**. Offer sizes `1, 2, 3, 4, 7, 8, 15, 16, 31, 32, 63, 64, 127, 128, 255, 256, 511, 512, 1023, 1024`. Changing size clears all canvases and is undoable.
- Center the origin in both domains, including odd sizes; show clear horizontal and vertical axes, axis labels, and an origin marker. The 1×1 transform is the same complex sample.
- Use complex-to-complex FFTs with unitary normalization: `1/N` in each direction for an `N×N` grid. Retain Float64 numerical data and support signed values beyond ±1 without clipping.
- Use an efficient maintained low-level FFT library, preferably WASM, rather than a handwritten JavaScript FFT. Support exact odd dimensions, not silently padded signals. Current implementation uses locally bundled `wat-fft` with Bluestein for odd sizes.

## Representations and linked editing

- Each domain independently switches between **Real / Imaginary** and **Magnitude / Phase**. Default to real/imaginary; magnitude is above phase, expressed in radians within ±π.
- Switching representation preserves the complex signal without running another transform. All brushes, manipulations, and canvas actions operate on the displayed scalar values; FFT input/output uses Cartesian complex values.
- Convert negative magnitude to positive magnitude with a π phase shift; wrap phase at ±π. Allow phase to be set at zero magnitude before magnitude is added.
- Provide a **Link editing** button in every canvas header, with independent Spatial/Frequency settings, both off by default. Either header on a side toggles and highlights both link icons in that domain. Use these controls for brushes, erase, and manipulation. It applies the operation to both components in the active domain, preserving their independent starting values. Transform the paired edit together.
- Edit phase directly in Magnitude / Phase view with linking off to preserve magnitude. Individual canvas toolbar actions remain individual regardless of the link setting.

## Painting

- Clicking an already-selected brush or manipulation deselects it. Hide its properties, preview, and snap markers; canvas drawing/keyboard stamps/wheel adjustments do nothing until a tool is selected. Retain tool settings for reselection. Number shortcuts select without toggling off.

- Support Paint and Erase, side by side with their hotkeys. Right-button dragging also erases. Erase sets the brush footprint to zero in every drawing mode.
- Provide modes in this order: **Wipe** (default), **Draw**, **Add**, **Mask**.
  - Wipe clears the selected canvas and places the current brush. Moving replaces that placement, leaving no trail.
  - Draw replaces values inside the footprint; values outside remain intact. This differs from clipboard Paste, which adds.
  - Add sums brush values without a cap. Each destination pixel receives one contribution per stroke, independent of event frequency or overlapping stamps.
  - Mask multiplies values inside the footprint once per pixel per stroke. Outside values remain intact; 1 preserves, 0 clears, and negative factors invert signs.
- Paint value ranges from −1 to +1; accumulated signal values are unrestricted. Interpolate ordinary dragging so strokes do not have gaps.
- Full-canvas field brushes stay anchored to the initial press in Draw/Add/Mask. In Wipe they follow the pointer. Consequently, Draw with a full-canvas field replaces the entire component; these brushes do not leave successive trails within a stroke.
- Hovering previews the footprint without editing. Show signed peaks/troughs for waves and rings for radial fields; show the actual erase area.

| Brush | Behavior and parameters |
| --- | --- |
| Circle | Filled circular footprint; adjustable diameter. |
| Square | Filled square; adjustable side length and rotation. |
| Fill | Constant paint value over the entire canvas; Wipe/Draw replace, Add adds once per pixel per stroke, Mask scales, Erase clears. Supports linking, live/deferred updates, and history; no size/direction or position dependence, and symmetry/repeat do not restrict coverage. |
| Line | Strip extending across the entire canvas through the pointer; adjustable width and direction. |
| Wave | Alternating positive/negative cosine bands across the entire canvas; adjustable direction and frequency in cycles per grid side. |
| Gaussian | Full-canvas `value × exp(−r²/(2σ²))`, centered on the pointer; adjustable standard deviation, with 1σ/2σ preview rings and no artificial cutoff. |
| Inverted Gaussian | Full-canvas `value × (1 − exp(−r²/(2σ²)))`; same σ controls and rings. Use Mask with paint value 1 at the frequency origin for a smooth highpass; filter both Cartesian components, or magnitude alone in polar view. |
| Radial sine | Full-canvas concentric `value × sin(t)` bands centered on the pointer. |
| Radial sinc | Full-canvas `value × sin(t)/t`, with limit 1 at `t=0`. |

- For radial fields, `t = 2πr/λ + φ`; expose frequency and phase (−180° to +180°). Each radial brush remembers its own settings.
- Preserve each brush's size, orientation, and relevant settings when switching tools; clamp them appropriately when resolution changes. Frequency extends from 0.5 cycles to the grid's Nyquist limit; Gaussian σ from 0.5 pixels to half the grid size, with tiny-grid handling.
- Provide a **Noise** checkbox under Basic brushes (Circle/Square/Fill), off by default. Fill their footprints with uniform signed white noise scaled by paint value. Generate a fresh pattern per stroke, stable per canvas pixel throughout the gesture; support their size/rotation, every drawing mode, linking, symmetry/repeat, and history. Erase clears the ordinary footprint. Advanced brushes ignore Noise.

## Whole-canvas manipulation

- Group **Rotate**, **Pan**, and **Stretch** under **Manipulate**. These operate on the whole selected canvas, or both components when linked; brush size/value, painting modes, symmetry, and repeat do not affect them.
- **Rotate:** rotate about the origin; upward drag is counterclockwise, downward clockwise, one canvas-height per turn. Preserve exact quarter turns; otherwise use bilinear interpolation and zero outside the canvas.
- **Pan:** translate by whole pixels with wrapping across both dimensions. Preserve sample values exactly, including drags beyond the edges.
- **Stretch:** remain pinned to the origin. Right/up expands X/Y; left/down contracts. Axes scale independently; half a canvas of travel doubles/halves that axis, limited to 0.125×–8×. Use bilinear interpolation and zero outside the edges. Show scale factors, the fixed origin, a deformed grid/ellipse, and X/Y arrows, with Y at the top; distinguish expansion from compression visually.
- Manipulations sample the initial gesture snapshot rather than repeatedly resampling intermediate results. Returning to the starting position restores the exact original.
- **Snap to grid**, the shared top-level toggle (on by default), also locks manipulations: snap displacement within 8 CSS pixels of the starting horizontal/vertical reference lines back to zero, independently per axis. Rotate snaps back to its initial angle near its starting horizontal line. Show dashed reference lines, faint tolerance bands, a start marker, and a stronger engaged line. Keep these active guides visible when static grid lines are hidden.

## Symmetry, repetition, and snapping

- Global **Symmetry**, off by default: 2–24 rotational slices with adjustable boundary angle. Clip drawing/erase to one slice and copy to the others at the same relative radius/angle.
- **Horizontal repeat** copies across columns; **Vertical repeat** copies down rows. Both default off and combine into a grid. Each count is 2–16, limited by resolution; disable on 1×1. Uneven divisions must preserve relative position between cells differing by one pixel.
- Repetition and rotational symmetry are mutually exclusive. Changing their settings does not change existing content.
- Draw/Add/Mask use the starting slice/cell; Wipe uses the current one and clears once before all copies. Avoid duplicate Add/Mask contributions where copies overlap. Show faint boundaries and repeated/clipped previews, less prominent than the axes.
- **Show grid lines** defaults on. **Snap to grid**, directly below it, defaults on: brush positions snap independently to central X/Y axes within 8 CSS pixels, or to the origin near both. Preview, painting, and erase share the snapped position. Snapping works with grid lines hidden. The same toggle controls manipulation locking; there is no separate toggle under Manipulate.
- Indicate engaged brush snapping directly on the axes with a bright position ring and a short illuminated tick along each locked axis; show both at the origin. Keep active markers visible with static grid lines hidden and remove them when snapping disengages. Do not show brush snap markers for whole-canvas manipulations.

## Updates, canvas actions, and history

- **Live updates** defaults on. When off, editing remains responsive locally and the other domain updates only on release, consistently across every brush/mode and manipulation. Release must include the complete final gesture. Wipe must not override this setting.
- Each enabled canvas-header action briefly glows when pressed, with a red-tinted flash for Trash; repeated presses restart the feedback.
- Each canvas top bar provides **Link editing**, **Mirror horizontally**, **Mirror vertically**, **Copy**, **Paste**, **Invert**, and **Trash**. Mirrors flip displayed coordinates exactly; Invert multiplies all values by −1; Trash clears only that component. Mutations update the other domain immediately even with live updates off.
- Copy stores an immutable snapshot of the displayed scalar values. Clipboard Paste adds it to any same-sized canvas without clipping, preserving its companion. Keep the copy across edits, clearing, and resizing; disable Paste when sizes differ. No separate Paste inverted action.
- Provide a compact, slightly red, full-width **Clear all** button with a trash icon; it clears all four canvases. Individual trash buttons use the same restrained red.
- Provide Undo/Redo for complete gestures, linked edits, manipulations, canvas mutations, clearing, and size changes. One gesture is one step, including live updates. Restore both domains together without recomputing the FFT; retain selected tools and views. Copy and view/settings changes do not create history. No-ops preserve redo; new edits discard it. Bound history memory (current limit: 50 steps / 128 MiB).
- Disable conflicting actions during active gestures/transforms. Show ready/busy/error state and clear copy feedback.

## Input and visual design

- Wheel over a canvas adjusts size, line width, Gaussian σ, or field frequency. **Ctrl+wheel** adjusts Square/Line/Wave orientation or radial phase. **Shift+wheel** adjusts paint value and takes precedence over Ctrl. Block page scrolling over every canvas, even with manipulation selected.
- Provide sliders plus suitable ± buttons: size 2 pixels, orientation/phase 5°, frequency 0.5 cycles, σ 0.5 pixels, paint value 0.1. Disable at limits; wrap orientations. Wipe adjustments while dragging update the current placement; hovering changes only the preview.
- Retain shortcuts: B/E Paint/Erase; 1–5 Circle/Line/Wave/Square/Gaussian; 6–8 Rotate/Pan/Stretch; brackets adjust brush size/σ. Focused-canvas arrows move the brush, Enter/Space stamps; Pan arrows move one pixel, Rotate Up/Down changes 5°. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z or Ctrl+Y redoes.
- Prevent page text selection, browser drag selection, Tab/Shift+Tab navigation, and unwanted button focus highlights, including while Shift is held. Retain deliberate shortcuts and clear labels/tooltips.
- Use a compact dark interface with bright mint positive values, bright colorful gold negative values, and dark zero. Both extrema must be readily visible. Normalize brightness across the real/imaginary pair in each domain; magnitude has its own scale and phase a fixed ±π scale.
- **Boost faint values**, on by default, changes display contrast only. Always show each canvas's actual min/max and pointer sample/coordinates; expose full numerical precision on range hover.
- Use distinct Wolfram-inspired blue/amber component colors on the outer plot cards and component markers, including magnitude/phase views. Inner canvas borders must be subtle and neutral, avoiding duplicate colored outlines.
- Keep Spatial and Frequency visibly separated horizontally, with waveform and spectrum icons. Between them show **Forward transform** and **Inverse transform** arrows; strongly illuminate/glow the relevant arrow when editing its source domain.

## Workspace and delivery

- Keep the fixed 2×2 canvas arrangement, with domains always side by side; maximize square drawing areas using available width and height, especially on laptops. Do not switch to four across or stack the domains vertically. Keep the toolbox's established compact design; let it scroll independently on desktop. Support small screens without horizontal overflow.
- Put grid size first. Keep Live updates, Boost faint values, Show grid lines, Snap to grid, Undo/Redo, and Clear all outside the collapsible **Tools** section, which starts open. Place brush settings immediately below brush selection. Keep Symmetry and Horizontal/Vertical repeat with the brush settings, directly above Manipulate. Keep phase, symmetry, and repeat labels beside their checkboxes, with consistent compact spacing. Paint/Erase need no separate heading.
- Use one **Brushes** heading. Put Circle/Square and full-width Fill first, with Noise below. Separate the advanced Line/Wave, Gaussian/Inverted Gaussian, and Radial sine/Radial sinc rows with spacing rather than an additional heading.
- Use compact icon controls, canvas headers, and surrounding padding. Avoid a large title/intro section, canned promotional text, and a pattern/preset dropdown; encourage experimentation from empty grids.
- Put the **Fourier Grid** icon/title, Help, status/color legend, and **Fullscreen** in the footer. F toggles fullscreen; Esc exits. Preserve content, history, settings, and toolbox access across transitions. No audio generation.
- Deliver a responsive Tailwind SPA (current stack: Vue/Vite), deployable as static assets on GitHub Pages, including repository subpaths. Bundle worker/WASM locally; require no backend, external CDN, or native compiler.

## Performance and correctness

- Keep drawing responsive at 512×512 and 1024×1024 even with live transforms disabled. Optimize the whole input/edit/render pipeline, not just FFT execution, without changing numerical behavior.
- Prefer WebGL2 GPU coloring/rendering with a Canvas 2D fallback and context recovery. Float32 display textures may approximate colors; authoritative signal values and FFT computations remain Float64.
- Run FFT work in a worker with reusable contexts/buffers and transferable messages; fall back to the same WASM library on the main thread when workers are unavailable. Coalesce live requests to the latest pending state; never build a stale queue or lose the final edit.
- Batch editing/render work per animation frame; process changed components/regions, avoid no-op work and unnecessary allocations/full-grid scans, cache extrema safely, and optimize small Wipe footprints and polar edits. Whole-domain brightness changes must still redraw consistently.
- Verify transforms against direct DFTs, energy conservation, and complex round trips; cover odd/tiny grids, brush algebra, linking, representation changes, manipulation, live/deferred timing, history, GPU/fallback parity, and recovery. Use representative benchmarks and browser checks; distinguish isolated CPU timings from end-to-end latency.

## Search and sharing

- Use `https://teuncm.nl/fourier-grid/` as the canonical production URL. Include a descriptive title/description, static Open Graph/Twitter metadata, a 1200×630 preview image, accurate WebPage/WebApplication structured data, and a project sitemap.
- Supply a readable initial-HTML introduction for visitors without JavaScript; replace it with the playground when the app loads, preserving the compact interface. Link the footer brand back to `https://teuncm.nl/` and provide a project-link snippet for the separately maintained main site.

## Applying this to a 1D playground

Retain bidirectional complex editing, independent Cartesian/polar views, brush algebra, linked operations, phase editing, wrapping translation, origin-pinned scaling, history, clear numerical feedback, and consistent update timing. Reconsider the four-plot arrangement for line plots while keeping the domains visually distinct. Replace 2D-specific footprints, spatial rotation, radial fields, rotational slices, and two-axis repeat with explicitly designed 1D equivalents rather than inheriting their gestures unchanged. For a unitary length-N transform, use `1/√N` normalization in both directions.
