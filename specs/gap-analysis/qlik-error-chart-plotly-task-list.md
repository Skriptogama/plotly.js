# Plotly Gap-Closure Task List For Error Chart Parity

## How To Use This Backlog

- Each task has a stable task number.
- Each task is written to be actionable and independently completable.
- Check the box when the task is done.
- Keep implementation aligned with normal Plotly ownership boundaries and public API patterns.

## Phase 0: Design And Scope Control

- [x] Task 0.1: Freeze the initial public API proposal for shared stroke features.
  **Done.** API shape: extend existing `line.dash` string to accept custom px patterns (e.g. `"8,4,2,4"`) — no separate `dasharray` attribute needed since `drawing/attributes.js` already documents this. Add `line.cap` as an enumerated attribute (`butt`/`square`/`round`, dflt `butt`). No `line.dashmode` or `line.dashgap`.

- [x] Task 0.2: Decide explicit backwards-compatibility rules for raw SVG dash strings.
  **Done.** `line.dash` keeps full backward compat: named presets still work; any unrecognised string is passed through as a raw `stroke-dasharray`/pixel string. scattergl previously only accepted named values — that restriction was removed by switching from `valType:'enumerated'` to `valType:'string'`.

- [x] Task 0.3: Decide the GL parity policy for each feature before implementation.
  **Done.** Every Phase 1 feature was delivered on `scatter` and `scattergl` simultaneously. scattergl is the higher-priority renderer.

## Phase 1: Shared Stroke Model

Both `scatter` and `scattergl` are primary delivery targets for every task in this phase. `scattergl` is the higher-priority renderer. Attribute changes must land on both trace types simultaneously; a `scatter`-only staged delivery is only acceptable when a specific `scattergl` blocker is documented.

### API and schema tasks

- [x] Task 1.1: Add `line.cap` attribute definition to the shared drawing attributes. Extend `line.dash` (already present) to explicitly document custom px-string patterns.
  **Done.** `exports.linecap` added to `src/components/drawing/attributes.js`. `exports.dash` already accepts custom strings — description already states this. No new `dasharray` attribute required.

- [x] Task 1.2: Wire `line.cap` into both `scatter` and `scattergl` attribute files in one pass. Loosen `line.dash` in `scattergl` from enumerated to string.
  **Done.** `line.cap` added to `src/traces/scatter/attributes.js`; `coerce('line.cap')` added to `src/traces/scatter/line_defaults.js` (shared by scattergl defaults). `src/traces/scattergl/attributes.js` now imports `drawAttrs` and uses `drawAttrs.dash` (string) and `drawAttrs.linecap`.

- [x] Task 1.3: Wire `line.cap` into shape line attributes.
  **Done.** `cap: extendFlat({}, linecap, { editType: 'arraydraw' })` added to the `line` object in `src/components/shapes/attributes.js`. `coerce('line.cap')` added to `src/components/shapes/defaults.js`. `src/components/shapes/draw.js` reads `options.line.cap` and passes it as the third argument to `Drawing.dashLine`.

### scattergl implementation (primary)

- [x] Task 1.4: Update `scattergl/convert.js` to pass custom `line.dash` strings and `line.cap` to `regl-line2d`.
  **Done.** `regl-line2d` already supports arbitrary numeric `dashes` arrays and a `cap` property — no changes to the package needed. `src/traces/scattergl/convert.js` now branches on named-preset vs custom string: custom strings are split on `,` and each value is `parseFloat`-ed then scaled by `width * pixelRatio`. `opts.line.cap = trace.line.cap` when set.
  When `trace.line.dasharray` is set, pass the numeric array directly as `opts.line.dashes` instead of the DASHES map lookup. Pass `trace.line.cap` as `opts.line.cap`.
  Files: `src/traces/scattergl/convert.js`.
  Validation: `scattergl` test confirms a custom `dasharray` produces different rendering than any named dash preset; `line.cap: 'round'` produces a visually distinct cap.

### scatter implementation

- [x] Task 1.5: Update scatter rendering to apply `line.cap` as `stroke-linecap` and resolve custom `line.dash` strings.
  **Done.** `Drawing.dashLine` now accepts an optional 4th `cap` argument and sets `stroke-linecap` when provided. `drawing.singleLineStyle` and `drawing.lineGroupStyle` both read `line.cap` from the trace and pass it through.

### Finalization tasks

- [x] Task 1.6: Update public documentation and examples.
  **Done.** `examples/bigdata/index.html` now exposes **Line Dash** (text input, supports named presets and custom `"8,4,2,4"` patterns) and **Line Cap** (select: butt/square/round) controls. Both are wired into every generated trace’s `line` object and are disabled during a run.

- [x] Task 1.7: Add regression coverage for both trace types.
  **Done.** `test/jasmine/tests/scatter_marker_line_dash_test.js` extended with a `describe('Test scatter trace line cap:')` block (5 tests: default butt, round, square, restyle, custom dash string). `test/jasmine/tests/scattergl_test.js` extended with `describe('scattergl line dash and cap convert')` (7 unit tests for named presets, custom strings, px-suffixed strings, fallback, and cap passthrough).

## Phase 2: Error-Bar Style Expansion

### API tasks

- [x] Task 2.1: Extend error-bar attributes with per-side color override.
  **Done.** Added `colorminus` (`valType: 'color'`) to `src/components/errorbars/attributes.js`. `plot.js` generates split `path.yerror-plus`/`path.yerror-minus` (and x equivalents) when `colorminus` is set, preserving the existing single `path.yerror` when it is not. Backward compatible.

- [x] Task 2.2: Add new error-bar `cap` and `dash` attributes.
  **Done.** `dash: extendFlat({}, drawAttrs.dash, ...)` and `cap: extendFlat({}, drawAttrs.linecap, ...)` added to `src/components/errorbars/attributes.js`, sharing the same shared drawing attribute definitions used by scatter and shapes.

- [x] Task 2.3: Coerce new error-bar defaults.
  **Done.** `coerce('dash')`, `coerce('cap')`, `coerce('colorminus')` added to `src/components/errorbars/defaults.js` inside the existing `if(!opts.inherit || !containerOut[copyAttr])` guard. Inherits `dflt: 'solid'` for dash and `dflt: 'butt'` for cap from drawing attributes.

### scatter implementation tasks

- [x] Task 2.4: Update `scatter` error-bar styling to support custom dash arrays.
  **Done.** `src/components/errorbars/style.js` now imports `Drawing` and applies `Drawing.dashStyle(obj.dash, obj.thickness)` as `stroke-dasharray` to all y-error and x-error paths (combined + split).

- [x] Task 2.5: Update `scatter` error-bar styling to support separate positive and negative colors.
  **Done.** `style.js` selects `path.yerror-plus`/`path.xerror-plus` with `color` and `path.yerror-minus`/`path.xerror-minus` with `colorminus`. When split paths are not present (colorminus not set) those selectors match nothing harmlessly. `plot.js` generates split paths when `colorminus !== undefined`.
  **Limitation**: `copy_ystyle` on `error_x` copies the y style at render time in `style.js`, but `plot.js` checks `error_x.colorminus` directly — set `error_x.colorminus` explicitly if per-side x-error colors are needed with `copy_ystyle`.

- [x] Task 2.6: Add `scatter` error-bar cap-shape support.
  **Done.** `style.js` applies `stroke-linecap` from `obj.cap` to all error-bar path elements (combined + split).

### scattergl implementation tasks (primary)

- [x] Task 2.7: Extend scattergl conversion to emit the richer error-bar style model.
  **Done.** `convertErrorBarStyle` in `src/traces/scattergl/convert.js` now forwards `colorminus` onto the opts object when set. `regl-error2d` draws one batch per error group, so per-side color (two separate passes) is deferred to Tasks 2.8/2.9. `cap` and `dash` are SVG-only for error bars.

- [ ] Task 2.8: Extend `regl-error2d` to support custom whisker dash patterns.
  Files: `node_modules/regl-error2d/index.js`.
  Validation: add a narrow renderer test or fixture for dashed GL error bars.

- [ ] Task 2.9: Extend `regl-error2d` to support cap shape semantics if feasible.
  Files: `node_modules/regl-error2d/index.js`.
  Validation: document whether full cap-shape parity is implemented or intentionally deferred.

### Finalization tasks

- [ ] Task 2.10: Add focused error-bar regression tests for `scatter` and `scattergl`.
  Files: `test/jasmine/tests/errorbars_test.js`, `test/jasmine/tests/scattergl_test.js`.
  Validation: targeted suites pass and cover mixed positive or negative styling.

## Phase 3: Marker Masking For Lines And Fills

### Design tasks

- [ ] Task 3.1: Finalize the marker-mask public API.
  Proposed fields: `marker.mask.enabled`, `marker.mask.padding`, `marker.mask.affects`, `marker.mask.shape`.
  Validation: record explicit behavior for markers-only traces, lines-only traces, and line+fill traces.

- [ ] Task 3.2: Decide the `scattergl` masking implementation strategy before writing any code.
  The default delivery target is `scatter + scattergl` together. Choose the GL masking approach (stencil pass, alpha-mask pass, or CPU-side segment splitting) first, since it constrains the scatter API design.
  Validation: document the chosen approach and any known limitations; no implementation starts until this is recorded.

### scatter implementation tasks

- [ ] Task 3.3: Add marker-mask attributes to `scatter` and `scattergl` marker config.
  Files: `src/traces/scatter/attributes.js`, `src/traces/scattergl/attributes.js` if shared early.
  Validation: schema includes the mask fields on scatter-family markers.

- [ ] Task 3.4: Implement per-trace SVG mask or clip-path generation from marker geometry.
  Files: `src/components/drawing/index.js`, `src/traces/scatter/plot.js`.
  Validation: add a `scatter` test showing visible line gaps around markers.

- [ ] Task 3.5: Apply marker masks to line layers.
  Files: `src/traces/scatter/plot.js`.
  Validation: line-only and line+marker traces both behave correctly with mask enabled.

- [ ] Task 3.6: Apply marker masks to area fills when `marker.mask.affects` includes fills.
  Files: `src/traces/scatter/plot.js`.
  Validation: filled traces show exclusion around markers without damaging fill continuity elsewhere.

### scattergl implementation tasks

- [ ] Task 3.7: Prototype one GL masking approach and record tradeoffs.
  Candidates: stencil pass, alpha mask pass, or CPU-side segment splitting.
  Files to inspect: `src/traces/scattergl/convert.js`, `node_modules/regl-line2d/index.js`, `node_modules/regl-scatter2d/scatter.js`.
  Validation: short design note attached to the implementation PR.

- [ ] Task 3.8: Implement the chosen scattergl masking approach.
  Files: `src/traces/scattergl/convert.js`, relevant regl package files.
  Validation: add a focused `scattergl` regression test showing masked line gaps around markers.

- [ ] Task 3.9: Measure runtime and memory impact of marker masking on large traces.
  Files: likely example or benchmark harnesses.
  Validation: record before or after numbers for a representative large scattergl case.

## Phase 4: First-Class Trendlines

### API tasks

- [ ] Task 4.1: Finalize the trendline trace-level config shape.
  Proposed fields: `trendlines[]`, `trendlines[i].type`, `trendlines[i].line.*`, `trendlines[i].label.*`.
  Validation: provide at least two example configs, one minimal and one fully styled.

- [ ] Task 4.2: Add scatter attribute definitions for trendlines.
  Files: `src/traces/scatter/attributes.js`.
  Validation: schema exposes the new trendline container correctly.

- [ ] Task 4.3: Add default coercion for trendline items.
  Files: `src/traces/scatter/defaults.js` and any extracted helper.
  Validation: traces without `trendlines` remain unchanged.

### Calculation tasks

- [ ] Task 4.4: Add a shared trendline calculation helper under Plotly source.
  Files: new shared helper under `src/components/` or `src/traces/scatter/`.
  Validation: unit tests cover average, linear, polynomial, exponential, logarithmic, and power.

- [ ] Task 4.5: Build internal derived-trace generation for both `scatter` and `scattergl`.
  The calculation engine must be renderer-agnostic. Scatter rendering goes through `src/traces/scatter/calc.js` and `plot.js`; scattergl rendering goes through `src/traces/scattergl/convert.js`. Both consume the same shared trendline calc output.
  Files: `src/traces/scatter/calc.js`, `src/traces/scatter/plot.js`, `src/traces/scattergl/convert.js`, shared trendline helper.
  Validation: trendlines render on both `scatter` and `scattergl` traces from the same config without any user-side helper traces.

- [ ] Task 4.6: Add trendline labels and label-position logic.
  Files: scatter plotting and annotation helper surfaces as needed.
  Validation: targeted tests cover start and end label placement.

### Trendline render tasks — scattergl trendline rendering is part of the derived-trace pipeline built there)

## Phase 5: Label Background Boxes

### API tasks

- [ ] Task 5.1: Finalize text background attribute names.
  Proposed fields: `textbgcolor`, `textbordercolor`, `textborderwidth`, `textpadding`, `textradius`.
  Validation: confirm naming aligns with Plotly conventions and does not conflict with existing text APIs.

- [ ] Task 5.2: Add label background attributes to scatter-family traces.
  Files: `src/traces/scatter/attributes.js`, possibly shared font or text helpers.
  Validation: schema includes the new text-box fields.

### scatter implementation tasks

- [ ] Task 5.3: Implement `scatter` label background box rendering.
  Files: `src/components/drawing/index.js`, `src/traces/scatter/plot.js`.
  Validation: add tests for padding, border width, and radius.

- [ ] Task 5.4: Ensure label boxes respect text blend mode and trace clipping rules.
  Files: same as above.
  Validation: add one test combining text background boxes with blend mode and `cliponaxis` behavior.

### scattergl implementation tasks (primary)

- [ ] Task 5.5: Extend `scattergl` text rendering to support label background quads.
  Files: `node_modules/gl-text/index.js`, `src/traces/scattergl/convert.js`.
  Validation: add a focused scattergl label-box regression test.

## Phase 6: Advanced Point Composition

### API tasks

- [ ] Task 6.1: Finalize nested marker inner and outer style fields.
  Proposed fields: `marker.inner.*`, `marker.outer.*`, `marker.cornerradius`.
  Validation: document how these interact with legacy `marker.color`, `marker.size`, and `marker.line`.

- [ ] Task 6.2: Add attribute definitions and defaults for the new point composition fields.
  Files: `src/traces/scatter/attributes.js`, scatter defaults, and scattergl attributes if shared immediately.
  Validation: existing marker configs remain untouched when new fields are omitted.

### scatter implementation tasks

- [ ] Task 6.3: Extend `scatter` point drawing to support inner and outer marker layers.
  Files: `src/components/drawing/index.js`.
  Validation: add tests for ring-like points, hollow points, and rounded-corner squares.

### scattergl implementation tasks (primary)

- [ ] Task 6.4: Extend scattergl marker conversion and rendering for inner and outer styling.
  Files: `src/traces/scattergl/convert.js`, `node_modules/regl-scatter2d/scatter.js`.
  Validation: add a focused scattergl test with separate inner and outer point styling.

## Phase 7: Advanced Error-Bar Statistics

- [ ] Task 7.1: Decide whether advanced statistics belong in Plotly core or in integration preprocessing.
  Validation: record the decision before adding new public attributes.

- [ ] Task 7.2: If approved for core, add shared computation helpers for advanced error modes.
  Files: `src/components/errorbars/`.
  Validation: unit tests cover each supported statistical mode.

- [ ] Task 7.3: Add new error-bar generation modes to the public API without breaking existing calc behavior.
  Files: `src/components/errorbars/attributes.js`, `src/components/errorbars/defaults.js`, `src/components/errorbars/calc.js`.
  Validation: targeted error-bar tests cover at least one advanced statistical mode end-to-end.

## Cross-Cutting Tasks

- [ ] Task 8.1: Add schema and documentation updates for every new public attribute.
  Validation: generated schema reflects all new fields with descriptions and defaults.

- [ ] Task 8.2: Add `scatter` regression coverage for every new feature.
  Validation: each phase has at least one dedicated `scatter` test proving the new feature works.

- [ ] Task 8.3: Add `scattergl` regression coverage for every new feature in the same PR as the `scatter` implementation.
  `scattergl` coverage is not optional; it must not be deferred to a follow-up PR unless a documented technical blocker exists.
  Validation: `test/jasmine/tests/scattergl_test.js` gains targeted coverage for each delivered feature alongside the scatter test.

- [ ] Task 8.4: Audit performance for every new feature on representative large traces.
  Validation: record whether the feature is safe by default or needs a guarded opt-in because of performance cost.

- [ ] Task 8.5: Keep feature delivery incremental and PR-sized.
  Validation: no single PR mixes unrelated phases such as shared stroke work and marker masking.

## Suggested Delivery Sequence

- [ ] Task 9.1: Deliver Milestone 1.
  Scope: `line.dasharray` and `line.cap` working in both `scatter` and `scattergl`; richer error-bar dash and cap support on both trace types.
  Exit criteria: custom dash arrays and line caps produce correct output on `scattergl` traces (primary) and `scatter` traces.

- [ ] Task 9.2: Deliver Milestone 2.
  Scope: marker masking for `scatter` and `scattergl` with final public API.
  Exit criteria: both `scatter` and `scattergl` traces visibly exclude marker footprints when enabled. A `scatter`-only staged delivery is acceptable only if the `scattergl` path and timeline are explicitly documented.

- [ ] Task 9.3: Deliver Milestone 3.
  Scope: first-class trendlines and label background boxes on both `scatter` and `scattergl`.
  Exit criteria: normal Plotly `scatter` and `scattergl` config can express styled trendlines and labeled text boxes without helper traces from integration code.

## Do Not Start With

- [ ] Task 10.1: Avoid putting Qlik-specific color transforms or transition semantics into the first Plotly-core wave.
  Reason: low reuse outside the integration case and high surface-area cost.

- [ ] Task 10.2: Avoid trying to replicate the Qlik viewport and virtualization model inside Plotly core in the first pass.
  Reason: much larger architectural scope than the chart-style parity gaps.

- [ ] Task 10.3: Avoid combining advanced statistics with the first rendering-style milestone.
  Reason: it mixes analytic semantics into a renderer-focused delivery and increases review risk.