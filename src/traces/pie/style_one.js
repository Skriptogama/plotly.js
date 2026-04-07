'use strict';

var BlendMode = require('../../lib/blend_mode');
var Color = require('../../components/color');
var castOption = require('./helpers').castOption;
var fillOne = require('./fill_one');

module.exports = function styleOne(s, pt, trace, gd) {
    var line = trace.marker.line;
    var lineColor = castOption(line.color, pt.pts) || Color.defaultLine;
    var lineWidth = castOption(line.width, pt.pts) || 0;

    s.call(BlendMode.applySingleStyle, BlendMode.getContainerBlendMode(trace, trace.marker, 'marker'), pt.i, BlendMode.getTraceBlendMode(trace))
        .call(fillOne, pt, trace, gd)
        .style('stroke-width', lineWidth)
        .call(Color.stroke, lineColor);
};
