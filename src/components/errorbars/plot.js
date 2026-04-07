'use strict';

var d3 = require('@plotly/d3');
var isNumeric = require('fast-isnumeric');

var Drawing = require('../drawing');
var subTypes = require('../../traces/scatter/subtypes');

module.exports = function plot(gd, traces, plotinfo, transitionOpts) {
    var isNew;

    var xa = plotinfo.xaxis;
    var ya = plotinfo.yaxis;

    var hasAnimation = transitionOpts && transitionOpts.duration > 0;
    var isStatic = gd._context.staticPlot;

    traces.each(function (d) {
        var trace = d[0].trace;
        // || {} is in case the trace (specifically scatterternary)
        // doesn't support error bars at all, but does go through
        // the scatter.plot mechanics, which calls ErrorBars.plot
        // internally
        var xObj = trace.error_x || {};
        var yObj = trace.error_y || {};

        var keyFunc;

        if (trace.ids) {
            keyFunc = function (d) { return d.id; };
        }

        var sparse = (
            subTypes.hasMarkers(trace) &&
            trace.marker.maxdisplayed > 0
        );

        if (!yObj.visible && !xObj.visible) d = [];

        var errorbars = d3.select(this).selectAll('g.errorbar')
            .data(d, keyFunc);

        errorbars.exit().remove();

        if (!d.length) return;

        if (!xObj.visible) errorbars.selectAll('path.xerror, path.xerror-plus, path.xerror-minus').remove();
        if (!yObj.visible) errorbars.selectAll('path.yerror, path.yerror-plus, path.yerror-minus').remove();

        errorbars.style('opacity', 1);

        var enter = errorbars.enter().append('g')
            .classed('errorbar', true);

        if (hasAnimation) {
            enter.style('opacity', 0).transition()
                .duration(transitionOpts.duration)
                .style('opacity', 1);
        }

        Drawing.setClipUrl(errorbars, plotinfo.layerClipId, gd);

        errorbars.each(function (d) {
            var errorbar = d3.select(this);
            var coords = errorCoords(d, xa, ya);

            if (sparse && !d.vis) return;

            var path;

            var yerror = errorbar.select('path.yerror');
            if (yObj.visible && isNumeric(coords.x) &&
                isNumeric(coords.yh) &&
                isNumeric(coords.ys)) {
                var yw = yObj.width;

                if (yObj.colorminus !== undefined) {
                    // per-side color: split into plus and minus paths
                    yerror.remove();

                    var plusPathY = 'M' + (coords.x - yw) + ',' + coords.yh +
                        'h' + (2 * yw) +        // hat
                        'm-' + yw + ',0V' + coords.y; // bar to center

                    var minusPathY = 'M' + coords.x + ',' + coords.y +
                        'V' + coords.ys;         // bar to shoe
                    if (!coords.noYS) minusPathY += 'm-' + yw + ',0h' + (2 * yw); // shoe

                    var yerrorPlus = errorbar.select('path.yerror-plus');
                    var yerrorMinus = errorbar.select('path.yerror-minus');
                    if (!yerrorPlus.size()) {
                        yerrorPlus = errorbar.append('path')
                            .style('vector-effect', isStatic ? 'none' : 'non-scaling-stroke')
                            .classed('yerror-plus', true);
                        yerrorMinus = errorbar.append('path')
                            .style('vector-effect', isStatic ? 'none' : 'non-scaling-stroke')
                            .classed('yerror-minus', true);
                    }
                    yerrorPlus.attr('d', plusPathY);
                    yerrorMinus.attr('d', minusPathY);
                } else {
                    // single combined path
                    errorbar.selectAll('path.yerror-plus, path.yerror-minus').remove();

                    path = 'M' + (coords.x - yw) + ',' +
                        coords.yh + 'h' + (2 * yw) + // hat
                        'm-' + yw + ',0V' + coords.ys; // bar

                    if (!coords.noYS) path += 'm-' + yw + ',0h' + (2 * yw); // shoe

                    isNew = !yerror.size();

                    if (isNew) {
                        yerror = errorbar.append('path')
                            .style('vector-effect', isStatic ? 'none' : 'non-scaling-stroke')
                            .classed('yerror', true);
                    } else if (hasAnimation) {
                        yerror = yerror
                            .transition()
                            .duration(transitionOpts.duration)
                            .ease(transitionOpts.easing);
                    }

                    yerror.attr('d', path);
                }
            } else {
                yerror.remove();
                errorbar.selectAll('path.yerror-plus, path.yerror-minus').remove();
            }

            var xerror = errorbar.select('path.xerror');
            if (xObj.visible && isNumeric(coords.y) &&
                isNumeric(coords.xh) &&
                isNumeric(coords.xs)) {
                var xw = (xObj.copy_ystyle ? yObj : xObj).width;

                if (xObj.colorminus !== undefined) {
                    // per-side color: split into plus and minus paths
                    xerror.remove();

                    var plusPathX = 'M' + coords.xh + ',' + (coords.y - xw) +
                        'v' + (2 * xw) +         // hat
                        'm0,-' + xw + 'H' + coords.x; // bar to center

                    var minusPathX = 'M' + coords.x + ',' + coords.y +
                        'H' + coords.xs;          // bar to shoe
                    if (!coords.noXS) minusPathX += 'm0,-' + xw + 'v' + (2 * xw); // shoe

                    var xerrorPlus = errorbar.select('path.xerror-plus');
                    var xerrorMinus = errorbar.select('path.xerror-minus');
                    if (!xerrorPlus.size()) {
                        xerrorPlus = errorbar.append('path')
                            .style('vector-effect', isStatic ? 'none' : 'non-scaling-stroke')
                            .classed('xerror-plus', true);
                        xerrorMinus = errorbar.append('path')
                            .style('vector-effect', isStatic ? 'none' : 'non-scaling-stroke')
                            .classed('xerror-minus', true);
                    }
                    xerrorPlus.attr('d', plusPathX);
                    xerrorMinus.attr('d', minusPathX);
                } else {
                    // single combined path
                    errorbar.selectAll('path.xerror-plus, path.xerror-minus').remove();

                    path = 'M' + coords.xh + ',' +
                        (coords.y - xw) + 'v' + (2 * xw) + // hat
                        'm0,-' + xw + 'H' + coords.xs; // bar

                    if (!coords.noXS) path += 'm0,-' + xw + 'v' + (2 * xw); // shoe

                    isNew = !xerror.size();

                    if (isNew) {
                        xerror = errorbar.append('path')
                            .style('vector-effect', isStatic ? 'none' : 'non-scaling-stroke')
                            .classed('xerror', true);
                    } else if (hasAnimation) {
                        xerror = xerror
                            .transition()
                            .duration(transitionOpts.duration)
                            .ease(transitionOpts.easing);
                    }

                    xerror.attr('d', path);
                }
            } else {
                xerror.remove();
                errorbar.selectAll('path.xerror-plus, path.xerror-minus').remove();
            }
        });
    });
};

// compute the coordinates of the error-bar objects
function errorCoords(d, xa, ya) {
    var out = {
        x: xa.c2p(d.x),
        y: ya.c2p(d.y)
    };

    // calculate the error bar size and hat and shoe locations
    if (d.yh !== undefined) {
        out.yh = ya.c2p(d.yh);
        out.ys = ya.c2p(d.ys);

        // if the shoes go off-scale (ie log scale, error bars past zero)
        // clip the bar and hide the shoes
        if (!isNumeric(out.ys)) {
            out.noYS = true;
            out.ys = ya.c2p(d.ys, true);
        }
    }

    if (d.xh !== undefined) {
        out.xh = xa.c2p(d.xh);
        out.xs = xa.c2p(d.xs);

        if (!isNumeric(out.xs)) {
            out.noXS = true;
            out.xs = xa.c2p(d.xs, true);
        }
    }

    return out;
}
