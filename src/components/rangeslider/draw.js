'use strict';

var d3 = require('@plotly/d3');

var Registry = require('../../registry');
var Plots = require('../../plots/plots');

var Lib = require('../../lib');
var strTranslate = Lib.strTranslate;
var Drawing = require('../drawing');
var Color = require('../color');
var Titles = require('../titles');

var Cartesian = require('../../plots/cartesian');
var axisIDs = require('../../plots/cartesian/axis_ids');

var dragElement = require('../dragelement');
var setCursor = require('../../lib/setcursor');

var constants = require('./constants');
var helpers = require('./helpers');

module.exports = function (gd) {
    var fullLayout = gd._fullLayout;
    var rangeSliderData = fullLayout._rangeSliderData;
    for (var i = 0; i < rangeSliderData.length; i++) {
        var opts = rangeSliderData[i][constants.name];
        // fullLayout._uid may not exist when we call makeData
        opts._clipId = opts._id + '-' + fullLayout._uid;
    }

    /*
     * <g container />
     *  <rect bg />
     *  < .... range plot />
     *  <rect mask-min />
     *  <rect mask-max />
     *  <rect slidebox />
     *  <g grabber-min />
     *      <rect handle-min />
     *      <rect grabarea-min />
     *  <g grabber-max />
     *      <rect handle-max />
     *      <rect grabarea-max />
     *
     *  For vertical sliders, 'min'/'max' refer to the bottom/top ends
     *  of the y-axis (i.e. data minimum and maximum).
     */

    function keyFunction(axisOpts) {
        return axisOpts._name;
    }

    var rangeSliders = fullLayout._infolayer
        .selectAll('g.' + constants.containerClassName)
        .data(rangeSliderData, keyFunction);

    // remove exiting sliders and their corresponding clip paths
    rangeSliders.exit().each(function (axisOpts) {
        var opts = axisOpts[constants.name];
        fullLayout._topdefs.select('#' + opts._clipId).remove();
    }).remove();

    // return early if no range slider is visible
    if (rangeSliderData.length === 0) return;

    rangeSliders.enter().append('g')
        .classed(constants.containerClassName, true)
        .attr('pointer-events', 'all');

    // for all present range sliders
    rangeSliders.each(function (axisOpts) {
        var rangeSlider = d3.select(this);
        var opts = axisOpts[constants.name];
        var isVertical = opts._isVertical;
        var resolvedSide = helpers.resolvedSide(axisOpts);

        var oppAxisOpts = fullLayout[axisIDs.id2name(axisOpts.anchor)];
        var oppAxisRangeOpts = opts[axisIDs.id2name(axisOpts.anchor)];

        // update range — expand slider range to include the current axis range
        if (opts.range) {
            var rng = Lib.simpleMap(opts.range, axisOpts.r2l);
            var axRng = Lib.simpleMap(axisOpts.range, axisOpts.r2l);
            var newRng;

            if (axRng[0] < axRng[1]) {
                newRng = [
                    Math.min(rng[0], axRng[0]),
                    Math.max(rng[1], axRng[1])
                ];
            } else {
                newRng = [
                    Math.max(rng[0], axRng[0]),
                    Math.min(rng[1], axRng[1])
                ];
            }

            opts.range = opts._input.range = Lib.simpleMap(newRng, axisOpts.l2r);
        }

        axisOpts.cleanRange('rangeslider.range');

        // update range slider dimensions and position

        var gs = fullLayout._size;
        var domain = axisOpts.domain;
        var x, y;

        if (!isVertical) {
            // Horizontal slider
            opts._width = gs.w * (domain[1] - domain[0]);

            x = Math.round(gs.l + gs.w * domain[0]);

            if (resolvedSide === 'bottom') {
                y = Math.round(
                    gs.t + gs.h * (1 - axisOpts._counterDomainMin) +
                    (axisOpts.side === 'bottom' ? axisOpts._depth : 0) +
                    opts._offsetShift + constants.extraPad
                );
            } else {
                // top
                y = Math.round(
                    gs.t + gs.h * (1 - axisOpts._counterDomainMax) -
                    opts._height -
                    (axisOpts.side === 'top' ? axisOpts._depth : 0) -
                    opts._offsetShift - constants.extraPad
                );
            }
        } else {
            // Vertical slider
            opts._height = gs.h * (domain[1] - domain[0]);

            y = Math.round(gs.t + gs.h * (1 - domain[1]));

            if (resolvedSide === 'left') {
                x = Math.round(
                    gs.l + gs.w * axisOpts._counterDomainMin -
                    opts._width -
                    (axisOpts.side === 'left' ? axisOpts._depth : 0) -
                    opts._offsetShift - constants.extraPad
                );
            } else {
                // right
                x = Math.round(
                    gs.l + gs.w * axisOpts._counterDomainMax +
                    (axisOpts.side === 'right' ? axisOpts._depth : 0) +
                    opts._offsetShift + constants.extraPad
                );
            }
        }

        rangeSlider.attr('transform', strTranslate(x, y));

        // update data <--> pixel coordinate conversion methods
        // For vertical sliders, pixels run top-to-bottom but data runs bottom-to-top,
        // so we invert: pixel 0 = data max, pixel _height = data min.

        opts._rl = Lib.simpleMap(opts.range, axisOpts.r2l);
        var rl0 = opts._rl[0];
        var rl1 = opts._rl[1];
        var drl = rl1 - rl0;

        if (!isVertical) {
            opts.p2d = function (v) {
                return (v / opts._width) * drl + rl0;
            };
            opts.d2p = function (v) {
                return (v - rl0) / drl * opts._width;
            };
        } else {
            // pixel 0 is at the top → data rl1; pixel _height is at bottom → data rl0
            opts.p2d = function (v) {
                return rl1 - (v / opts._height) * drl;
            };
            opts.d2p = function (v) {
                return (rl1 - v) / drl * opts._height;
            };
        }

        if (!isVertical && axisOpts.rangebreaks) {
            var rsBreaks = axisOpts.locateBreaks(rl0, rl1);

            if (rsBreaks.length) {
                var j, brk;

                var lBreaks = 0;
                for (j = 0; j < rsBreaks.length; j++) {
                    brk = rsBreaks[j];
                    lBreaks += (brk.max - brk.min);
                }

                // TODO fix for reversed-range axes !!!

                // compute slope and piecewise offsets
                var m2 = opts._width / (rl1 - rl0 - lBreaks);
                var _B = [-m2 * rl0];
                for (j = 0; j < rsBreaks.length; j++) {
                    brk = rsBreaks[j];
                    _B.push(_B[_B.length - 1] - m2 * (brk.max - brk.min));
                }

                opts.d2p = function (v) {
                    var b = _B[0];
                    for (var j = 0; j < rsBreaks.length; j++) {
                        var brk = rsBreaks[j];
                        if (v >= brk.max) b = _B[j + 1];
                        else if (v < brk.min) break;
                    }
                    return b + m2 * v;
                };

                // fill pixel (i.e. 'p') min/max here,
                // to not have to loop through the _rangebreaks twice during `p2d`
                for (j = 0; j < rsBreaks.length; j++) {
                    brk = rsBreaks[j];
                    brk.pmin = opts.d2p(brk.min);
                    brk.pmax = opts.d2p(brk.max);
                }

                opts.p2d = function (v) {
                    var b = _B[0];
                    for (var j = 0; j < rsBreaks.length; j++) {
                        var brk = rsBreaks[j];
                        if (v >= brk.pmax) b = _B[j + 1];
                        else if (v < brk.pmin) break;
                    }
                    return (v - b) / m2;
                };
            }
        }

        if (oppAxisRangeOpts.rangemode !== 'match') {
            var range0OppAxis = oppAxisOpts.r2l(oppAxisRangeOpts.range[0]);
            var range1OppAxis = oppAxisOpts.r2l(oppAxisRangeOpts.range[1]);
            var distOppAxis = range1OppAxis - range0OppAxis;

            if (!isVertical) {
                // opp axis is y — maps to pixel height (inverted)
                opts.d2pOppAxis = function (v) {
                    return (v - range0OppAxis) / distOppAxis * opts._height;
                };
            } else {
                // opp axis is x — maps to pixel width
                opts.d2pOppAxis = function (v) {
                    return (v - range0OppAxis) / distOppAxis * opts._width;
                };
            }
        }

        // update inner nodes

        rangeSlider
            .call(drawBg, gd, axisOpts, opts)
            .call(addClipPath, gd, axisOpts, opts)
            .call(drawRangePlot, gd, axisOpts, opts)
            .call(drawMasks, gd, axisOpts, opts, oppAxisRangeOpts)
            .call(drawSlideBox, gd, axisOpts, opts)
            .call(drawGrabbers, gd, axisOpts, opts);

        // setup drag element
        setupDragElement(rangeSlider, gd, axisOpts, opts);

        // update current range
        setPixelRange(rangeSlider, gd, axisOpts, opts, oppAxisOpts, oppAxisRangeOpts);

        // title goes next to range slider instead of tick labels, so
        // just take it over and draw it from here
        if (!isVertical && resolvedSide === 'bottom') {
            Titles.draw(gd, axisOpts._id + 'title', {
                propContainer: axisOpts,
                propName: axisOpts._name + '.title.text',
                placeholder: fullLayout._dfltTitle.x,
                attributes: {
                    x: axisOpts._offset + axisOpts._length / 2,
                    y: y + opts._height + opts._offsetShift + 10 + 1.5 * axisOpts.title.font.size,
                    'text-anchor': 'middle'
                }
            });
        }
    });
};

function eventX(event) {
    if (typeof event.clientX === 'number') {
        return event.clientX;
    }
    if (event.touches && event.touches.length > 0) {
        return event.touches[0].clientX;
    }
    return 0;
}

function eventY(event) {
    if (typeof event.clientY === 'number') {
        return event.clientY;
    }
    if (event.touches && event.touches.length > 0) {
        return event.touches[0].clientY;
    }
    return 0;
}

function setupDragElement(rangeSlider, gd, axisOpts, opts) {
    if (gd._context.staticPlot) return;

    var isVertical = opts._isVertical;
    var slideBox = rangeSlider.select('rect.' + constants.slideBoxClassName).node();
    var grabAreaMin = rangeSlider.select('rect.' + constants.grabAreaMinClassName).node();
    var grabAreaMax = rangeSlider.select('rect.' + constants.grabAreaMaxClassName).node();

    function mouseDownHandler() {
        var event = d3.event;
        var target = event.target;
        var bbox = rangeSlider.node().getBoundingClientRect();
        var minVal = opts.d2p(axisOpts._rl[0]);
        var maxVal = opts.d2p(axisOpts._rl[1]);

        var dragCover = dragElement.coverSlip();
        var mouseMove;

        if (!isVertical) {
            // Horizontal slider drag
            var startX = eventX(event);
            var offsetX = startX - bbox.left;

            mouseMove = function (e) {
                var clientX = eventX(e);
                var delta = +clientX - startX;
                var pixelMin, pixelMax, cursor;

                switch (target) {
                    case slideBox:
                        cursor = constants.slideBoxCursorH;
                        if (minVal + delta > axisOpts._length || maxVal + delta < 0) return;
                        pixelMin = minVal + delta;
                        pixelMax = maxVal + delta;
                        break;
                    case grabAreaMin:
                        cursor = constants.grabAreaCursorH;
                        if (minVal + delta > axisOpts._length) return;
                        pixelMin = minVal + delta;
                        pixelMax = maxVal;
                        break;
                    case grabAreaMax:
                        cursor = constants.grabAreaCursorH;
                        if (maxVal + delta < 0) return;
                        pixelMin = minVal;
                        pixelMax = maxVal + delta;
                        break;
                    default:
                        cursor = constants.slideBoxCursorH;
                        pixelMin = offsetX;
                        pixelMax = offsetX + delta;
                        break;
                }

                if (pixelMax < pixelMin) {
                    var tmp = pixelMax; pixelMax = pixelMin; pixelMin = tmp;
                }
                opts._pixelMin = pixelMin;
                opts._pixelMax = pixelMax;
                setCursor(d3.select(dragCover), cursor);
                setDataRange(rangeSlider, gd, axisOpts, opts);
            };
        } else {
            // Vertical slider drag — pixel 0 = top = data max, so invert direction
            var startY = eventY(event);
            var offsetY = startY - bbox.top;

            mouseMove = function (e) {
                var clientY = eventY(e);
                var delta = +clientY - startY;
                var pixelMin, pixelMax, cursor;

                // For vertical: minVal = d2p(rl[0]) = bottom of slider (high pixel value)
                //               maxVal = d2p(rl[1]) = top of slider (low pixel value)
                // So minVal > maxVal in pixel space when data is ascending
                // Grabber-min is at the bottom (high pixel), grabber-max at top (low pixel)
                switch (target) {
                    case slideBox:
                        cursor = constants.slideBoxCursorV;
                        if (minVal + delta > axisOpts._length || maxVal + delta < 0) return;
                        pixelMin = minVal + delta;
                        pixelMax = maxVal + delta;
                        break;
                    case grabAreaMin:
                        // bottom grabber — moves the data minimum
                        cursor = constants.grabAreaCursorV;
                        if (minVal + delta < 0) return;
                        pixelMin = minVal + delta;
                        pixelMax = maxVal;
                        break;
                    case grabAreaMax:
                        // top grabber — moves the data maximum
                        cursor = constants.grabAreaCursorV;
                        if (maxVal + delta > axisOpts._length) return;
                        pixelMin = minVal;
                        pixelMax = maxVal + delta;
                        break;
                    default:
                        cursor = constants.slideBoxCursorV;
                        pixelMin = offsetY;
                        pixelMax = offsetY + delta;
                        break;
                }

                // ensure pixelMin (bottom, high pixel) >= pixelMax (top, low pixel)
                if (pixelMin < pixelMax) {
                    var tmp = pixelMax; pixelMax = pixelMin; pixelMin = tmp;
                }
                opts._pixelMin = pixelMin;
                opts._pixelMax = pixelMax;
                setCursor(d3.select(dragCover), cursor);
                setDataRange(rangeSlider, gd, axisOpts, opts);
            };
        }

        this.addEventListener('touchmove', mouseMove);
        this.addEventListener('touchend', mouseUp);
        dragCover.addEventListener('mousemove', mouseMove);
        dragCover.addEventListener('mouseup', mouseUp);

        function mouseUp() {
            dragCover.removeEventListener('mousemove', mouseMove);
            dragCover.removeEventListener('mouseup', mouseUp);
            this.removeEventListener('touchmove', mouseMove);
            this.removeEventListener('touchend', mouseUp);
            Lib.removeElement(dragCover);
        }
    }

    rangeSlider.on('mousedown', mouseDownHandler);
    rangeSlider.on('touchstart', mouseDownHandler);
}

function setDataRange(rangeSlider, gd, axisOpts, opts) {
    function clamp(v) {
        return axisOpts.l2r(Lib.constrain(v, opts._rl[0], opts._rl[1]));
    }

    var dataMin = clamp(opts.p2d(opts._pixelMin));
    var dataMax = clamp(opts.p2d(opts._pixelMax));

    window.requestAnimationFrame(function () {
        Registry.call('_guiRelayout', gd, axisOpts._name + '.range', [dataMin, dataMax]);
    });
}

function setPixelRange(rangeSlider, gd, axisOpts, opts, oppAxisOpts, oppAxisRangeOpts) {
    var hw2 = constants.handleWidth / 2;
    var isVertical = opts._isVertical;

    if (!isVertical) {
        // ---- Horizontal slider ----
        function clamp(v) { return Lib.constrain(v, 0, opts._width); }
        function clampHandle(v) { return Lib.constrain(v, -hw2, opts._width + hw2); }

        var pixelMin = clamp(opts.d2p(axisOpts._rl[0]));
        var pixelMax = clamp(opts.d2p(axisOpts._rl[1]));

        rangeSlider.select('rect.' + constants.slideBoxClassName)
            .attr('x', pixelMin)
            .attr('width', pixelMax - pixelMin);

        rangeSlider.select('rect.' + constants.maskMinClassName)
            .attr('width', pixelMin);

        rangeSlider.select('rect.' + constants.maskMaxClassName)
            .attr('x', pixelMax)
            .attr('width', opts._width - pixelMax);

        if (oppAxisRangeOpts.rangemode !== 'match') {
            var clampOpp = function (v) { return Lib.constrain(v, 0, opts._height); };
            var pixelMinOpp = opts._height - clampOpp(opts.d2pOppAxis(oppAxisOpts._rl[1]));
            var pixelMaxOpp = opts._height - clampOpp(opts.d2pOppAxis(oppAxisOpts._rl[0]));

            rangeSlider.select('rect.' + constants.maskMinOppAxisClassName)
                .attr('x', pixelMin)
                .attr('height', pixelMinOpp)
                .attr('width', pixelMax - pixelMin);

            rangeSlider.select('rect.' + constants.maskMaxOppAxisClassName)
                .attr('x', pixelMin)
                .attr('y', pixelMaxOpp)
                .attr('height', opts._height - pixelMaxOpp)
                .attr('width', pixelMax - pixelMin);

            rangeSlider.select('rect.' + constants.slideBoxClassName)
                .attr('y', pixelMinOpp)
                .attr('height', pixelMaxOpp - pixelMinOpp);
        }

        // add offset for crispier corners
        var offset = 0.5;
        var xMin = Math.round(clampHandle(pixelMin - hw2)) - offset;
        var xMax = Math.round(clampHandle(pixelMax - hw2)) + offset;

        rangeSlider.select('g.' + constants.grabberMinClassName)
            .attr('transform', strTranslate(xMin, offset));
        rangeSlider.select('g.' + constants.grabberMaxClassName)
            .attr('transform', strTranslate(xMax, offset));

    } else {
        // ---- Vertical slider ----
        // d2p maps data → pixel; rl[0]=dataMin → high pixel (bottom), rl[1]=dataMax → low pixel (top)
        function clampV(v) { return Lib.constrain(v, 0, opts._height); }
        function clampHandleV(v) { return Lib.constrain(v, -hw2, opts._height + hw2); }

        // pixelMin = pixel position of data minimum (bottom of slide box)
        // pixelMax = pixel position of data maximum (top of slide box)
        var pixelBottom = clampV(opts.d2p(axisOpts._rl[0])); // high pixel value
        var pixelTop = clampV(opts.d2p(axisOpts._rl[1]));    // low pixel value

        rangeSlider.select('rect.' + constants.slideBoxClassName)
            .attr('y', pixelTop)
            .attr('height', pixelBottom - pixelTop);

        // maskMin covers from y=0 (very top) down to pixelTop (top of viewport)
        rangeSlider.select('rect.' + constants.maskMinClassName)
            .attr('height', pixelTop);

        // maskMax covers from pixelBottom down to opts._height (very bottom)
        rangeSlider.select('rect.' + constants.maskMaxClassName)
            .attr('y', pixelBottom)
            .attr('height', opts._height - pixelBottom);

        if (oppAxisRangeOpts.rangemode !== 'match') {
            var clampOppV = function (v) { return Lib.constrain(v, 0, opts._width); };
            var pixelLeftOpp = clampOppV(opts.d2pOppAxis(oppAxisOpts._rl[0]));
            var pixelRightOpp = clampOppV(opts.d2pOppAxis(oppAxisOpts._rl[1]));

            rangeSlider.select('rect.' + constants.maskMinOppAxisClassName)
                .attr('y', pixelTop)
                .attr('width', pixelLeftOpp)
                .attr('height', pixelBottom - pixelTop);

            rangeSlider.select('rect.' + constants.maskMaxOppAxisClassName)
                .attr('y', pixelTop)
                .attr('x', pixelRightOpp)
                .attr('width', opts._width - pixelRightOpp)
                .attr('height', pixelBottom - pixelTop);

            rangeSlider.select('rect.' + constants.slideBoxClassName)
                .attr('x', pixelLeftOpp)
                .attr('width', pixelRightOpp - pixelLeftOpp);
        }

        var offsetV = 0.5;
        // grabber-min at the bottom (pixelBottom), grabber-max at the top (pixelTop)
        var yMin = Math.round(clampHandleV(pixelBottom - hw2)) - offsetV;
        var yMax = Math.round(clampHandleV(pixelTop - hw2)) + offsetV;

        rangeSlider.select('g.' + constants.grabberMinClassName)
            .attr('transform', strTranslate(offsetV, yMin));
        rangeSlider.select('g.' + constants.grabberMaxClassName)
            .attr('transform', strTranslate(offsetV, yMax));
    }
}

function drawBg(rangeSlider, gd, axisOpts, opts) {
    var bg = Lib.ensureSingle(rangeSlider, 'rect', constants.bgClassName, function (s) {
        s.attr({
            x: 0,
            y: 0,
            'shape-rendering': 'crispEdges'
        });
    });

    var borderCorrect = (opts.borderwidth % 2) === 0 ?
        opts.borderwidth :
        opts.borderwidth - 1;

    var offsetShift = -opts._offsetShift;
    var lw = Drawing.crispRound(gd, opts.borderwidth);

    bg.attr({
        width: opts._width + borderCorrect,
        height: opts._height + borderCorrect,
        transform: strTranslate(offsetShift, offsetShift),
        'stroke-width': lw
    })
        .call(Color.stroke, opts.bordercolor)
        .call(Color.fill, opts.bgcolor);
}

function addClipPath(rangeSlider, gd, axisOpts, opts) {
    var fullLayout = gd._fullLayout;

    var clipPath = Lib.ensureSingleById(fullLayout._topdefs, 'clipPath', opts._clipId, function (s) {
        s.append('rect').attr({ x: 0, y: 0 });
    });

    clipPath.select('rect').attr({
        width: opts._width,
        height: opts._height
    });
}

function drawRangePlot(rangeSlider, gd, axisOpts, opts) {
    var calcData = gd.calcdata;
    var isVertical = opts._isVertical;

    var rangePlots = rangeSlider.selectAll('g.' + constants.rangePlotClassName)
        .data(axisOpts._subplotsWith, Lib.identity);

    rangePlots.enter().append('g')
        .attr('class', function (id) { return constants.rangePlotClassName + ' ' + id; })
        .call(Drawing.setClipUrl, opts._clipId, gd);

    rangePlots.order();

    rangePlots.exit().remove();

    var mainplotinfo;

    rangePlots.each(function (id, i) {
        var plotgroup = d3.select(this);
        var isMainPlot = (i === 0);

        var mockFigure, xa, ya;

        if (!isVertical) {
            // Horizontal slider: axisOpts is xaxis, opp is yaxis
            var oppAxisOpts = axisIDs.getFromId(gd, id, 'y');
            var oppAxisName = oppAxisOpts._name;
            var oppAxisRangeOpts = opts[oppAxisName];

            mockFigure = {
                data: [],
                layout: {
                    xaxis: {
                        type: axisOpts.type,
                        domain: [0, 1],
                        range: opts.range.slice(),
                        calendar: axisOpts.calendar
                    },
                    width: opts._width,
                    height: opts._height,
                    margin: { t: 0, b: 0, l: 0, r: 0 }
                },
                _context: gd._context
            };

            if (axisOpts.rangebreaks) {
                mockFigure.layout.xaxis.rangebreaks = axisOpts.rangebreaks;
            }

            mockFigure.layout[oppAxisName] = {
                type: oppAxisOpts.type,
                domain: [0, 1],
                range: oppAxisRangeOpts.rangemode !== 'match' ? oppAxisRangeOpts.range.slice() : oppAxisOpts.range.slice(),
                calendar: oppAxisOpts.calendar
            };

            if (oppAxisOpts.rangebreaks) {
                mockFigure.layout[oppAxisName].rangebreaks = oppAxisOpts.rangebreaks;
            }

            Plots.supplyDefaults(mockFigure);

            xa = mockFigure._fullLayout.xaxis;
            ya = mockFigure._fullLayout[oppAxisName];
        } else {
            // Vertical slider: axisOpts is yaxis, opp is xaxis
            var oppXAxisOpts = axisIDs.getFromId(gd, id, 'x');
            var oppXAxisName = oppXAxisOpts._name;
            var oppXAxisRangeOpts = opts[oppXAxisName];

            mockFigure = {
                data: [],
                layout: {
                    yaxis: {
                        type: axisOpts.type,
                        domain: [0, 1],
                        range: opts.range.slice(),
                        calendar: axisOpts.calendar
                    },
                    width: opts._width,
                    height: opts._height,
                    margin: { t: 0, b: 0, l: 0, r: 0 }
                },
                _context: gd._context
            };

            if (axisOpts.rangebreaks) {
                mockFigure.layout.yaxis.rangebreaks = axisOpts.rangebreaks;
            }

            mockFigure.layout[oppXAxisName] = {
                type: oppXAxisOpts.type,
                domain: [0, 1],
                range: oppXAxisRangeOpts.rangemode !== 'match' ? oppXAxisRangeOpts.range.slice() : oppXAxisOpts.range.slice(),
                calendar: oppXAxisOpts.calendar
            };

            if (oppXAxisOpts.rangebreaks) {
                mockFigure.layout[oppXAxisName].rangebreaks = oppXAxisOpts.rangebreaks;
            }

            Plots.supplyDefaults(mockFigure);

            ya = mockFigure._fullLayout.yaxis;
            xa = mockFigure._fullLayout[oppXAxisName];
        }

        xa.clearCalc();
        xa.setScale();
        ya.clearCalc();
        ya.setScale();

        var plotinfo = {
            id: id,
            plotgroup: plotgroup,
            xaxis: xa,
            yaxis: ya,
            isRangePlot: true
        };

        if (isMainPlot) mainplotinfo = plotinfo;
        else {
            plotinfo.mainplot = 'xy';
            plotinfo.mainplotinfo = mainplotinfo;
        }

        Cartesian.rangePlot(gd, plotinfo, filterRangePlotCalcData(calcData, id));
    });
}

function filterRangePlotCalcData(calcData, subplotId) {
    var out = [];

    for (var i = 0; i < calcData.length; i++) {
        var calcTrace = calcData[i];
        var trace = calcTrace[0].trace;

        if (trace.xaxis + trace.yaxis === subplotId) {
            out.push(calcTrace);
        }
    }

    return out;
}

function drawMasks(rangeSlider, gd, axisOpts, opts, oppAxisRangeOpts) {
    var isVertical = opts._isVertical;

    if (!isVertical) {
        // Horizontal: mask-min on left, mask-max on right, full height
        var maskMin = Lib.ensureSingle(rangeSlider, 'rect', constants.maskMinClassName, function (s) {
            s.attr({ x: 0, y: 0, 'shape-rendering': 'crispEdges' });
        });
        maskMin.attr('height', opts._height).call(Color.fill, constants.maskColor);

        var maskMax = Lib.ensureSingle(rangeSlider, 'rect', constants.maskMaxClassName, function (s) {
            s.attr({ y: 0, 'shape-rendering': 'crispEdges' });
        });
        maskMax.attr('height', opts._height).call(Color.fill, constants.maskColor);

        if (oppAxisRangeOpts.rangemode !== 'match') {
            var maskMinOppAxis = Lib.ensureSingle(rangeSlider, 'rect', constants.maskMinOppAxisClassName, function (s) {
                s.attr({ y: 0, 'shape-rendering': 'crispEdges' });
            });
            maskMinOppAxis.attr('width', opts._width).call(Color.fill, constants.maskOppAxisColor);

            var maskMaxOppAxis = Lib.ensureSingle(rangeSlider, 'rect', constants.maskMaxOppAxisClassName, function (s) {
                s.attr({ y: 0, 'shape-rendering': 'crispEdges' });
            });
            maskMaxOppAxis.attr('width', opts._width).call(Color.fill, constants.maskOppAxisColor);
        }
    } else {
        // Vertical: mask-min on top, mask-max on bottom, full width
        var maskMinV = Lib.ensureSingle(rangeSlider, 'rect', constants.maskMinClassName, function (s) {
            s.attr({ x: 0, y: 0, 'shape-rendering': 'crispEdges' });
        });
        maskMinV.attr('width', opts._width).call(Color.fill, constants.maskColor);

        var maskMaxV = Lib.ensureSingle(rangeSlider, 'rect', constants.maskMaxClassName, function (s) {
            s.attr({ x: 0, 'shape-rendering': 'crispEdges' });
        });
        maskMaxV.attr('width', opts._width).call(Color.fill, constants.maskColor);

        if (oppAxisRangeOpts.rangemode !== 'match') {
            var maskMinOppAxisV = Lib.ensureSingle(rangeSlider, 'rect', constants.maskMinOppAxisClassName, function (s) {
                s.attr({ x: 0, 'shape-rendering': 'crispEdges' });
            });
            maskMinOppAxisV.attr('height', opts._height).call(Color.fill, constants.maskOppAxisColor);

            var maskMaxOppAxisV = Lib.ensureSingle(rangeSlider, 'rect', constants.maskMaxOppAxisClassName, function (s) {
                s.attr({ x: 0, 'shape-rendering': 'crispEdges' });
            });
            maskMaxOppAxisV.attr('height', opts._height).call(Color.fill, constants.maskOppAxisColor);
        }
    }
}

function drawSlideBox(rangeSlider, gd, axisOpts, opts) {
    if (gd._context.staticPlot) return;

    var isVertical = opts._isVertical;
    var cursor = isVertical ? constants.slideBoxCursorV : constants.slideBoxCursorH;

    var slideBox = Lib.ensureSingle(rangeSlider, 'rect', constants.slideBoxClassName, function (s) {
        s.attr({
            'shape-rendering': 'crispEdges'
        });
    });

    if (!isVertical) {
        slideBox.attr({
            y: 0,
            cursor: cursor,
            height: opts._height,
            fill: constants.slideBoxFill
        });
    } else {
        slideBox.attr({
            x: 0,
            cursor: cursor,
            width: opts._width,
            fill: constants.slideBoxFill
        });
    }
}

function drawGrabbers(rangeSlider, gd, axisOpts, opts) {
    var isVertical = opts._isVertical;

    // <g grabber />
    var grabberMin = Lib.ensureSingle(rangeSlider, 'g', constants.grabberMinClassName);
    var grabberMax = Lib.ensureSingle(rangeSlider, 'g', constants.grabberMaxClassName);

    if (!isVertical) {
        // Horizontal: vertical bar handles, horizontal grab areas
        var handleFixAttrs = {
            x: 0,
            width: constants.handleWidth,
            rx: constants.handleRadius,
            fill: Color.background,
            stroke: Color.defaultLine,
            'stroke-width': constants.handleStrokeWidth,
            'shape-rendering': 'crispEdges'
        };
        var handleDynamicAttrs = {
            y: Math.round(opts._height / 4),
            height: Math.round(opts._height / 2)
        };

        var handleMin = Lib.ensureSingle(grabberMin, 'rect', constants.handleMinClassName, function (s) {
            s.attr(handleFixAttrs);
        });
        handleMin.attr(handleDynamicAttrs);

        var handleMax = Lib.ensureSingle(grabberMax, 'rect', constants.handleMaxClassName, function (s) {
            s.attr(handleFixAttrs);
        });
        handleMax.attr(handleDynamicAttrs);

        var grabAreaFixAttrs = {
            width: constants.grabAreaWidth,
            x: 0,
            y: 0,
            fill: constants.grabAreaFill,
            cursor: !gd._context.staticPlot ? constants.grabAreaCursorH : undefined
        };

        var grabAreaMin = Lib.ensureSingle(grabberMin, 'rect', constants.grabAreaMinClassName, function (s) {
            s.attr(grabAreaFixAttrs);
        });
        grabAreaMin.attr('height', opts._height);

        var grabAreaMax = Lib.ensureSingle(grabberMax, 'rect', constants.grabAreaMaxClassName, function (s) {
            s.attr(grabAreaFixAttrs);
        });
        grabAreaMax.attr('height', opts._height);

    } else {
        // Vertical: horizontal bar handles, vertical grab areas
        var handleFixAttrsV = {
            y: 0,
            height: constants.handleWidth,
            ry: constants.handleRadius,
            fill: Color.background,
            stroke: Color.defaultLine,
            'stroke-width': constants.handleStrokeWidth,
            'shape-rendering': 'crispEdges'
        };
        var handleDynamicAttrsV = {
            x: Math.round(opts._width / 4),
            width: Math.round(opts._width / 2)
        };

        var handleMinV = Lib.ensureSingle(grabberMin, 'rect', constants.handleMinClassName, function (s) {
            s.attr(handleFixAttrsV);
        });
        handleMinV.attr(handleDynamicAttrsV);

        var handleMaxV = Lib.ensureSingle(grabberMax, 'rect', constants.handleMaxClassName, function (s) {
            s.attr(handleFixAttrsV);
        });
        handleMaxV.attr(handleDynamicAttrsV);

        var grabAreaFixAttrsV = {
            height: constants.grabAreaHeight,
            x: 0,
            y: 0,
            fill: constants.grabAreaFill,
            cursor: !gd._context.staticPlot ? constants.grabAreaCursorV : undefined
        };

        var grabAreaMinV = Lib.ensureSingle(grabberMin, 'rect', constants.grabAreaMinClassName, function (s) {
            s.attr(grabAreaFixAttrsV);
        });
        grabAreaMinV.attr('width', opts._width);

        var grabAreaMaxV = Lib.ensureSingle(grabberMax, 'rect', constants.grabAreaMaxClassName, function (s) {
            s.attr(grabAreaFixAttrsV);
        });
        grabAreaMaxV.attr('width', opts._width);
    }
}
