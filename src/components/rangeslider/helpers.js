'use strict';

var axisIDs = require('../../plots/cartesian/axis_ids');
var svgTextUtils = require('../../lib/svg_text_utils');
var constants = require('./constants');
var LINE_SPACING = require('../../constants/alignment').LINE_SPACING;
var name = constants.name;

function isVisible(ax) {
    var rangeSlider = ax && ax[name];
    return rangeSlider && rangeSlider.visible;
}
exports.isVisible = isVisible;

exports.makeData = function (fullLayout) {
    var margin = fullLayout.margin;
    var gs = fullLayout._size;
    var rangeSliderData = [];

    // Horizontal sliders on x-axes
    var xAxes = axisIDs.list({ _fullLayout: fullLayout }, 'x', true);
    for (var i = 0; i < xAxes.length; i++) {
        var ax = xAxes[i];
        if (isVisible(ax)) {
            rangeSliderData.push(ax);
            var opts = ax[name];
            opts._id = name + ax._id;
            opts._isVertical = false;
            var rawHeight = (fullLayout.height - margin.b - margin.t) * opts.thickness;
            opts._height = Math.min(
                isFinite(opts.maxthickness) ? opts.maxthickness : Infinity,
                Math.max(opts.minthickness || 0, rawHeight)
            );
            opts._offsetShift = Math.floor(opts.borderwidth / 2);
        }
    }

    // Vertical sliders on y-axes
    var yAxes = axisIDs.list({ _fullLayout: fullLayout }, 'y', true);
    for (var j = 0; j < yAxes.length; j++) {
        var yAx = yAxes[j];
        if (isVisible(yAx)) {
            rangeSliderData.push(yAx);
            var yOpts = yAx[name];
            yOpts._id = name + yAx._id;
            yOpts._isVertical = true;
            // thickness is fraction of total plot width (perpendicular dimension)
            var rawWidth = (fullLayout.width - margin.l - margin.r) * yOpts.thickness;
            yOpts._width = Math.min(
                isFinite(yOpts.maxthickness) ? yOpts.maxthickness : Infinity,
                Math.max(yOpts.minthickness || 0, rawWidth)
            );
            // height spans the axis domain
            yOpts._height = gs.h * (yAx.domain[1] - yAx.domain[0]);
            yOpts._offsetShift = Math.floor(yOpts.borderwidth / 2);
        }
    }

    fullLayout._rangeSliderData = rangeSliderData;
};

// Resolve the actual placement side for a slider.
// For xaxis: default side is 'bottom'; 'same'='bottom', 'opposite'='top'.
// For yaxis: default side is 'left';   'same'='left',   'opposite'='right'.
exports.resolvedSide = function (ax) {
    var opts = ax[name];
    var axLetter = ax._id.charAt(0);
    var sliderSide = opts.side; // 'same' | 'opposite'

    if (axLetter === 'x') {
        var axSide = ax.side || 'bottom'; // 'bottom' or 'top'
        if (sliderSide === 'opposite') {
            return axSide === 'bottom' ? 'top' : 'bottom';
        }
        return axSide; // 'same'
    } else {
        var yAxSide = ax.side || 'left'; // 'left' or 'right'
        if (sliderSide === 'opposite') {
            return yAxSide === 'left' ? 'right' : 'left';
        }
        return yAxSide; // 'same'
    }
};

exports.autoMarginOpts = function (gd, ax) {
    var fullLayout = gd._fullLayout;
    var opts = ax[name];
    var axLetter = ax._id.charAt(0);
    var resolvedSide = exports.resolvedSide(ax);

    if (axLetter === 'x') {
        // Horizontal slider.
        // Only include axis depth / title height on the side where both the
        // axis labels AND the slider reside.  When the axis is on top but the
        // slider is on the bottom (side:'opposite'), the top-axis depth should
        // not inflate the bottom margin, and vice-versa.
        var axSide = ax.side || 'bottom';
        var bottomDepth = 0;
        var titleHeight = 0;
        if (resolvedSide === 'bottom' && axSide === 'bottom') {
            bottomDepth = ax._depth;
            if (ax.title.text !== fullLayout._dfltTitle[axLetter]) {
                // as in rangeslider/draw.js
                titleHeight = 1.5 * ax.title.font.size + 10 + opts._offsetShift;
                // multi-line extra bump
                var extraLines = (ax.title.text.match(svgTextUtils.BR_TAG_ALL) || []).length;
                titleHeight += extraLines * ax.title.font.size * LINE_SPACING;
            }
        }
        var topDepth = (resolvedSide === 'top' && axSide === 'top') ? (ax._depth || 0) : 0;

        var marginPush = {
            x: 0,
            // Plots.autoMargin pairs (k1.b, k2.t) where k2.t.val > k1.b.val.
            // Bottom slider: anchor at counterDomainMin (≈0) → pairs with base's t.val=1 ✓
            // Top slider:    anchor at counterDomainMax (≈1) → base's b.val=0 pairs with our t.val=1 ✓
            y: resolvedSide === 'bottom'
                ? ax._counterDomainMin
                : (ax._counterDomainMax || 1),
            l: 0,
            r: 0,
            t: 0,
            b: 0,
            pad: constants.extraPad + opts._offsetShift * 2
        };

        if (resolvedSide === 'bottom') {
            marginPush.b = opts._height + bottomDepth + Math.max(fullLayout.margin.b, titleHeight);
        } else {
            // top
            marginPush.t = opts._height + topDepth + constants.extraPad + opts._offsetShift * 2;
        }
        return marginPush;
    } else {
        // Vertical slider
        var vDepth = resolvedSide === 'left' ? (ax._depth || 0) : 0;
        var marginPushV = {
            // Plots.autoMargin pairs (k1.l, k2.r) where k2.r.val > k1.l.val.
            // Left slider:  anchor at counterDomainMin (≈0) → pairs with base's r.val=1 ✓
            // Right slider: anchor at counterDomainMax (≈1) → base's l.val=0 pairs with our r.val=1 ✓
            x: resolvedSide === 'left'
                ? ax._counterDomainMin
                : (ax._counterDomainMax || 1),
            y: 0,
            l: 0,
            r: 0,
            t: 0,
            b: 0,
            pad: constants.extraPad + opts._offsetShift * 2
        };

        if (resolvedSide === 'left') {
            marginPushV.l = opts._width + vDepth + Math.max(fullLayout.margin.l, 0);
        } else {
            // right
            marginPushV.r = opts._width + (ax._depth || 0) + constants.extraPad + opts._offsetShift * 2;
        }
        return marginPushV;
    }
};

/**
 * Reset all visible rangesliders on a graph to show 100% of the data.
 * Clears any stored range selection and re-enables autorange on both the
 * slider and its parent axis.  Returns a Promise that resolves when the
 * relayout triggered by the reset is complete.
 *
 * @param {HTMLElement} gd  - the graph div
 * @returns {Promise}
 */
exports.resetRangeSliders = function (gd) {
    var fullLayout = gd && gd._fullLayout;
    if (!fullLayout) return Promise.resolve();

    var patch = {};
    var allAxes = axisIDs.list(gd, '', true);
    for (var i = 0; i < allAxes.length; i++) {
        var ax = allAxes[i];
        if (!isVisible(ax)) continue;
        var n = ax._name; // e.g. 'xaxis', 'yaxis2'
        patch[n + '.autorange'] = true;
        patch[n + '.range'] = null;
        patch[n + '.rangeslider.autorange'] = true;
        patch[n + '.rangeslider.range'] = null;
    }

    if (!Object.keys(patch).length) return Promise.resolve();

    var Registry = require('../../registry');
    return Registry.call('relayout', gd, patch);
};
