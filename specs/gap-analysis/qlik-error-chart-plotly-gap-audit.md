# Qlik Error Chart to Plotly.js Gap Audit

## Scope

This audit compares the feature contract exposed by the QlikSense extension in `refs/error-chart` against the Plotly.js capabilities in this repository. The emphasis is on the property model under `refs/error-chart/definition` and the rendering behavior under `refs/error-chart/rendering`, with specific focus on line patterns, advanced coloring, advanced points and point masks, error bars, trendlines, labels, axes, viewport behavior, and performance.

The goal is not to decide whether Plotly can render a similar chart at all. It can. The goal is to identify where Plotly already has native primitives, where an adapter layer can translate Qlik settings into Plotly traces/layout/shapes, and where Plotly still lacks first-class behavior needed for close parity with the existing extension.

## Executive Summary

Plotly.js can cover the baseline chart family cleanly: cartesian line and area series, markers, dual y-axes, axis styling, range sliders, text labels, hover templates, asymmetric error bars, SVG rendering, and scattergl acceleration. The recent blend-mode work in this branch also improves parity for SVG and scattergl styling.

The main gaps are not basic charting. They are in the extension-specific semantics that the current Qlik chart relies on:

- statistical error-bar generation modes are much richer in the Qlik extension than in Plotly
- trendlines are first-class in the Qlik extension but not in Plotly core
- point masking and clip-exclusion behavior around markers is custom in the Qlik renderer and has no direct Plotly equivalent
- per-side and per-layer styling for errors, labels, and advanced color transforms is materially richer in the Qlik extension
- viewport and navigator behavior in the Qlik extension is closer to a custom virtualized chart surface than to Plotly's built-in rangeslider model
- Qlik's attribute-expression model provides many per-point style channels that do not map 1:1 to Plotly attributes

If the objective is integration, not exact renderer parity, the shortest viable path is an adapter that preprocesses Qlik layout data into Plotly traces plus helper traces and shapes. If the objective is parity with the current extension, Plotly still needs product work in trendlines, error-bar semantics, and point-mask style rendering.

## Source Anchors Reviewed

### Qlik extension surface

- `refs/error-chart/error-chart.js`
- `refs/error-chart/definition/definition.js`
- `refs/error-chart/definition/initial.js`
- `refs/error-chart/definition/defaults-manager.js`
- `refs/error-chart/definition/data/measures/tabs/tab-graph.js`
- `refs/error-chart/definition/data/measures/tabs/tab-error.js`
- `refs/error-chart/definition/data/measures/tabs/tab-points.js`
- `refs/error-chart/definition/data/measures/tabs/tab-trendlines.js`
- `refs/error-chart/lib/attribute-expression-indices.js`
- `refs/error-chart/lib/data-manager.js`
- `refs/error-chart/rendering/components/chart/chart-layout.js`
- `refs/error-chart/rendering/components/plot-area/plot-area-renderer.js`
- `refs/error-chart/rendering/components/series/series-renderer.js`
- `refs/error-chart/rendering/components/series/renderers/line-area.js`
- `refs/error-chart/rendering/components/series/renderers/point.js`
- `refs/error-chart/rendering/components/series/renderers/error-bar.js`
- `refs/error-chart/rendering/components/series/renderers/trendline.js`

### Plotly capability anchors

- `src/traces/scatter/attributes.js`
- `src/traces/scatter/defaults.js`
- `src/traces/scatter/marker_defaults.js`
- `src/traces/scatter/plot.js`
- `src/components/drawing/index.js`
- `src/components/errorbars/attributes.js`
- `src/components/errorbars/defaults.js`
- `src/components/errorbars/style.js`
- `src/plots/cartesian/layout_attributes.js`
- `src/plots/cartesian/axes.js`
- `src/plots/cartesian/line_grid_defaults.js`
- `src/plots/font_attributes.js`
- `src/plots/attributes.js`
- `src/components/shapes/attributes.js`
- `src/plot_api/plot_api.js`

## How The Qlik Extension Actually Works

The extension is not just a styled scatter plot. It is a custom charting surface with its own feature system.

- `definition/defaults-manager.js` defines a large contract for measure graph modes, points, labels, errors, trendlines, tooltips, axes, viewport, optimization, and presentation.
- `lib/attribute-expression-indices.js` exposes many per-point style channels through Qlik attribute expressions, including line color, area color, point outer and inner styling, error values, error colors, label styling, and tooltip templates.
- `lib/data-manager.js` normalizes Qlik hypercube data into render-ready structures, including per-measure settings, alternative dimensions/measures, dimension2 color stability, and axis settings.
- `rendering/components/plot-area/plot-area-renderer.js` orchestrates D3 scales together with canvas layers, optional WebGL scenes, worker rendering, tiling, reference lines, and progressive updates.
- `rendering/components/series/renderers/*.js` implement custom canvas drawing for line/area, points, error bars, and trendlines rather than relying on declarative SVG primitives.

That matters because many of the extension's features are renderer behaviors, not just configuration flags.

## Capability Matrix

### 1. Base series geometry

Qlik expectation:

- line and area series
- multiple curve modes including `linear`, `cardinal`, `catmull-rom`, `monotone`, `natural`, and step-like behavior
- dual-axis assignment per measure

Plotly status: mostly native

- `src/traces/scatter/attributes.js` already supports line and filled scatter series.
- The `line.shape` attribute supports `linear`, `spline`, `hv`, `vh`, `hvh`, `vhv`, `cardinal`, `catmull-rom`, `monotone`, and `natural`.
- Dual-axis cartesian composition is already a standard Plotly pattern using `xaxis`, `yaxis`, and secondary axes in layout.

Gap assessment:

- The base graph family maps well.
- The main missing piece is not series type but the richer renderer behavior around masks, transitions, and viewport virtualization.

Migration note:

- Most Qlik measures of type line or area can become Plotly scatter traces directly.

### 2. Line patterns and stroke styling

Qlik expectation:

- predefined and custom dash patterns
- custom gap sizing
- stroke cap control
- styling applied consistently to regular lines, trendlines, and error bars

Plotly status: partial

- Plotly line dashing exists for cartesian lines and layout grid lines.
- `src/plots/cartesian/layout_attributes.js` and `src/plots/cartesian/axes.js` support dashed grid styling via `griddash`.
- Scatter and shape lines support dash styling.
- This branch also adds blend-mode styling across more SVG surfaces.

True gaps:

- Plotly does not expose the same first-class stroke-cap controls that the Qlik extension uses.
- Plotly error bars do not expose dash or cap styling beyond thickness and width. In `src/components/errorbars/attributes.js`, the model is limited to type, symmetry, arrays, color, thickness, width, and blend mode.
- Qlik's custom dash parsing for error bars and trendlines has no direct Plotly equivalent.

Migration note:

- Regular line pattern translation is feasible.
- Exact error whisker pattern parity would require custom helper traces or shapes.

### 3. Advanced coloring and compositing

Qlik expectation:

- auto and custom colors for lines, areas, bars, points, labels, and errors
- separate opacity and blending fields on many visual layers
- transform and transition fields in the property model
- dimension2 and master-dimension color management through the data manager

Plotly status: partial to strong, depending on the layer

- Plotly has mature color support for traces, markers, fills, colorscales, and per-point marker colors.
- Scatter fill gradients are present in `src/traces/scatter/attributes.js` and applied in `src/components/drawing/index.js`.
- Marker patterns exist for bar and pie-like traces through drawing components, but not as a general scatter-point masking system.
- Blend modes now exist in shared plot attributes, font attributes, error bars, and the touched SVG/scattergl trace families.

True gaps:

- The Qlik extension treats blending as one part of a broader color pipeline that also includes transform and transition modes. Plotly does not have an equivalent color-transform model.
- The extension exposes more independently styleable layers than Plotly does, especially for positive and negative error whiskers and label backgrounds.
- The Qlik data manager's color stability and dimension-driven palette semantics are adapter concerns, not native Plotly concepts.

Migration note:

- Most color fields can be mapped.
- Transform and transition semantics would need to be dropped, approximated externally, or added to Plotly as new behavior.

### 4. Advanced points

Qlik expectation:

- point shapes including circle, square, triangle, and star
- rounded corner control
- hollow points
- separate outer and inner size/color concepts
- per-point rotation
- margin handling and custom geometry rendering

Plotly status: partial

- Scatter markers already support many symbols, per-point size, per-point color, and angle. `src/traces/scatter/marker_defaults.js` and `src/traces/scatter/arrays_to_calcdata.js` show direct support for `marker.symbol` and `marker.angle` arrays.
- Open marker symbols can approximate hollow points.
- Marker line styling can approximate an outer border around a filled point.

True gaps:

- Plotly does not expose separate inner and outer marker layers as first-class properties.
- Rounded-corner square markers are not parameterized the way the Qlik renderer expects.
- The Qlik renderer draws marker geometry directly on canvas, so it can express combinations of outer shape, inner fill, and corner rounding that Plotly cannot declare natively.

Migration note:

- Simple point styling maps.
- Full parity for point inner and outer composition would require either symbol-library expansion, layered traces, or custom drawing support.

### 5. Point masks and clip exclusion

Qlik expectation:

- points can act as masks or clip exclusions so lines and areas visually break around the point geometry
- masking is part of the renderer, not just a z-order trick

Plotly status: missing as a native feature

- Plotly has `cliponaxis` in scatter and related traces, but that controls clipping to subplot bounds, not masking around marker geometry.
- `src/traces/scatter/plot.js` uses `cliponaxis` to decide whether point groups are clipped against the subplot clip path.

True gaps:

- Plotly has no native concept of marker-driven exclusion masks that punch holes in a line or area.
- This is a renderer-level difference between the two systems.

Migration note:

- This is one of the clearest parity gaps.
- Approximation is possible by drawing markers above the line or splitting traces, but the result is not the same as geometric masking.

### 6. Error bars and statistical error modes

Qlik expectation:

- built-in statistical modes such as confidence interval, standard deviation, standard error, variance, square-root variance, percentile, min-max, MAD, IQR, bootstrap confidence interval, jackknife standard error, Poisson, binomial proportion, log-normal confidence interval, middle-percent range, and custom expressions
- separate positive and negative values and styling
- separate colors, opacity, blending, transforms, line styles, widths, and caps
- offsets and orientation-specific rendering

Plotly status: partial

- Plotly has native asymmetric error bars.
- In `src/components/errorbars/attributes.js`, supported generation types are only `percent`, `constant`, `sqrt`, and `data`.
- Plotly supports `array` and `arrayminus`, symmetry flags, color, thickness, width, and now blend mode.

True gaps:

- The Qlik extension includes a statistics engine; Plotly expects already computed values.
- Plotly does not have built-in error calculation modes beyond the four basic generation modes.
- Plotly does not provide separate positive and negative styling objects for error bars.
- Plotly does not expose the Qlik error transform model or patterned whisker lines.

Migration note:

- If the statistical formulas are computed in an adapter before trace creation, the rendering gap becomes smaller but still remains for independent positive and negative styling.
- Exact parity would likely require extending Plotly's error-bar attribute model.

### 7. Trendlines

Qlik expectation:

- first-class trendlines per measure
- supported types include average, linear, polynomial 2 to 4, exponential, logarithmic, and power
- custom line styling, blend mode, and label placement along the line angle

Plotly status: missing as a core feature

- There is no real built-in trendline trace or trendline engine in Plotly core source.
- Plotly can display a regression line if external code computes the regression and adds another trace.
- Labels can be approximated with annotations or text traces, but they are not native trendline labels.

True gaps:

- no built-in regression calculations in Plotly core
- no first-class trendline attribute model on traces
- no native trendline label placement equivalent to the Qlik renderer

Migration note:

- This is the other major feature gap after error semantics and point masks.
- A wrapper can precompute trendlines and inject companion traces, but that is an adapter strategy, not feature parity.

### 8. Labels, text backgrounds, and tooltips

Qlik expectation:

- per-point label text and styling
- label color and background channels via attribute expressions
- rich tooltip templates
- label layers integrated with the custom series state manager

Plotly status: partial

- Plotly has `text`, `texttemplate`, `hovertext`, and `hovertemplate` across scatter-family traces.
- Plotly also supports text positioning and some auto text-position logic in scatter.
- Font-level blend modes now exist in this branch through shared font attributes.

True gaps:

- Per-point label background styling is not a first-class scatter text feature.
- Qlik's label pipeline is richer because label background, label foreground, and tooltip template each have their own expression channels.
- Plotly labels are declarative text attached to traces or annotations, not a custom rendered label layer with the same control surface.

Migration note:

- Hover templates map well.
- Label background parity would need annotations, HTML overlays, or new Plotly label-box support.

### 9. Axes, grid styling, and axis labeling

Qlik expectation:

- configurable x, y1, and y2 axes
- custom viewport and scroll behavior
- dashed grids and rich labeling behavior

Plotly status: strong for axis styling, partial for viewport behavior

- Plotly supports multiple cartesian axes and secondary axis layouts.
- Axis grid dash is natively supported through cartesian layout attributes.
- Axis `labelalias` is present in `src/plots/cartesian/layout_attributes.js` and applied in `src/plots/cartesian/axes.js`.

True gaps:

- The Qlik extension's viewport system is more than axis ranges. It includes scroll modes, wheel speed, initial position, and navigator-level behavior coordinated by `chart-layout.js` and `plot-area-renderer.js`.
- Plotly's rangeslider is useful, but it is not a full replacement for the extension's chart-surface viewport contract.

Migration note:

- Static axis configuration maps well.
- Interactive viewport semantics would need custom wrapper behavior around Plotly relayout calls.

### 10. Navigator and scrolling behavior

Qlik expectation:

- dedicated navigator component
- wheel-driven scrolling
- configurable viewport percentages and fixed windows
- render coordination with progressive and virtualized drawing

Plotly status: partial

- Plotly supports x-axis rangesliders and range updates.
- `src/core.js` and `src/plot_api/plot_api.js` show native rangeslider lifecycle support.

True gaps:

- Plotly does not provide a general navigator abstraction with the same contract as the Qlik extension.
- There is no built-in equivalent to the extension's viewport mode system or wheel-speed behavior.

Migration note:

- A custom UI wrapper could drive Plotly ranges, but exact behavior would live outside Plotly core.

### 11. Reference lines and additional overlays

Qlik expectation:

- reference-line support integrated with the plot-area renderer
- overlay behavior coordinated with line, point, error, and trendline layers

Plotly status: mostly native

- Plotly layout shapes already support lines, rectangles, circles, and custom paths in `src/components/shapes/attributes.js`.
- Shapes support layer placement and labeled overlays.

Gap assessment:

- Plotly shapes can cover most reference-line needs.
- The remaining difference is integration with the extension's viewport and scene orchestration, not missing primitives.

### 12. Performance model and renderer architecture

Qlik expectation:

- canvas-first custom rendering
- optional WebGL scenes
- worker rendering
- tiling and progressive rendering
- explicit renderer compatibility checks for different layer types

Plotly status: partial

- Plotly has SVG and WebGL trace families, including scattergl.
- Plotly can handle large point clouds with scattergl, but it does not expose the same tile, worker, and scene-compatibility architecture as the Qlik extension.

True gaps:

- no general canvas renderer contract for these series in core Plotly
- no equivalent to the extension's tiling and worker pipeline for mixed chart layers
- no shared progressive rendering model spanning lines, points, trendlines, reference lines, and labels

Migration note:

- For many real datasets, Plotly plus scattergl may still be sufficient.
- If parity with the extension's rendering pipeline is required for very large or highly interactive datasets, this is a non-trivial product gap.

## What Maps Cleanly To Plotly Right Now

- line and area charts
- most curve shapes used by the extension
- dual y-axes
- standard marker symbols, colors, sizes, and rotation
- basic hollow-marker approximations
- hover templates and text templates
- asymmetric error values once precomputed externally
- axis grid dash and label aliasing
- reference lines using layout shapes
- x-axis navigator approximations using rangeslider
- SVG and scattergl blend modes from the current branch work

## What Needs An Adapter Layer But Not Core Plotly Changes

- translating Qlik hypercube data and attribute expressions into Plotly trace arrays
- computing advanced statistical error values before constructing traces
- computing trendline regressions before constructing helper traces
- mapping dimension2 color semantics into stable Plotly color assignment
- emulating navigator behavior with external controls and Plotly relayout
- approximating label boxes and advanced overlays with annotations or HTML layers

## What Looks Like Real Plotly Product Gaps

- first-class trendline support in core traces
- first-class advanced error models beyond `percent`, `constant`, `sqrt`, and `data`
- independent positive and negative error styling
- marker-driven line and area masking semantics
- richer point geometry composition with inner and outer style channels
- label background boxes on trace text with per-point styling
- broader color transform and transition semantics comparable to the Qlik property model
- richer viewport and navigator primitives if exact extension behavior is required

## Prioritized Gap Severity

### High severity

- trendlines
- advanced error-bar semantics
- point-mask and clip-exclusion rendering

These features are first-class in the Qlik extension and are not first-class in Plotly.

### Medium severity

- advanced point inner and outer composition
- per-layer label background styling
- navigator and viewport behavior beyond a simple rangeslider
- error whisker dash and stroke-cap parity

These can be approximated, but not reproduced exactly with current Plotly primitives.

### Low severity

- base line and area rendering
- multi-axis composition
- grid dash and label aliasing
- generic color mapping
- standard marker rotation and symbol selection

These map well already.

## Recommended Integration Strategy

### Option 1: Adapter-first integration

Use Plotly as the rendering engine for the subset it already handles well and move extension-specific semantics into a preprocessing layer.

- Convert Qlik measure definitions into Plotly traces.
- Precompute statistical error outputs and trendline series outside Plotly.
- Use helper traces and layout shapes for overlays.
- Accept that point masks and some label-box behavior will be approximate.

This is the fastest route to a usable integration.

### Option 2: Partial Plotly extension work

Add targeted Plotly capabilities needed for closer parity.

- extend error-bar attributes with richer styling and optional more advanced generators
- add a first-class trendline helper model or trace-level trendline definition
- add marker masking or exclusion behavior for scatter lines and fills

This is the best route if the extension's advanced styling is important to the product.

### Option 3: Full parity pursuit

Treat the Qlik extension as a custom rendering platform and replicate more of that platform inside or adjacent to Plotly.

- custom label-box layer
- custom navigator behavior
- custom progressive rendering pipeline
- renderer-level mask semantics

This is likely too expensive unless parity with the existing Qlik renderer is a hard requirement.

## Bottom Line

Plotly.js is a strong fit for the extension's baseline charting needs, and this branch already narrows the styling gap further through new blend-mode support. The remaining differences are concentrated in three areas: computed analytics features, renderer-specific masking and composition, and viewport or performance behavior that the current Qlik chart owns itself.

If the target is a pragmatic migration, Plotly can replace much of the current chart with an adapter layer. If the target is feature parity with the current Qlik extension, Plotly still has meaningful gaps around trendlines, statistical error handling, and point-mask rendering.