'use strict';

var d3 = require('@plotly/d3');

var Color = require('../color');
var BlendMode = require('../../lib/blend_mode');
var Drawing = require('../drawing');


module.exports = function style(traces) {
    traces.each(function (d) {
        var trace = d[0].trace;
        var yObj = trace.error_y || {};
        var xObj = trace.error_x || {};

        var s = d3.select(this);

        var yBlend = BlendMode.getContainerBlendMode(trace, yObj, 'error_y');
        var yDash = Drawing.dashStyle(yObj.dash, yObj.thickness, yObj.cap) || null;
        var yCap = Drawing.lineCapStyle(yObj.cap) || null;

        s.selectAll('path.yerror, path.yerror-plus')
            .call(BlendMode.applyStyle, yBlend)
            .style('stroke-width', yObj.thickness + 'px')
            .call(Color.stroke, yObj.color);

        s.selectAll('path.yerror-minus')
            .call(BlendMode.applyStyle, yBlend)
            .style('stroke-width', yObj.thickness + 'px')
            .call(Color.stroke, yObj.colorminus || yObj.color);

        s.selectAll('path.yerror, path.yerror-plus, path.yerror-minus')
            .style('stroke-dasharray', yDash)
            .style('stroke-linecap', yCap);

        if (xObj.copy_ystyle) xObj = yObj;

        var xBlend = BlendMode.getContainerBlendMode(trace, xObj, 'error_x');
        var xDash = Drawing.dashStyle(xObj.dash, xObj.thickness, xObj.cap) || null;
        var xCap = Drawing.lineCapStyle(xObj.cap) || null;

        s.selectAll('path.xerror, path.xerror-plus')
            .call(BlendMode.applyStyle, xBlend)
            .style('stroke-width', xObj.thickness + 'px')
            .call(Color.stroke, xObj.color);

        s.selectAll('path.xerror-minus')
            .call(BlendMode.applyStyle, xBlend)
            .style('stroke-width', xObj.thickness + 'px')
            .call(Color.stroke, xObj.colorminus || xObj.color);

        s.selectAll('path.xerror, path.xerror-plus, path.xerror-minus')
            .style('stroke-dasharray', xDash)
            .style('stroke-linecap', xCap);
    });
};
