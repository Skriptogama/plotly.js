'use strict';

var d3 = require('@plotly/d3');
var BlendMode = require('../../lib/blend_mode');
var Color = require('../../components/color');
var stylePoints = require('../scatter/style').stylePoints;

module.exports = function style(gd) {
    var s = d3.select(gd).selectAll('g.trace.violins');

    s.style('opacity', function (d) { return d[0].trace.opacity; });

    s.each(function (d) {
        var trace = d[0].trace;
        var sel = d3.select(this);
        var box = trace.box || {};
        var boxLine = box.line || {};
        var meanline = trace.meanline || {};
        var meanLineWidth = meanline.width;

        sel.selectAll('path.violin')
            .call(BlendMode.applyStyle, trace.fillblendmode || trace.line.blendmode || trace.blendmode)
            .style('stroke-width', trace.line.width + 'px')
            .call(Color.stroke, trace.line.color)
            .call(Color.fill, trace.fillcolor);

        sel.selectAll('path.box')
            .call(BlendMode.applyStyle, box.fillblendmode || boxLine.blendmode || trace.blendmode)
            .style('stroke-width', boxLine.width + 'px')
            .call(Color.stroke, boxLine.color)
            .call(Color.fill, box.fillcolor);

        var meanLineStyle = {
            'stroke-width': meanLineWidth + 'px',
            'stroke-dasharray': (2 * meanLineWidth) + 'px,' + meanLineWidth + 'px'
        };

        sel.selectAll('path.mean')
            .call(BlendMode.applyStyle, meanline.blendmode || trace.line.blendmode || trace.blendmode)
            .style(meanLineStyle)
            .call(Color.stroke, meanline.color);

        sel.selectAll('path.meanline')
            .call(BlendMode.applyStyle, meanline.blendmode || trace.line.blendmode || trace.blendmode)
            .style(meanLineStyle)
            .call(Color.stroke, meanline.color);

        stylePoints(sel, trace, gd);
    });
};
