# Plotly Gap-Closure Roadmap For Error Chart Parity

## Goal

Close the highest-value feature gaps in Plotly.js itself so the Error Chart extension can be expressed mostly as normal Plotly trace and layout config, with as little Qlik-specific translation logic as possible.

This roadmap intentionally focuses on Plotly-core work, not on changing the current `refs/error-chart` implementation.

## Design Constraints

- follow the normal Plotly attribute pipeline: `attributes.js` -> `defaults.js` -> `calc/style/convert`
- prefer shared components when the behavior spans SVG and WebGL traces
- avoid adding Qlik-shaped config names directly to Plotly unless the concept is broadly reusable
- primary delivery targets are `scatter` and `scattergl` traces, delivered together; `scattergl` is the higher-priority renderer
- a `scatter`-only staged delivery is acceptable only when a specific, documented `scattergl` technical blocker exists — it is not a default approach
- shapes and error bars follow after the scatter-family work is stable
- every new attribute must behave identically on `scatter` and `scattergl` regardless of which renderer handles the drawing

## Current Reality

Some of the requested surface is already partial in Plotly, but not in the right form for easy integration:

- SVG line dashes already accept named styles and raw pixel dash lists through shared drawing attributes, but the model is inconsistent across trace families and `scattergl` still restricts `line.dash` to enumerated values.
- Error bars already have cap size and thickness, but not stroke cap shape, custom dash patterns, or separate positive and negative styling.
- Markers already support symbols, angle, and line outlines, but Plotly has no point-mask semantics that cut line or fill geometry around markers.

That means the shortest path is not a renderer rewrite. It is a sequence of focused Plotly feature additions in the existing ownership boundaries.

## Priority Order

### Phase 1: Shared stroke model

Priority: highest

This phase closes the most immediate styling gaps and unlocks later work on trendlines and richer error bars.

#### Features

- custom line pattern model that is first-class, not just an SVG dash-string escape hatch
- stroke cap selection for lines and line-like overlays
- consistent dash and cap behavior across SVG scatter, `scattergl`, shapes, and error bars

#### Proposed Plotly API shape

Keep the existing `line.dash` field for backwards compatibility and add only what is genuinely missing:

- `line.dash`: keep existing named values and raw px-string dashes working (already pass-through in SVG)
- `line.dasharray`: new numeric array form for explicit segment lengths (more ergonomic than a px string, needed to unlock scattergl custom dashes without string parsing)
- `line.cap`: `butt`, `square`, or `round` — the only truly missing stroke attribute in SVG

Do NOT add a `line.dashmode` discriminator field. The existing `line.dash` string already auto-detects named vs raw via `drawing.dashStyle()`, and `line.dasharray` can coexist with it as a parallel numeric form.

For error bars, mirror the same additions on `error_x` and `error_y`:

- `error_y.dasharray`
- `error_y.cap`

#### Primary owners

- `src/components/drawing/attributes.js`
- `src/components/drawing/index.js`
- `src/traces/scatter/attributes.js`
- `src/traces/scattergl/attributes.js`
- `src/traces/scattergl/convert.js`
- `src/components/errorbars/attributes.js`
- `src/components/errorbars/defaults.js`
- `src/components/errorbars/style.js`
- `src/components/shapes/attributes.js`

#### Implementation notes

- SVG scatter already passes raw px dash strings straight through `drawing.dashStyle()`. The only missing SVG primitive is `stroke-linecap`, which maps directly to the new `line.cap` attribute.
- `scattergl` currently restricts `line.dash` to named `DASHES` constants in both attributes and convert layers. However, `regl-line2d` already supports arbitrary numeric dash arrays natively (via a 1D GPU texture) and already has a `cap` property (defaulting to `'square'`). The scattergl work is therefore only in `scattergl/attributes.js` (loosen the enumerated restriction and add `line.cap`) and `scattergl/convert.js` (pass numeric arrays straight through instead of always looking up the DASHES map, and pass `cap` to the line options). No changes to `regl-line2d` itself are needed.
- Error bars need SVG styling changes; GL parity requires passing additional style options through `scattergl/convert.js` to `regl-error2d`.

#### Risk

Low to medium overall. For `scatter`, the only new rendering work is setting `stroke-linecap` on lines; `dasharray` already passes through. For `scattergl`, the entire change is in the conversion layer — `regl-line2d` already supports both custom dash arrays and `cap` control natively, so no changes to external regl packages are required.

### Phase 2: Error-bar style expansion

Priority: high

This phase is still a good Plotly-core investment even outside the Qlik use case.

#### Features

- independent positive and negative styling
- custom dash support on whiskers
- cap style control, not just cap width
- optional offset and origin control compatible with the existing Qlik behavior

#### Proposed Plotly API shape

Keep the existing top-level fields, then add optional per-side containers only where needed:

- `error_y.positive.color`
- `error_y.positive.opacity`
- `error_y.positive.dash`
- `error_y.negative.color`
- `error_y.negative.opacity`
- `error_y.negative.dash`
- `error_y.cap`
- `error_y.offsetmode`

This keeps simple configs simple while allowing richer parity when requested.

#### Primary owners

- `src/components/errorbars/attributes.js`
- `src/components/errorbars/defaults.js`
- `src/components/errorbars/style.js`
- `src/components/errorbars/calc.js`
- `src/traces/scattergl/convert.js`
- `node_modules/regl-error2d/index.js`

#### Implementation notes

- The current error-bar calculation model can stay intact for this phase.
- This phase is mostly about richer rendering and styling rather than the advanced statistics engine.

#### Risk

Medium. The attribute model is straightforward, but GL parity requires extending the error-bar shader package.

### Phase 3: Marker masking for lines and fills

Priority: high

This is the clearest renderer-level gap with the existing Error Chart behavior.

#### Feature

Allow markers to act as exclusion masks so line or area geometry visually breaks around the marker footprint instead of simply drawing beneath it.

#### Proposed Plotly API shape

Make this an opt-in marker-owned feature on scatter-family traces:

- `marker.mask.enabled`
- `marker.mask.padding`
- `marker.mask.affects`: `lines`, `fills`, or `both`
- `marker.mask.shape`: `auto` by default, with room for future explicit modes

This keeps the feature clearly tied to marker geometry rather than turning it into a general clipping API.

#### Primary owners

- `src/traces/scatter/plot.js`
- `src/components/drawing/index.js`
- `src/traces/scattergl/convert.js`
- `node_modules/regl-line2d/index.js`
- potentially `node_modules/regl-scatter2d/scatter.js` if mask geometry is implemented in GL

#### Implementation notes

- The API must be designed for `scatter` and `scattergl` from the start.
- `scatter` implementation uses per-trace SVG mask or clip-path defs generated from marker footprints, applied to line and fill layers.
- `scattergl` needs one of: stencil-style masking, alpha-mask passes, or CPU-side geometry splitting. The approach must be chosen before implementation begins because it influences the `scatter` API design.
- A `scatter`-only first implementation is acceptable only if the `scattergl` design and timeline are explicitly documented alongside it.

#### Risk

High. This is the most technically invasive gap.

### Phase 4: First-class trendlines

Priority: medium-high

Trendlines are a major configuration gap, but they can be added cleanly if modeled as derived companion traces rather than bespoke renderer code.

#### Features

- built-in trendline generation for scatter-family traces
- built-in label text and label placement
- support for the core Qlik regression families: average, linear, polynomial, exponential, logarithmic, power

#### Proposed Plotly API shape

Add a trace-level array container rather than a separate trace type:

- `trendlines[]`
- `trendlines[i].type`
- `trendlines[i].line.*`
- `trendlines[i].label.text`
- `trendlines[i].label.position`

This follows the existing `shapes[]` layout-level pattern more naturally than inventing a brand-new top-level trace. Note: do NOT use `transforms[]` as a reference here — that array in `src/transforms/` is a data-preprocessing pipeline (filter, sort, aggregate, groupby), not an overlay-rendering system. The `trendlines[]` array is purely a rendering/styling configuration, closer in spirit to `shapes[]`.

#### Primary owners

- `src/traces/scatter/attributes.js`
- `src/traces/scatter/defaults.js`
- `src/traces/scatter/calc.js` or a new shared helper under `src/components/`
- `src/traces/scatter/plot.js`
- `src/traces/scattergl/convert.js`

#### Implementation notes

- The calculation engine should be shared, renderer-agnostic, and reusable for SVG and GL.
- Start with generated companion line traces internally rather than adding new renderer primitives.

#### Risk

Medium. The math is manageable; the main cost is designing a clean public API and internal derived-trace lifecycle.

### Phase 5: Label background boxes and richer point labels

Priority: medium

#### Features

- per-point text background boxes
- padding and corner radius
- label blend mode parity with the trace text font blend work already in this branch

#### Proposed Plotly API shape

- `textfont.color` remains as-is
- add `textbgcolor`
- add `textbordercolor`
- add `textborderwidth`
- add `textpadding`
- add `textradius`

#### Primary owners

- `src/plots/font_attributes.js`
- `src/components/drawing/index.js`
- `src/traces/scatter/plot.js`
- `src/traces/scattergl/convert.js`
- `node_modules/gl-text/index.js`

#### Risk

Medium. SVG is straightforward; GL text boxes may need additional quad generation.

### Phase 6: Advanced point composition

Priority: medium

#### Features

- distinct inner and outer point style channels
- rounded-corner square support
- better parity for hollow and ring-like symbols

#### Proposed Plotly API shape

Extend `marker` rather than creating a second marker system:

- `marker.inner.color`
- `marker.inner.size`
- `marker.outer.color`
- `marker.outer.size`
- `marker.cornerradius`

#### Primary owners

- `src/traces/scatter/attributes.js`
- `src/components/drawing/index.js`
- `src/traces/scattergl/convert.js`
- symbol generation helpers in SVG and GL marker code

#### Risk

Medium to high. Useful, but not as foundational as stroke and masking work.

### Phase 7: Advanced error-bar statistics

Priority: medium-low

#### Features

- statistical generators beyond `percent`, `constant`, `sqrt`, and `data`
- confidence interval, standard deviation, standard error, variance, percentile, IQR, MAD, Poisson, and similar modes

#### Recommendation

Do not start here.

This is valuable for the Error Chart use case, but it is less universally reusable than the styling and masking work above. It also risks bloating trace calc logic before the rendering model is ready.

If this phase is taken on later, it should live in shared error-bar helpers under `src/components/errorbars/` and produce the same calc outputs as manual arrays.

## Recommended Sequence

### Track A: Fastest high-value wins

1. Shared stroke model in `scatter` and `scattergl` together (`scattergl` is the primary deliverable).
2. Error-bar style expansion in `scatter` and `scattergl` together.

These changes improve immediate compatibility while staying close to existing Plotly conventions.

### Track B: Hard renderer gap

1. `scatter` + `scattergl` masking design — choose the scattergl approach first since it constrains the SVG API.
2. `scatter` masking implementation as reference.
3. `scattergl` masking implementation in the same milestone, not as a follow-up.

Point masking should not be mixed into the same PR series as stroke-model work.

### Track C: Analytic helpers

1. Trendline API and derived-trace engine.
2. Label background boxes.
3. Advanced error-bar statistics if still needed after the other phases land.

## Suggested Milestones

### Milestone 1

- custom `line.dasharray` in `scatter` and `scattergl` (primary)
- `line.cap` in `scatter`, `scattergl`, and shapes
- richer error-bar dash and cap support in `scatter` and `scattergl`

This is the most practical first milestone for easier Error Chart config translation.

### Milestone 2

- Marker masking for `scatter` and `scattergl` lines and fills
- API stabilization for `marker.mask.*`
- A `scatter`-only staged delivery is acceptable only if the `scattergl` design and timeline are explicitly recorded alongside it

### Milestone 3

- trendlines as first-class scatter config
- text background boxes

## What Not To Start With

- navigator or viewport parity inside Plotly core
- Qlik-specific color transform and transition semantics
- full Qlik rendering virtualization model inside Plotly

Those areas are either wrapper-level concerns or much more invasive than the highest-value gaps.

## Immediate Next Step

Start with a Plotly-core design pass for Phase 1 and write a concrete attribute proposal covering `line.dasharray`, `line.cap`, and matching error-bar fields, including SVG and `scattergl` ownership boundaries.