# Plotly Gap-Closure Roadmap For Error Chart Parity

## Goal

Close the highest-value feature gaps in Plotly.js itself so the Error Chart extension can be expressed mostly as normal Plotly trace and layout config, with as little Qlik-specific translation logic as possible.

This roadmap intentionally focuses on Plotly-core work, not on changing the current `refs/error-chart` implementation.

## Design Constraints

- follow the normal Plotly attribute pipeline: `attributes.js` -> `defaults.js` -> `calc/style/convert`
- prefer shared components when the behavior spans SVG and WebGL traces
- avoid adding Qlik-shaped config names directly to Plotly unless the concept is broadly reusable
- land new features first on cartesian scatter-family traces, then expand to related owners like shapes and error bars
- keep SVG and `scattergl` behavior aligned whenever the feature is styling, not renderer-specific analytics

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

Keep the existing `line.dash` field for backwards compatibility, but expand the shared drawing model with reusable stroke attributes:

- `line.dash`: keep existing named values and raw dash strings working
- `line.dashmode`: `named` or `custom`
- `line.dasharray`: custom numeric pattern array or px list string
- `line.dashgap`: optional multiplier or explicit gap control for named patterns
- `line.cap`: `butt`, `square`, or `round`

For error bars, mirror the same pattern on `error_x` and `error_y` instead of inventing a separate styling vocabulary:

- `error_y.dash`
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

- SVG can support this first through `stroke-dasharray` and `stroke-linecap` with very little architectural risk.
- `scattergl` needs matching support in its conversion layer and likely in `node_modules/regl-line2d` for cap handling and for non-enumerated dash sequences.
- Error bars need both SVG styling changes and a `regl-error2d` extension if the same feature is expected in GL.

#### Risk

Low to medium for SVG. Medium for WebGL because dash and cap behavior touches external regl packages.

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

- SVG implementation should use per-trace mask or clip-path defs generated from marker footprints, then apply them to line and fill layers.
- `scattergl` likely needs either stencil-style masking, alpha-mask passes, or CPU-side geometry splitting. This is the hardest part of the whole plan.
- SVG-only first is acceptable as an incremental step, but the API should be designed with GL parity in mind.

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

This follows existing Plotly patterns like `transforms[]` and `shapes[]` more naturally than inventing a brand-new top-level trace.

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

1. Shared stroke model in SVG.
2. Shared stroke model in `scattergl`.
3. Error-bar style expansion in SVG and GL.

These changes improve immediate compatibility while staying close to existing Plotly conventions.

### Track B: Hard renderer gap

1. SVG point masking.
2. API review after SVG feedback.
3. `scattergl` masking design and prototype.

Point masking should not be mixed into the same PR series as stroke-model work.

### Track C: Analytic helpers

1. Trendline API and derived-trace engine.
2. Label background boxes.
3. Advanced error-bar statistics if still needed after the other phases land.

## Suggested Milestones

### Milestone 1

- custom dash arrays in `scattergl`
- shared `line.cap` in SVG scatter and shapes
- shared error-bar dash and cap support

This is the most practical first milestone for easier Error Chart config translation.

### Milestone 2

- SVG marker masking for scatter lines and fills
- API stabilization for `marker.mask.*`

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