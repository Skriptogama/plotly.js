'use strict';

var isNumeric = require('fast-isnumeric');
var svgSdf = require('svg-path-sdf');
var rgba = require('color-normalize');
var parseSvgPath = require('parse-svg-path');

var Registry = require('../../registry');
var Lib = require('../../lib');
var isArrayOrTypedArray = Lib.isArrayOrTypedArray;
var Drawing = require('../../components/drawing');
var AxisIDs = require('../../plots/cartesian/axis_ids');

var formatColor = require('../../lib/gl_format_color').formatColor;
var subTypes = require('../scatter/subtypes');
var makeBubbleSizeFn = require('../scatter/make_bubble_size_func');

var helpers = require('./helpers');
var constants = require('./constants');
var DESELECTDIM = require('../../constants/interactions').DESELECTDIM;

var TEXTOFFSETSIGN = {
    start: 1,
    left: 1,
    end: -1,
    right: -1,
    middle: 0,
    center: 0,
    bottom: 1,
    top: -1
};

var appendArrayPointValue = require('../../components/fx/helpers').appendArrayPointValue;

var SMOOTH_LINE_TOLERANCE_PX = 0.5;
var MAX_BEZIER_SUBDIVISION_DEPTH = 10;

function convertStyle(gd, trace) {
    var i;

    var opts = {
        marker: undefined,
        markerSel: undefined,
        markerUnsel: undefined,
        line: undefined,
        fill: undefined,
        errorX: undefined,
        errorY: undefined,
        text: undefined,
        textSel: undefined,
        textUnsel: undefined
    };

    var plotGlPixelRatio = gd._context.plotGlPixelRatio;

    if (trace.visible !== true) return opts;

    if (subTypes.hasText(trace)) {
        opts.text = convertTextStyle(gd, trace);
        opts.textSel = convertTextSelection(gd, trace, trace.selected);
        opts.textUnsel = convertTextSelection(gd, trace, trace.unselected);
    }

    if (subTypes.hasMarkers(trace)) {
        opts.marker = convertMarkerStyle(gd, trace);
        opts.markerSel = convertMarkerSelection(gd, trace, trace.selected);
        opts.markerUnsel = convertMarkerSelection(gd, trace, trace.unselected);

        if (!trace.unselected && isArrayOrTypedArray(trace.marker.opacity)) {
            var mo = trace.marker.opacity;
            opts.markerUnsel.opacity = new Array(mo.length);
            for (i = 0; i < mo.length; i++) {
                opts.markerUnsel.opacity[i] = DESELECTDIM * mo[i];
            }
        }
    }

    if (subTypes.hasLines(trace)) {
        opts.line = {
            overlay: true,
            thickness: trace.line.width * plotGlPixelRatio,
            color: trace.line.color,
            opacity: trace.opacity
        };

        var dashes = (constants.DASHES[trace.line.dash] || [1]).slice();
        for (i = 0; i < dashes.length; ++i) {
            dashes[i] *= trace.line.width * plotGlPixelRatio;
        }
        opts.line.dashes = dashes;
    }

    if (trace.error_x && trace.error_x.visible) {
        opts.errorX = convertErrorBarStyle(trace, trace.error_x, plotGlPixelRatio);
    }

    if (trace.error_y && trace.error_y.visible) {
        opts.errorY = convertErrorBarStyle(trace, trace.error_y, plotGlPixelRatio);
    }

    if (!!trace.fill && trace.fill !== 'none') {
        opts.fill = {
            closed: true,
            fill: trace.fillcolor,
            thickness: 0
        };
    }

    return opts;
}

function convertTextStyle(gd, trace) {
    var fullLayout = gd._fullLayout;
    var count = trace._length;
    var textfontIn = trace.textfont;
    var textpositionIn = trace.textposition;
    var textPos = isArrayOrTypedArray(textpositionIn) ? textpositionIn : [textpositionIn];
    var tfc = textfontIn.color;
    var tfs = textfontIn.size;
    var tff = textfontIn.family;
    var tfw = textfontIn.weight;
    var tfy = textfontIn.style;
    var tfv = textfontIn.variant;
    var optsOut = {};
    var i;
    var plotGlPixelRatio = gd._context.plotGlPixelRatio;

    var texttemplate = trace.texttemplate;
    if (texttemplate) {
        optsOut.text = [];

        var d3locale = fullLayout._d3locale;
        var isArray = Array.isArray(texttemplate);
        var N = isArray ? Math.min(texttemplate.length, count) : count;
        var txt = isArray
            ? function (i) {
                return texttemplate[i];
            }
            : function () {
                return texttemplate;
            };

        for (i = 0; i < N; i++) {
            var d = { i: i };
            var labels = trace._module.formatLabels(d, trace, fullLayout);
            var pointValues = {};
            appendArrayPointValue(pointValues, trace, i);
            optsOut.text.push(
                Lib.texttemplateString({
                    data: [pointValues, d, trace._meta],
                    fallback: trace.texttemplatefallback,
                    labels,
                    locale: d3locale,
                    template: txt(i)
                })
            );
        }
    } else {
        if (isArrayOrTypedArray(trace.text) && trace.text.length < count) {
            // if text array is shorter, we'll need to append to it, so let's slice to prevent mutating
            optsOut.text = trace.text.slice();
        } else {
            optsOut.text = trace.text;
        }
    }
    // pad text array with empty strings
    if (isArrayOrTypedArray(optsOut.text)) {
        for (i = optsOut.text.length; i < count; i++) {
            optsOut.text[i] = '';
        }
    }

    optsOut.opacity = trace.opacity;
    optsOut.font = {};
    optsOut.align = [];
    optsOut.baseline = [];

    for (i = 0; i < textPos.length; i++) {
        var tp = textPos[i].split(/\s+/);

        switch (tp[1]) {
            case 'left':
                optsOut.align.push('right');
                break;
            case 'right':
                optsOut.align.push('left');
                break;
            default:
                optsOut.align.push(tp[1]);
        }
        switch (tp[0]) {
            case 'top':
                optsOut.baseline.push('bottom');
                break;
            case 'bottom':
                optsOut.baseline.push('top');
                break;
            default:
                optsOut.baseline.push(tp[0]);
        }
    }

    if (isArrayOrTypedArray(tfc)) {
        optsOut.color = new Array(count);
        for (i = 0; i < count; i++) {
            optsOut.color[i] = tfc[i];
        }
    } else {
        optsOut.color = tfc;
    }

    if (
        isArrayOrTypedArray(tfs) ||
        Array.isArray(tff) ||
        isArrayOrTypedArray(tfw) ||
        Array.isArray(tfy) ||
        Array.isArray(tfv)
    ) {
        // if any textfont param is array - make render a batch
        optsOut.font = new Array(count);
        for (i = 0; i < count; i++) {
            var fonti = (optsOut.font[i] = {});

            fonti.size =
                (Lib.isTypedArray(tfs) ? tfs[i] : isArrayOrTypedArray(tfs) ? (isNumeric(tfs[i]) ? tfs[i] : 0) : tfs) *
                plotGlPixelRatio;

            fonti.family = Array.isArray(tff) ? tff[i] : tff;
            fonti.weight = weightFallBack(isArrayOrTypedArray(tfw) ? tfw[i] : tfw);
            fonti.style = Array.isArray(tfy) ? tfy[i] : tfy;
            fonti.variant = Array.isArray(tfv) ? tfv[i] : tfv;
        }
    } else {
        // if both are single values, make render fast single-value
        optsOut.font = {
            size: tfs * plotGlPixelRatio,
            family: tff,
            weight: weightFallBack(tfw),
            style: tfy,
            variant: tfv
        };
    }

    return optsOut;
}

// scattergl rendering pipeline has limited support of numeric weight values
// Here we map the numbers to be either bold or normal.
function weightFallBack(w) {
    if (w <= 1000) {
        return w > 500 ? 'bold' : 'normal';
    }
    return w;
}

function convertMarkerStyle(gd, trace) {
    var count = trace._length;
    var optsIn = trace.marker;
    var optsOut = {};
    var i;

    var multiSymbol = isArrayOrTypedArray(optsIn.symbol);
    var multiAngle = isArrayOrTypedArray(optsIn.angle);
    var multiColor = isArrayOrTypedArray(optsIn.color);
    var multiLineColor = isArrayOrTypedArray(optsIn.line.color);
    var multiOpacity = isArrayOrTypedArray(optsIn.opacity);
    var multiSize = isArrayOrTypedArray(optsIn.size);
    var multiLineWidth = isArrayOrTypedArray(optsIn.line.width);

    var isOpen;
    if (!multiSymbol) isOpen = helpers.isOpenSymbol(optsIn.symbol);

    // prepare colors
    if (multiSymbol || multiColor || multiLineColor || multiOpacity || multiAngle) {
        optsOut.symbols = new Array(count);
        optsOut.angles = new Array(count);
        optsOut.colors = new Array(count);
        optsOut.borderColors = new Array(count);

        var symbols = optsIn.symbol;
        var angles = optsIn.angle;
        var colors = formatColor(optsIn, optsIn.opacity, count);
        var borderColors = formatColor(optsIn.line, optsIn.opacity, count);

        if (!isArrayOrTypedArray(borderColors[0])) {
            var borderColor = borderColors;
            borderColors = Array(count);
            for (i = 0; i < count; i++) {
                borderColors[i] = borderColor;
            }
        }
        if (!isArrayOrTypedArray(colors[0])) {
            var color = colors;
            colors = Array(count);
            for (i = 0; i < count; i++) {
                colors[i] = color;
            }
        }
        if (!isArrayOrTypedArray(symbols)) {
            var symbol = symbols;
            symbols = Array(count);
            for (i = 0; i < count; i++) {
                symbols[i] = symbol;
            }
        }
        if (!isArrayOrTypedArray(angles)) {
            var angle = angles;
            angles = Array(count);
            for (i = 0; i < count; i++) {
                angles[i] = angle;
            }
        }

        optsOut.symbols = symbols;
        optsOut.angles = angles;
        optsOut.colors = colors;
        optsOut.borderColors = borderColors;

        for (i = 0; i < count; i++) {
            if (multiSymbol) {
                isOpen = helpers.isOpenSymbol(optsIn.symbol[i]);
            }
            if (isOpen) {
                borderColors[i] = colors[i].slice();
                colors[i] = colors[i].slice();
                colors[i][3] = 0;
            }
        }

        optsOut.opacity = trace.opacity;

        optsOut.markers = new Array(count);
        for (i = 0; i < count; i++) {
            optsOut.markers[i] = getSymbolSdf(
                {
                    mx: optsOut.symbols[i],
                    ma: optsOut.angles[i]
                },
                trace
            );
        }
    } else {
        if (isOpen) {
            optsOut.color = rgba(optsIn.color, 'uint8');
            optsOut.color[3] = 0;
            optsOut.borderColor = rgba(optsIn.color, 'uint8');
        } else {
            optsOut.color = rgba(optsIn.color, 'uint8');
            optsOut.borderColor = rgba(optsIn.line.color, 'uint8');
        }

        optsOut.opacity = trace.opacity * optsIn.opacity;

        optsOut.marker = getSymbolSdf(
            {
                mx: optsIn.symbol,
                ma: optsIn.angle
            },
            trace
        );
    }

    // prepare sizes
    var sizeFactor = 1;
    var markerSizeFunc = makeBubbleSizeFn(trace, sizeFactor);
    var s;

    if (multiSize || multiLineWidth) {
        var sizes = (optsOut.sizes = new Array(count));
        var borderSizes = (optsOut.borderSizes = new Array(count));
        var sizeTotal = 0;
        var sizeAvg;

        if (multiSize) {
            for (i = 0; i < count; i++) {
                sizes[i] = markerSizeFunc(optsIn.size[i]);
                sizeTotal += sizes[i];
            }
            sizeAvg = sizeTotal / count;
        } else {
            s = markerSizeFunc(optsIn.size);
            for (i = 0; i < count; i++) {
                sizes[i] = s;
            }
        }

        // See  https://github.com/plotly/plotly.js/pull/1781#discussion_r121820798
        if (multiLineWidth) {
            for (i = 0; i < count; i++) {
                borderSizes[i] = optsIn.line.width[i];
            }
        } else {
            s = optsIn.line.width;
            for (i = 0; i < count; i++) {
                borderSizes[i] = s;
            }
        }

        optsOut.sizeAvg = sizeAvg;
    } else {
        optsOut.size = markerSizeFunc((optsIn && optsIn.size) || 10);
        optsOut.borderSizes = markerSizeFunc(optsIn.line.width);
    }

    return optsOut;
}

function convertMarkerSelection(gd, trace, target) {
    var optsIn = trace.marker;
    var optsOut = {};

    if (!target) return optsOut;

    if (target.marker && target.marker.symbol) {
        optsOut = convertMarkerStyle(gd, Lib.extendFlat({}, optsIn, target.marker));
    } else if (target.marker) {
        if (target.marker.size) optsOut.size = target.marker.size;
        if (target.marker.color) optsOut.colors = target.marker.color;
        if (target.marker.opacity !== undefined) optsOut.opacity = target.marker.opacity;
    }

    return optsOut;
}

function convertTextSelection(gd, trace, target) {
    var optsOut = {};

    if (!target) return optsOut;

    if (target.textfont) {
        var optsIn = {
            opacity: 1,
            text: trace.text,
            texttemplate: trace.texttemplate,
            textposition: trace.textposition,
            textfont: Lib.extendFlat({}, trace.textfont)
        };
        if (target.textfont) {
            Lib.extendFlat(optsIn.textfont, target.textfont);
        }
        optsOut = convertTextStyle(gd, optsIn);
    }

    return optsOut;
}

function convertErrorBarStyle(trace, target, plotGlPixelRatio) {
    var optsOut = {
        capSize: target.width * 2 * plotGlPixelRatio,
        lineWidth: target.thickness * plotGlPixelRatio,
        color: target.color
    };

    if (target.copy_ystyle) {
        optsOut = trace.error_y;
    }

    return optsOut;
}

var SYMBOL_SDF_SIZE = constants.SYMBOL_SDF_SIZE;
var SYMBOL_SIZE = constants.SYMBOL_SIZE;
var SYMBOL_STROKE = constants.SYMBOL_STROKE;
var SYMBOL_SDF = {};
var SYMBOL_SVG_CIRCLE = Drawing.symbolFuncs[0](SYMBOL_SIZE * 0.05);

function getSymbolSdf(d, trace) {
    var symbol = d.mx;
    if (symbol === 'circle') return null;

    var symbolPath, symbolSdf;
    var symbolNumber = Drawing.symbolNumber(symbol);
    var symbolFunc = Drawing.symbolFuncs[symbolNumber % 100];
    var symbolNoDot = !!Drawing.symbolNoDot[symbolNumber % 100];
    var symbolNoFill = !!Drawing.symbolNoFill[symbolNumber % 100];

    var isDot = helpers.isDotSymbol(symbol);

    // until we may handle angles in shader?
    if (d.ma) symbol += '_' + d.ma;

    // get symbol sdf from cache or generate it
    if (SYMBOL_SDF[symbol]) return SYMBOL_SDF[symbol];

    var angle = Drawing.getMarkerAngle(d, trace);
    if (isDot && !symbolNoDot) {
        symbolPath = symbolFunc(SYMBOL_SIZE * 1.1, angle) + SYMBOL_SVG_CIRCLE;
    } else {
        symbolPath = symbolFunc(SYMBOL_SIZE, angle);
    }

    symbolSdf = svgSdf(symbolPath, {
        w: SYMBOL_SDF_SIZE,
        h: SYMBOL_SDF_SIZE,
        viewBox: [-SYMBOL_SIZE, -SYMBOL_SIZE, SYMBOL_SIZE, SYMBOL_SIZE],
        stroke: symbolNoFill ? SYMBOL_STROKE : -SYMBOL_STROKE
    });

    SYMBOL_SDF[symbol] = symbolSdf;

    return symbolSdf || null;
}

function splitLinePositions(positions) {
    var segments = [];
    var segment = [];

    for (var i = 0; i < positions.length; i += 2) {
        var x = positions[i];
        var y = positions[i + 1];

        if (isNaN(x) || isNaN(y)) {
            if (segment.length) {
                segments.push(segment);
                segment = [];
            }
        } else {
            segment.push([x, y]);
        }
    }

    if (segment.length) segments.push(segment);

    return segments;
}

function distance(pt1, pt2) {
    var dx = pt2[0] - pt1[0];
    var dy = pt2[1] - pt1[1];
    return Math.sqrt(dx * dx + dy * dy);
}

function pointLineDistance(pt, start, end, toPixel) {
    var pixelPt = toPixel(pt);
    var pixelStart = toPixel(start);
    var pixelEnd = toPixel(end);
    var dx = pixelEnd[0] - pixelStart[0];
    var dy = pixelEnd[1] - pixelStart[1];
    var denom = Math.sqrt(dx * dx + dy * dy);

    if (!denom) {
        return distance(pixelPt, pixelStart);
    }

    return Math.abs(
        dy * pixelPt[0] -
        dx * pixelPt[1] +
        pixelEnd[0] * pixelStart[1] -
        pixelEnd[1] * pixelStart[0]
    ) / denom;
}

function midpoint(pt1, pt2) {
    return [(pt1[0] + pt2[0]) / 2, (pt1[1] + pt2[1]) / 2];
}

function sampleQuadraticBezier(start, control, end, out, depth, toPixel) {
    if (
        depth >= MAX_BEZIER_SUBDIVISION_DEPTH ||
        pointLineDistance(control, start, end, toPixel) <= SMOOTH_LINE_TOLERANCE_PX
    ) {
        out.push(end);
        return;
    }

    var startControl = midpoint(start, control);
    var controlEnd = midpoint(control, end);
    var split = midpoint(startControl, controlEnd);

    sampleQuadraticBezier(start, startControl, split, out, depth + 1, toPixel);
    sampleQuadraticBezier(split, controlEnd, end, out, depth + 1, toPixel);
}

function sampleCubicBezier(start, control1, control2, end, out, depth, toPixel) {
    var flatness = Math.max(
        pointLineDistance(control1, start, end, toPixel),
        pointLineDistance(control2, start, end, toPixel)
    );

    if (depth >= MAX_BEZIER_SUBDIVISION_DEPTH || flatness <= SMOOTH_LINE_TOLERANCE_PX) {
        out.push(end);
        return;
    }

    var startControl1 = midpoint(start, control1);
    var control1Control2 = midpoint(control1, control2);
    var control2End = midpoint(control2, end);
    var leftControl2 = midpoint(startControl1, control1Control2);
    var rightControl1 = midpoint(control1Control2, control2End);
    var split = midpoint(leftControl2, rightControl1);

    sampleCubicBezier(start, startControl1, leftControl2, split, out, depth + 1, toPixel);
    sampleCubicBezier(split, rightControl1, control2End, end, out, depth + 1, toPixel);
}

function samePoint(pt1, pt2) {
    return pt1 && pt2 && pt1[0] === pt2[0] && pt1[1] === pt2[1];
}

function samplePathString(pathString, toPixel) {
    var commands = parseSvgPath(pathString);
    var sampled = [];
    var currentPoint;
    var subpathStart;

    for (var i = 0; i < commands.length; i++) {
        var command = commands[i];
        var type = command[0];

        if (type === 'M') {
            currentPoint = [command[1], command[2]];
            subpathStart = currentPoint;
            sampled.push(currentPoint);
        } else if (type === 'L') {
            currentPoint = [command[1], command[2]];
            sampled.push(currentPoint);
        } else if (type === 'Q') {
            var quadEnd = [command[3], command[4]];
            sampleQuadraticBezier(currentPoint, [command[1], command[2]], quadEnd, sampled, 0, toPixel);
            currentPoint = quadEnd;
        } else if (type === 'C') {
            var cubicEnd = [command[5], command[6]];
            sampleCubicBezier(currentPoint, [command[1], command[2]], [command[3], command[4]], cubicEnd, sampled, 0, toPixel);
            currentPoint = cubicEnd;
        } else if (type === 'Z' && subpathStart && !samePoint(currentPoint, subpathStart)) {
            sampled.push(subpathStart);
            currentPoint = subpathStart;
        }
    }

    return sampled;
}

function getSmoothPath(trace, pts) {
    var line = trace.line || {};
    var pLast = pts[pts.length - 1];
    var isClosed = pts.length > 1 && pts[0][0] === pLast[0] && pts[0][1] === pLast[1];

    if (line.shape === 'spline') {
        return isClosed ? Drawing.smoothclosed(pts.slice(1), line.smoothing) : Drawing.smoothopen(pts, line.smoothing);
    }

    if (line.shape === 'cardinal') {
        return isClosed ? Drawing.cardinalclosed(pts.slice(1), line.tension) : Drawing.cardinalopen(pts, line.tension);
    }

    if (line.shape === 'catmull-rom') {
        return isClosed ? Drawing.catmullromclosed(pts.slice(1), line.alpha) : Drawing.catmullromopen(pts, line.alpha);
    }

    if (line.shape === 'monotone') {
        return Drawing.monotoneopen(pts);
    }

    return Drawing.naturalopen(pts);
}

function getLinePointPixelTransform(gd, trace) {
    if (!gd || !trace) {
        return function (pt) { return pt; };
    }

    var xa = trace._xA || AxisIDs.getFromId(gd, trace.xaxis, 'x');
    var ya = trace._yA || AxisIDs.getFromId(gd, trace.yaxis, 'y');
    var xToPixel = xa.type === 'log' ? xa.l2p.bind(xa) : xa.c2p.bind(xa);
    var yToPixel = ya.type === 'log' ? ya.l2p.bind(ya) : ya.c2p.bind(ya);

    return function (pt) {
        return [xToPixel(pt[0]), yToPixel(pt[1])];
    };
}

function convertSmoothLinePositions(gd, trace, positions) {
    var segments = splitLinePositions(positions);
    var linePositions = [];
    var toPixel = getLinePointPixelTransform(gd, trace);

    for (var i = 0; i < segments.length; i++) {
        var pts = segments[i];
        var sampled = pts.length < 2 ? pts : samplePathString(getSmoothPath(trace, pts), toPixel);

        if (i) linePositions.push(NaN, NaN);

        for (var j = 0; j < sampled.length; j++) {
            linePositions.push(sampled[j][0], sampled[j][1]);
        }
    }

    return linePositions;
}

function convertLinePositions(gd, trace, positions) {
    var len = positions.length;
    var count = len / 2;
    var linePositions;
    var i;

    if (subTypes.hasLines(trace) && count) {
        if (trace.line.shape === 'spline' || trace.line.shape === 'cardinal' ||
            trace.line.shape === 'catmull-rom' || trace.line.shape === 'monotone' ||
            trace.line.shape === 'natural') {
            linePositions = convertSmoothLinePositions(gd, trace, positions);
        } else if (trace.line.shape === 'hv') {
            linePositions = [];
            for (i = 0; i < count - 1; i++) {
                if (isNaN(positions[i * 2]) || isNaN(positions[i * 2 + 1])) {
                    linePositions.push(NaN, NaN, NaN, NaN);
                } else {
                    linePositions.push(positions[i * 2], positions[i * 2 + 1]);
                    if (!isNaN(positions[i * 2 + 2]) && !isNaN(positions[i * 2 + 3])) {
                        linePositions.push(positions[i * 2 + 2], positions[i * 2 + 1]);
                    } else {
                        linePositions.push(NaN, NaN);
                    }
                }
            }
            linePositions.push(positions[len - 2], positions[len - 1]);
        } else if (trace.line.shape === 'hvh') {
            linePositions = [];
            for (i = 0; i < count - 1; i++) {
                if (
                    isNaN(positions[i * 2]) ||
                    isNaN(positions[i * 2 + 1]) ||
                    isNaN(positions[i * 2 + 2]) ||
                    isNaN(positions[i * 2 + 3])
                ) {
                    if (!isNaN(positions[i * 2]) && !isNaN(positions[i * 2 + 1])) {
                        linePositions.push(positions[i * 2], positions[i * 2 + 1]);
                    } else {
                        linePositions.push(NaN, NaN);
                    }
                    linePositions.push(NaN, NaN);
                } else {
                    var midPtX = (positions[i * 2] + positions[i * 2 + 2]) / 2;
                    linePositions.push(
                        positions[i * 2],
                        positions[i * 2 + 1],
                        midPtX,
                        positions[i * 2 + 1],
                        midPtX,
                        positions[i * 2 + 3]
                    );
                }
            }
            linePositions.push(positions[len - 2], positions[len - 1]);
        } else if (trace.line.shape === 'vhv') {
            linePositions = [];
            for (i = 0; i < count - 1; i++) {
                if (
                    isNaN(positions[i * 2]) ||
                    isNaN(positions[i * 2 + 1]) ||
                    isNaN(positions[i * 2 + 2]) ||
                    isNaN(positions[i * 2 + 3])
                ) {
                    if (!isNaN(positions[i * 2]) && !isNaN(positions[i * 2 + 1])) {
                        linePositions.push(positions[i * 2], positions[i * 2 + 1]);
                    } else {
                        linePositions.push(NaN, NaN);
                    }
                    linePositions.push(NaN, NaN);
                } else {
                    var midPtY = (positions[i * 2 + 1] + positions[i * 2 + 3]) / 2;
                    linePositions.push(
                        positions[i * 2],
                        positions[i * 2 + 1],
                        positions[i * 2],
                        midPtY,
                        positions[i * 2 + 2],
                        midPtY
                    );
                }
            }
            linePositions.push(positions[len - 2], positions[len - 1]);
        } else if (trace.line.shape === 'vh') {
            linePositions = [];
            for (i = 0; i < count - 1; i++) {
                if (isNaN(positions[i * 2]) || isNaN(positions[i * 2 + 1])) {
                    linePositions.push(NaN, NaN, NaN, NaN);
                } else {
                    linePositions.push(positions[i * 2], positions[i * 2 + 1]);
                    if (!isNaN(positions[i * 2 + 2]) && !isNaN(positions[i * 2 + 3])) {
                        linePositions.push(positions[i * 2], positions[i * 2 + 3]);
                    } else {
                        linePositions.push(NaN, NaN);
                    }
                }
            }
            linePositions.push(positions[len - 2], positions[len - 1]);
        } else {
            linePositions = positions;
        }
    }

    // If we have data with gaps, we ought to use rect joins
    // FIXME: get rid of this
    var hasNaN = false;
    for (i = 0; i < linePositions.length; i++) {
        if (isNaN(linePositions[i])) {
            hasNaN = true;
            break;
        }
    }

    var join =
        hasNaN || linePositions.length > constants.TOO_MANY_POINTS
            ? 'rect'
            : subTypes.hasMarkers(trace)
                ? 'rect'
                : 'round';

    // fill gaps
    if (hasNaN && trace.connectgaps) {
        var lastX = linePositions[0];
        var lastY = linePositions[1];

        for (i = 0; i < linePositions.length; i += 2) {
            if (isNaN(linePositions[i]) || isNaN(linePositions[i + 1])) {
                linePositions[i] = lastX;
                linePositions[i + 1] = lastY;
            } else {
                lastX = linePositions[i];
                lastY = linePositions[i + 1];
            }
        }
    }

    return {
        join: join,
        positions: linePositions
    };
}

function convertErrorBarPositions(gd, trace, positions, x, y) {
    var makeComputeError = Registry.getComponentMethod('errorbars', 'makeComputeError');
    var xa = AxisIDs.getFromId(gd, trace.xaxis, 'x');
    var ya = AxisIDs.getFromId(gd, trace.yaxis, 'y');
    var count = positions.length / 2;
    var out = {};

    function convertOneAxis(coords, ax) {
        var axLetter = ax._id.charAt(0);
        var opts = trace['error_' + axLetter];

        if (opts && opts.visible && (ax.type === 'linear' || ax.type === 'log')) {
            var computeError = makeComputeError(opts);
            var pOffset = { x: 0, y: 1 }[axLetter];
            var eOffset = { x: [0, 1, 2, 3], y: [2, 3, 0, 1] }[axLetter];
            var errors = new Float64Array(4 * count);
            var minShoe = Infinity;
            var maxHat = -Infinity;

            for (var i = 0, j = 0; i < count; i++, j += 4) {
                var dc = coords[i];

                if (isNumeric(dc)) {
                    var dl = positions[i * 2 + pOffset];
                    var vals = computeError(dc, i);
                    var lv = vals[0];
                    var hv = vals[1];

                    if (isNumeric(lv) && isNumeric(hv)) {
                        var shoe = dc - lv;
                        var hat = dc + hv;

                        errors[j + eOffset[0]] = dl - ax.c2l(shoe);
                        errors[j + eOffset[1]] = ax.c2l(hat) - dl;
                        errors[j + eOffset[2]] = 0;
                        errors[j + eOffset[3]] = 0;

                        minShoe = Math.min(minShoe, dc - lv);
                        maxHat = Math.max(maxHat, dc + hv);
                    }
                }
            }

            out[axLetter] = {
                positions: positions,
                errors: errors,
                _bnds: [minShoe, maxHat]
            };
        }
    }

    convertOneAxis(x, xa);
    convertOneAxis(y, ya);
    return out;
}

function convertTextPosition(gd, trace, textOpts, markerOpts, fallback) {
    var count = trace._length;
    var out = {};
    var i;

    // corresponds to textPointPosition from component.drawing
    if (subTypes.hasMarkers(trace)) {
        var fontOpts = textOpts.font;
        var align = textOpts.align;
        var baseline = textOpts.baseline;
        var hasMarkerSizes = markerOpts && isArrayOrTypedArray(markerOpts.sizes);
        var hasFontArray = isArrayOrTypedArray(fontOpts);
        var hasAlignArray = isArrayOrTypedArray(align) && align.length > 1;
        var hasBaselineArray = isArrayOrTypedArray(baseline) && baseline.length > 1;

        if (!hasMarkerSizes && !hasFontArray && !hasAlignArray && !hasBaselineArray) {
            var uniformOffset = makeTextOffset(
                markerOpts && markerOpts.size,
                fontOpts.size,
                isArrayOrTypedArray(align) ? align[0] : align,
                isArrayOrTypedArray(baseline) ? baseline[0] : baseline
            );

            if (fallback && fallback.offset && sameTextOffset(fallback.offset, uniformOffset)) {
                out.offset = fallback.offset;
            } else {
                out.offset = uniformOffset;
            }

            return out;
        }

        if (!hasMarkerSizes && fallback && fallback.offset) {
            out.offset = fallback.offset;
            return out;
        }

        out.offset = new Array(count);

        for (i = 0; i < count; i++) {
            var ms = markerOpts.sizes ? markerOpts.sizes[i] : markerOpts.size;
            var fs = isArrayOrTypedArray(fontOpts) ? fontOpts[i].size : fontOpts.size;

            var a = isArrayOrTypedArray(align) ? (align.length > 1 ? align[i] : align[0]) : align;
            var b = isArrayOrTypedArray(baseline) ? (baseline.length > 1 ? baseline[i] : baseline[0]) : baseline;

            out.offset[i] = makeTextOffset(ms, fs, a, b);
        }
    }

    return out;
}

function makeTextOffset(markerSize, fontSize, align, baseline) {
    var hSign = TEXTOFFSETSIGN[align];
    var vSign = TEXTOFFSETSIGN[baseline];
    var xPad = markerSize ? markerSize / 0.8 + 1 : 0;
    var yPad = -vSign * xPad - vSign * 0.5;

    return [(hSign * xPad) / fontSize, yPad / fontSize];
}

function sameTextOffset(offset1, offset2) {
    return !!offset1 && !!offset2 &&
        offset1[0] === offset2[0] &&
        offset1[1] === offset2[1];
}

module.exports = {
    style: convertStyle,

    markerStyle: convertMarkerStyle,
    markerSelection: convertMarkerSelection,

    linePositions: convertLinePositions,
    errorBarPositions: convertErrorBarPositions,
    textPosition: convertTextPosition
};
