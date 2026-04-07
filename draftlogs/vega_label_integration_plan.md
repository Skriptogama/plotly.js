# Vega-Inspired Label Placement Plan

## Goal

Add collision-aware label placement for cartesian `scatter` and `scattergl` that is modeled after Vega's `label` transform:

- ordered anchor and offset candidates
- optional avoidance of the base mark
- optional avoidance of other mark types
- greedy placement in pixel space
- renderer-agnostic placement output consumed by both SVG and WebGL text paths

Initial priority matches the current request:

1. avoid collisions with markers
2. avoid collisions with error bars
3. avoid collisions with lines
4. avoid label-label overlaps


## Current Plotly State

### SVG scatter

- Text placement is currently local and direct in `src/traces/scatter/plot.js`.
- Label position comes from `textposition` and is applied per point through `Drawing.textPointStyle()` and text/tspan transforms.
- There is no central placement engine and no collision pass.

### scattergl

- Text placement is assembled in `src/traces/scattergl/convert.js` and `src/traces/scattergl/calc.js`.
- `convertTextPosition()` converts `textposition` plus marker size into align, baseline, and offset inputs for `gl-text`.
- Marker-aware offsets already exist, which is useful for a future placement engine, but there is no obstacle pass.

### Implication

Plotly currently computes a single local placement per point. Vega-style behavior requires an additional placement layer that operates after label metrics and obstacle geometry are known, but before the final renderer-specific text draw/update step.


## Proposed User API

Keep the existing `textposition` semantics as the default and add an opt-in auto-placement mode.

### Minimal opt-in

Add `textposition: 'auto'` for `scatter` and `scattergl`.

This keeps the current mental model simple:

- explicit `textposition` keeps current fixed placement
- `textposition: 'auto'` activates the placement engine

### Advanced configuration

Add a new nested object, tentatively `textplacement`, for Vega-like controls:

```js
textposition: 'auto',
textplacement: {
    anchor: ['top', 'bottom', 'right', 'left', 'top right', 'top left'],
    offset: [6, 10],
    padding: 2,
    avoidBaseMark: true,
    avoid: {
        markers: true,
        errorbars: true,
        lines: true,
        text: true
    },
    sort: 'none',
    maxCandidates: 12
}
```

### Why this shape

- `anchor`, `offset`, and `avoidBaseMark` map directly to Vega concepts.
- `avoid` uses Plotly terms instead of Vega mark names, which avoids exposing implementation details like named marks.
- `textposition: 'auto'` is the smallest API addition that still allows future expansion.


## Internal Architecture

Add a renderer-independent label placement component under:

- `src/components/labels/`

Suggested modules:

- `defaults.js`
- `helpers.js`
- `candidates.js`
- `obstacles.js`
- `occupancy_bitmap.js`
- `place_labels.js`

### Core data flow

1. Renderer-specific calc/convert code produces base label records in pixel space.
2. Placement engine receives:
   - anchor point in pixels
   - label size in pixels
   - candidate anchor and offset list
   - plot viewport bounds
   - obstacle geometry
3. Placement engine returns:
   - chosen anchor
   - chosen offset
   - final pixel bbox
   - hidden or visible flag
4. Renderer-specific code maps this result back into:
   - SVG text/tspan transform and `text-anchor`
   - scattergl `align`, `baseline`, `offset`, and visibility data

This isolates the hard part of the problem from the SVG and WebGL backends.


## Placement Algorithm

Use a greedy candidate search first. That is the right starting point for Plotly because it matches Vega's behavior and keeps the implementation incremental-friendly.

### Candidate generation

For each label:

1. build ordered anchor list from `textplacement.anchor`
2. pair anchors with offsets from `textplacement.offset`
3. convert each anchor plus offset to a candidate bbox in pixel space

Candidate order should be stable and user-controlled. The first candidate that does not collide wins.

### Collision checks

Each candidate is rejected if:

- it leaves the plotting viewport
- it overlaps an occupied label region
- it overlaps enabled obstacle geometry
- it overlaps the base mark when `avoidBaseMark` is true

### Occupancy backend

Use a bitmap or coarse occupancy grid for phase 1, not pairwise bbox scans.

Reason:

- label-label overlap checks become the dominant cost as trace count grows
- line obstacles are much easier to represent in a raster occupancy map than as many segment distance checks
- the same occupancy representation works for scatter and scattergl

Suggested representation:

- one occupancy bitmap in plot pixel space
- configurable resolution, for example 1 cell per 2x2 or 4x4 screen pixels
- `markRect`, `markPolyline`, and `isFreeRect` helpers


## Obstacle Model

Obstacle generation should stay explicit by mark type.

### Markers

Represent each marker as a padded bbox or circle-derived bbox in pixel space.

Inputs already exist:

- SVG scatter: marker size from calcdata and marker style
- scattergl: marker size from converted marker options

### Error bars

Represent each error bar as one or more padded rectangles:

- vertical bar shaft
- horizontal bar shaft
- cap rectangles

The exact obstacle does not need path-perfect fidelity at first. A padded bbox approximation is acceptable for phase 1.

### Lines

For lines, use rasterized occupancy rather than geometric exactness.

Suggested approach:

- convert line paths to screen-space polylines
- stamp a stroke-width-expanded polyline into the occupancy bitmap

This is the most practical way to support:

- SVG scatter line shapes
- scattergl sampled smooth lines
- zoom and pan redraws

### Existing labels

Placed label bboxes are written into the same occupancy structure so later labels avoid earlier ones.


## Renderer Integration

### SVG scatter

Integration point:

- `src/traces/scatter/plot.js`

Plan:

1. compute text metrics after text content and font are known
2. build obstacle set for visible points in the subplot
3. run placement engine for labels in trace order or sorted order
4. apply chosen position to SVG text transforms instead of direct `textposition` placement

### scattergl

Integration points:

- `src/traces/scattergl/convert.js`
- `src/traces/scattergl/calc.js`
- possibly `src/traces/scattergl/plot.js` for viewport-driven refresh

Plan:

1. compute label metrics and candidate defaults in calc or convert
2. run placement in pixel space using current viewport
3. convert placement results back to `gl-text` inputs
4. on zoom, pan, resize, or autorange change, recompute placements because obstacle geometry moves in pixel space

Important:

- this should be treated like the existing smooth-line viewport refresh work
- placement must be viewport-keyed for scattergl, otherwise zoomed results will be stale


## Sorting and Priority

Vega exposes a sort order before placement. Plotly should support the same concept, but keep the first version simple.

### Phase 1 sort modes

- `none`: current trace/data order
- `y-desc`: prioritize upper labels first
- `marker-size-desc`: prioritize visually important points

Implementation detail:

- sorting should affect placement order only, not trace data order


## Incremental and Interactive Behavior

This feature must not regress `addTraces`, zoom, or rangeslider performance.

### Full redraw triggers

Recompute placements when any of the following changes:

- axis range or domain
- subplot size
- trace visibility
- marker size
- error bar visibility or style
- line width or shape
- text content or font

### Incremental append strategy

For `addTraces`:

- keep prior occupancy structures when only new traces are appended
- generate obstacles from new traces only
- place new labels against the accumulated occupancy map
- avoid recomputing earlier labels unless the viewport or prior geometry changed

This keeps the feature compatible with the incremental work already done for scattergl.

### Range slider

Do not enable label placement inside rangeslider scenes in phase 1.

Reason:

- navigator labels are low value
- they create a second placement problem on a tiny canvas
- skipping them reduces complexity and runtime immediately


## Rollout Plan

### Phase 1: point labels against markers and labels

Scope:

- `scatter` and `scattergl`
- `textposition: 'auto'`
- avoid markers and other labels
- viewport clipping
- occupancy bitmap backend

This gives the first usable feature with bounded complexity.

### Phase 2: error bars as obstacles

Scope:

- add error-bar shaft and cap obstacles
- both SVG and scattergl

This directly addresses the user's stated priority.

### Phase 3: line avoidance

Scope:

- rasterize line occupancy
- support straight and sampled smooth lines
- ensure scattergl recomputes on viewport changes

### Phase 4: line-level labels and Vega parity extras

Scope:

- `lineAnchor`-style behavior for one label per line or group
- `markIndex`-style support for grouped marks if needed
- sort modes beyond basic options

### Phase 5: performance refinement

Scope:

- dirty-region updates for incremental append
- obstacle cache invalidation by subplot and trace
- adaptive bitmap resolution


## Risks

### Text metrics consistency

SVG and WebGL text metrics differ. The placement engine must consume a normalized bbox abstraction, even if the measuring backend is different.

### Smooth lines in scattergl

Line avoidance must use the final sampled screen-space polyline, not raw data-space points.

### Dense charts

There will be cases where many labels cannot be placed. Hiding labels is expected behavior and should be explicit, not treated as failure.

### Selection styling

Selection and deselection should not rerun placement in phase 1 unless text size or obstacle geometry changes.


## Recommended First Implementation Slice

Build the smallest end-to-end slice in this order:

1. add `textposition: 'auto'` and `textplacement` defaults
2. implement a subplot-local placement engine using label-label and marker obstacles only
3. wire it into SVG scatter text placement
4. wire the same engine into scattergl text placement
5. add viewport-keyed recompute for scattergl
6. add error bars, then line obstacles

This sequence gives a real user-visible feature quickly while preserving a path to Vega-style behavior without committing Plotly to Vega's full internal model.