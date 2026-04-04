'use strict';

var createScatter = require('regl-scatter2d');
var createLine = require('regl-line2d');
var createError = require('regl-error2d');
var Text = require('gl-text');
var createRegl = require('@plotly/regl');

var Lib = require('../../lib');
var selectMode = require('../../components/dragelement/helpers').selectMode;
var prepareRegl = require('../../lib/prepare_regl');

var subTypes = require('../scatter/subtypes');
var linkTraces = require('../scatter/link_traces');
var convert = require('./convert');
var sceneUpdate = require('./scene_update');

var styleTextSelection = require('./edit_style').styleTextSelection;

var reglPrecompiled = {};

function getViewport(fullLayout, xaxis, yaxis, plotGlPixelRatio) {
    var gs = fullLayout._size;
    var width = fullLayout.width * plotGlPixelRatio;
    var height = fullLayout.height * plotGlPixelRatio;

    var l = gs.l * plotGlPixelRatio;
    var b = gs.b * plotGlPixelRatio;
    var r = gs.r * plotGlPixelRatio;
    var t = gs.t * plotGlPixelRatio;
    var w = gs.w * plotGlPixelRatio;
    var h = gs.h * plotGlPixelRatio;
    return [
        l + xaxis.domain[0] * w,
        b + yaxis.domain[0] * h,
        (width - r) - (1 - xaxis.domain[1]) * w,
        (height - t) - (1 - yaxis.domain[1]) * h
    ];
}

function getRangeViewport(subplot) {
    var canvas = subplot.rangeSliderCanvas;
    return [0, 0, canvas.width, canvas.height];
}

function sceneOptions(gd, trace, stash) {
    var opts = convert.style(gd, trace);
    var positions = stash.positions;

    if (opts.marker) {
        opts.marker.positions = positions;
    }

    if (opts.line && positions && positions.length > 1) {
        Lib.extendFlat(opts.line, convert.linePositions(gd, trace, positions));
    }

    if (opts.errorX || opts.errorY) {
        var errors = convert.errorBarPositions(gd, trace, positions, stash.x, stash.y);

        if (opts.errorX) {
            Lib.extendFlat(opts.errorX, errors.x);
        }
        if (opts.errorY) {
            Lib.extendFlat(opts.errorY, errors.y);
        }
    }

    return opts;
}

function prepareRangeScene(gd, subplot, cdata) {
    var fullLayout = gd._fullLayout;
    var rangeScenes = fullLayout._rangePlotScenes || (fullLayout._rangePlotScenes = {});
    var storedScene = rangeScenes[subplot.id] || null;

    if (storedScene && storedScene._rangeSliderCanvas && storedScene._rangeSliderCanvas !== subplot.rangeSliderCanvas) {
        if (storedScene.destroy) storedScene.destroy();
        storedScene = null;
    }

    subplot._scene = storedScene;

    var scene = sceneUpdate(gd, subplot);
    scene._rangeSliderCanvas = subplot.rangeSliderCanvas;
    rangeScenes[subplot.id] = scene;

    for (var i = 0; i < cdata.length; i++) {
        var cdscatter = cdata[i];
        var cd0 = cdscatter && cdscatter[0];
        var trace = cd0 && cd0.trace;
        var stash = cd0 && cd0.t;

        if (!trace || !stash || trace.visible !== true) continue;

        var opts = sceneOptions(gd, trace, stash);
        opts.text = undefined;
        opts.textSel = undefined;
        opts.textUnsel = undefined;

        if (opts.fill && !scene.fill2d) scene.fill2d = true;
        if (opts.marker && !scene.scatter2d) scene.scatter2d = true;
        if (opts.line && !scene.line2d) scene.line2d = true;
        if ((opts.errorX || opts.errorY) && !scene.error2d) scene.error2d = true;
        if (opts.text && !scene.glText) scene.glText = true;

        scene.lineOptions.push(opts.line);
        scene.errorXOptions.push(opts.errorX);
        scene.errorYOptions.push(opts.errorY);
        scene.fillOptions.push(opts.fill);
        scene.markerOptions.push(opts.marker);
        scene.markerSelectedOptions.push(opts.markerSel);
        scene.markerUnselectedOptions.push(opts.markerUnsel);
        scene.textOptions.push(opts.text);
        scene.textSelectedOptions.push(opts.textSel);
        scene.textUnselectedOptions.push(opts.textUnsel);
        scene.linePositionSources.push(opts.line ? {
            positions: stash.positions,
            trace: trace,
            viewportKey: hasSmoothLineShape(trace) ? makeViewportKey(gd, trace) : null
        } : null);
        scene.selectBatch.push([]);
        scene.unselectBatch.push([]);
        scene.count++;
    }

    return scene;
}

function prepareRangeRegl(gd, subplot) {
    var canvas = subplot.rangeSliderCanvas;
    if (!canvas) return null;

    if (canvas._regl) {
        canvas._regl.preloadCachedCode(reglPrecompiled);
        return canvas._regl;
    }

    try {
        canvas._regl = createRegl({
            canvas: canvas,
            attributes: {
                antialias: true,
                preserveDrawingBuffer: true
            },
            pixelRatio: gd._context.plotGlPixelRatio || global.devicePixelRatio,
            extensions: ['ANGLE_instanced_arrays', 'OES_element_index_uint'],
            cachedCode: reglPrecompiled || {}
        });
    } catch (e) {
        return null;
    }

    return canvas._regl;
}

function trimLinePositions(lineOptions) {
    if (!(lineOptions && lineOptions.positions)) return lineOptions;

    var srcPos = lineOptions.positions;
    var firstptdef = 0;
    while (firstptdef < srcPos.length && (isNaN(srcPos[firstptdef]) || isNaN(srcPos[firstptdef + 1]))) {
        firstptdef += 2;
    }

    var lastptdef = srcPos.length - 2;
    while (lastptdef > firstptdef && (isNaN(srcPos[lastptdef]) || isNaN(srcPos[lastptdef + 1]))) {
        lastptdef -= 2;
    }

    lineOptions.positions = srcPos.slice(firstptdef, lastptdef + 2);
    return lineOptions;
}

function hasSmoothLineShape(trace) {
    var shape = trace && trace.line && trace.line.shape;

    return shape === 'spline' || shape === 'cardinal' ||
        shape === 'catmull-rom' || shape === 'monotone' ||
        shape === 'natural';
}

function makeViewportKey(gd, trace) {
    var fullLayout = gd && gd._fullLayout;
    var xa = trace && trace._xA;
    var ya = trace && trace._yA;

    if (!fullLayout || !xa || !ya) return '';

    return [
        fullLayout.width,
        fullLayout.height,
        gd._context.plotGlPixelRatio,
        xa.domain[0],
        xa.domain[1],
        ya.domain[0],
        ya.domain[1],
        (xa._rl || xa.range)[0],
        (xa._rl || xa.range)[1],
        (ya._rl || ya.range)[0],
        (ya._rl || ya.range)[1]
    ].join('|');
}

function refreshSmoothLineBuffers(gd, scene) {
    var sources = scene.linePositionSources;
    var line2d = scene.line2d;
    var updateBatch;
    var didUpdate = false;

    if (!line2d || !sources || !sources.length) return;

    for (var i = 0; i < sources.length; i++) {
        var source = sources[i];
        if (!source) continue;

        var trace = source.trace;
        if (!trace || trace.visible !== true || !hasSmoothLineShape(trace)) continue;

        var viewportKey = makeViewportKey(gd, trace);
        if (viewportKey === source.viewportKey) continue;

        source.viewportKey = viewportKey;

        if (!scene.lineOptions[i]) continue;

        scene.lineOptions[i].positions = convert.linePositions(gd, trace, source.positions).positions;
        trimLinePositions(scene.lineOptions[i]);

        if (!updateBatch) updateBatch = new Array(scene.count);
        updateBatch[i] = scene.lineOptions[i];
        didUpdate = true;
    }

    if (didUpdate) {
        line2d.update(updateBatch);
    }
}

function makeIncrementalUpdateBatch(options, startIndex, count) {
    var batch = new Array(count);
    var i;

    for (i = 0; i < startIndex; i++) {
        batch[i] = undefined;
    }

    for (i = startIndex; i < count; i++) {
        batch[i] = options[i];
    }

    return batch;
}

function makeIncrementalErrorBatch(errorXOptions, errorYOptions, startIndex, count) {
    var batch = new Array(count * 2);
    var i;

    for (i = 0; i < count; i++) {
        if (i < startIndex) {
            batch[i] = undefined;
            batch[i + count] = undefined;
        } else {
            batch[i] = errorXOptions[i];
            batch[i + count] = errorYOptions[i];
        }
    }

    return batch;
}

var exports = module.exports = function plot(gd, subplot, cdata) {
    if (!cdata.length) return;

    var fullLayout = gd._fullLayout;
    var scene = subplot.isRangePlot ? prepareRangeScene(gd, subplot, cdata) : subplot._scene;
    var xaxis = subplot.xaxis;
    var yaxis = subplot.yaxis;
    var i, j;

    // we may have more subplots than initialized data due to Axes.getSubplots method
    if (!scene) return;

    scene.refresh = function refresh() {
        refreshSmoothLineBuffers(gd, scene);
    };

    var count = scene.count;
    var regl;

    if (subplot.isRangePlot) {
        regl = prepareRangeRegl(gd, subplot);
        if (!regl) return;
        regl.clear({ color: [0, 0, 0, 0], depth: 1 });
    } else {
        var success = prepareRegl(gd, ['ANGLE_instanced_arrays', 'OES_element_index_uint'], reglPrecompiled);
        if (!success) {
            scene.init();
            return;
        }
        regl = fullLayout._glcanvas.data()[0].regl;
    }

    // that is needed for fills
    linkTraces(gd, subplot, cdata);

    if (scene.dirty) {
        var incrementalStart = scene._incrementalStartCount;
        var canIncrementallyUpload =
            incrementalStart !== null &&
            incrementalStart > 0 &&
            incrementalStart < count &&
            !scene.fill2d;

        if (
            !subplot.isRangePlot &&
            (scene.line2d || scene.error2d) &&
            !(scene.scatter2d || scene.fill2d || scene.glText)
        ) {
            // Fixes shared WebGL context drawing lines only case
            regl.clear({ color: true, depth: true });
        }

        // make sure scenes are created
        if (scene.error2d === true) {
            scene.error2d = createError(regl);
        }
        if (scene.line2d === true) {
            scene.line2d = createLine(regl);
        }
        if (scene.scatter2d === true) {
            scene.scatter2d = createScatter(regl);
        }
        if (scene.fill2d === true) {
            scene.fill2d = createLine(regl);
        }
        if (scene.glText === true) {
            scene.glText = new Array(count);
            for (i = 0; i < count; i++) {
                scene.glText[i] = new Text(regl);
            }
        }

        // update main marker options
        if (scene.glText) {
            if (count > scene.glText.length) {
                // add gl text marker
                var textsToAdd = count - scene.glText.length;
                for (i = 0; i < textsToAdd; i++) {
                    scene.glText.push(new Text(regl));
                }
            } else if (count < scene.glText.length) {
                // remove gl text marker
                var textsToRemove = scene.glText.length - count;
                var removedTexts = scene.glText.splice(count, textsToRemove);
                removedTexts.forEach(function (text) { text.destroy(); });
            }

            var textStart = canIncrementallyUpload ? incrementalStart : 0;
            for (i = textStart; i < count; i++) {
                scene.glText[i].update(scene.textOptions[i]);
            }
        }
        if (scene.line2d) {
            if (canIncrementallyUpload) {
                var lineUpdateBatch = makeIncrementalUpdateBatch(scene.lineOptions, incrementalStart, count);
                scene.line2d.update(lineUpdateBatch);

                for (i = incrementalStart; i < count; i++) {
                    lineUpdateBatch[i] = trimLinePositions(scene.lineOptions[i]);
                }

                scene.line2d.update(lineUpdateBatch);
            } else {
                scene.line2d.update(scene.lineOptions);
                scene.lineOptions = scene.lineOptions.map(trimLinePositions);
                scene.line2d.update(scene.lineOptions);
            }
        }
        if (scene.error2d) {
            var errorBatch = canIncrementallyUpload ?
                makeIncrementalErrorBatch(scene.errorXOptions || [], scene.errorYOptions || [], incrementalStart, count) :
                (scene.errorXOptions || []).concat(scene.errorYOptions || []);
            scene.error2d.update(errorBatch);
        }
        if (scene.scatter2d) {
            scene.scatter2d.update(canIncrementallyUpload ?
                makeIncrementalUpdateBatch(scene.markerOptions, incrementalStart, count) :
                scene.markerOptions);
        }

        // fill requires linked traces, so we generate it's positions here
        scene.fillOrder = Lib.repeat(null, count);
        if (scene.fill2d) {
            scene.fillOptions = scene.fillOptions.map(function (fillOptions, i) {
                var cdscatter = cdata[i];
                if (!fillOptions || !cdscatter || !cdscatter[0] || !cdscatter[0].trace) return;
                var cd = cdscatter[0];
                var trace = cd.trace;
                var stash = cd.t;
                var lineOptions = scene.lineOptions[i];
                var last, j;

                var fillData = [];
                if (trace._ownfill) fillData.push(i);
                if (trace._nexttrace) fillData.push(i + 1);
                if (fillData.length) scene.fillOrder[i] = fillData;

                var pos = [];
                var srcPos = (lineOptions && lineOptions.positions) || stash.positions;
                var firstptdef, lastptdef;

                if (trace.fill === 'tozeroy') {
                    firstptdef = 0;
                    while (firstptdef < srcPos.length && isNaN(srcPos[firstptdef + 1])) {
                        firstptdef += 2;
                    }
                    lastptdef = srcPos.length - 2;
                    while (lastptdef > firstptdef && isNaN(srcPos[lastptdef + 1])) {
                        lastptdef -= 2;
                    }
                    if (srcPos[firstptdef + 1] !== 0) {
                        pos = [srcPos[firstptdef], 0];
                    }
                    pos = pos.concat(srcPos.slice(firstptdef, lastptdef + 2));
                    if (srcPos[lastptdef + 1] !== 0) {
                        pos = pos.concat([srcPos[lastptdef], 0]);
                    }
                } else if (trace.fill === 'tozerox') {
                    firstptdef = 0;
                    while (firstptdef < srcPos.length && isNaN(srcPos[firstptdef])) {
                        firstptdef += 2;
                    }
                    lastptdef = srcPos.length - 2;
                    while (lastptdef > firstptdef && isNaN(srcPos[lastptdef])) {
                        lastptdef -= 2;
                    }
                    if (srcPos[firstptdef] !== 0) {
                        pos = [0, srcPos[firstptdef + 1]];
                    }
                    pos = pos.concat(srcPos.slice(firstptdef, lastptdef + 2));
                    if (srcPos[lastptdef] !== 0) {
                        pos = pos.concat([0, srcPos[lastptdef + 1]]);
                    }
                } else if (trace.fill === 'toself' || trace.fill === 'tonext') {
                    pos = [];
                    last = 0;

                    fillOptions.splitNull = true;

                    for (j = 0; j < srcPos.length; j += 2) {
                        if (isNaN(srcPos[j]) || isNaN(srcPos[j + 1])) {
                            pos = pos.concat(srcPos.slice(last, j));
                            pos.push(srcPos[last], srcPos[last + 1]);
                            pos.push(null, null); // keep null to mark end of polygon
                            last = j + 2;
                        }
                    }
                    pos = pos.concat(srcPos.slice(last));
                    if (last) {
                        pos.push(srcPos[last], srcPos[last + 1]);
                    }
                } else {
                    var nextTrace = trace._nexttrace;

                    if (nextTrace) {
                        var nextOptions = scene.lineOptions[i + 1];

                        if (nextOptions) {
                            var nextPos = nextOptions.positions;
                            if (trace.fill === 'tonexty') {
                                pos = srcPos.slice();

                                for (i = Math.floor(nextPos.length / 2); i--;) {
                                    var xx = nextPos[i * 2];
                                    var yy = nextPos[i * 2 + 1];
                                    if (isNaN(xx) || isNaN(yy)) continue;
                                    pos.push(xx, yy);
                                }
                                fillOptions.fill = nextTrace.fillcolor;
                            }
                        }
                    }
                }

                // detect prev trace positions to exclude from current fill
                if (trace._prevtrace && trace._prevtrace.fill === 'tonext') {
                    var prevLinePos = scene.lineOptions[i - 1].positions;

                    // FIXME: likely this logic should be tested better
                    var offset = pos.length / 2;
                    last = offset;
                    var hole = [last];
                    for (j = 0; j < prevLinePos.length; j += 2) {
                        if (isNaN(prevLinePos[j]) || isNaN(prevLinePos[j + 1])) {
                            hole.push(j / 2 + offset + 1);
                            last = j + 2;
                        }
                    }

                    pos = pos.concat(prevLinePos);
                    fillOptions.hole = hole;
                }
                fillOptions.fillmode = trace.fill;
                fillOptions.opacity = trace.opacity;
                fillOptions.positions = pos;

                return fillOptions;
            });

            scene.fill2d.update(scene.fillOptions);
        }

        scene._incrementalStartCount = null;
    }

    // form batch arrays, and check for selected points
    var dragmode = fullLayout.dragmode;
    var isSelectMode = subplot.isRangePlot ? false : selectMode(dragmode);
    var clickSelectEnabled = subplot.isRangePlot ? false : fullLayout.clickmode.indexOf('select') > -1;

    for (const [cd0] of cdata) {
        if (!cd0) continue;
        var trace = cd0.trace;
        var stash = cd0.t;
        var index = stash.index;
        var len = trace._length;
        var x = stash.x;
        var y = stash.y;

        if (trace.selectedpoints || isSelectMode || clickSelectEnabled) {
            if (!isSelectMode) isSelectMode = true;

            // regenerate scene batch, if traces number changed during selection
            if (trace.selectedpoints) {
                var selPts = scene.selectBatch[index] = Lib.selIndices2selPoints(trace);

                var selDict = {};
                for (j = 0; j < selPts.length; j++) {
                    selDict[selPts[j]] = 1;
                }
                var unselPts = [];
                for (j = 0; j < len; j++) {
                    if (!selDict[j]) unselPts.push(j);
                }
                scene.unselectBatch[index] = unselPts;
            }

            // precalculate px coords since we are not going to pan during select
            // TODO, could do better here e.g.
            // - spin that in a webworker
            // - compute selection from polygons in data coordinates
            //   (maybe just for linear axes)
            var xpx = stash.xpx = new Array(len);
            var ypx = stash.ypx = new Array(len);
            for (j = 0; j < len; j++) {
                xpx[j] = xaxis.c2p(x[j]);
                ypx[j] = yaxis.c2p(y[j]);
            }
        } else {
            stash.xpx = stash.ypx = null;
        }
    }

    if (isSelectMode) {
        // create scatter instance by cloning scatter2d
        if (!scene.select2d) {
            scene.select2d = createScatter(fullLayout._glcanvas.data()[1].regl);
        }

        // use unselected styles on 'context' canvas
        if (scene.scatter2d) {
            var unselOpts = new Array(count);
            for (i = 0; i < count; i++) {
                unselOpts[i] = scene.selectBatch[i].length || scene.unselectBatch[i].length ?
                    scene.markerUnselectedOptions[i] :
                    {};
            }
            scene.scatter2d.update(unselOpts);
        }

        // use selected style on 'focus' canvas
        if (scene.select2d) {
            scene.select2d.update(scene.markerOptions);
            scene.select2d.update(scene.markerSelectedOptions);
        }

        if (scene.glText) {
            cdata.forEach(function (cdscatter) {
                var trace = ((cdscatter || [])[0] || {}).trace || {};
                if (subTypes.hasText(trace)) {
                    styleTextSelection(cdscatter);
                }
            });
        }
    } else {
        // reset 'context' scatter2d opts to base opts,
        // thus unsetting markerUnselectedOptions from selection
        if (scene.scatter2d) {
            scene.scatter2d.update(scene.markerOptions);
        }
    }

    // provide viewport and range
    var vpRange0 = {
        viewport: subplot.isRangePlot ?
            getRangeViewport(subplot) :
            getViewport(fullLayout, xaxis, yaxis, gd._context.plotGlPixelRatio),
        // TODO do we need those fallbacks?
        range: [
            (xaxis._rl || xaxis.range)[0],
            (yaxis._rl || yaxis.range)[0],
            (xaxis._rl || xaxis.range)[1],
            (yaxis._rl || yaxis.range)[1]
        ]
    };
    var vpRange = Lib.repeat(vpRange0, scene.count);

    // upload viewport/range data to GPU
    if (scene.fill2d) {
        scene.fill2d.update(vpRange);
    }
    if (scene.line2d) {
        scene.line2d.update(vpRange);
    }
    if (scene.error2d) {
        scene.error2d.update(vpRange.concat(vpRange));
    }
    if (scene.scatter2d) {
        scene.scatter2d.update(vpRange);
    }
    if (scene.select2d) {
        scene.select2d.update(vpRange);
    }
    if (scene.glText) {
        scene.glText.forEach(function (text) { text.update(vpRange0); });
    }

    if (subplot.isRangePlot) {
        scene.draw();
    }
};

exports.reglPrecompiled = reglPrecompiled;
