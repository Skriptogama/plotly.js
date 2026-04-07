'use strict';

var d3 = require('@plotly/d3');

var BlendMode = require('../../lib/blend_mode');
var Drawing = require('../../components/drawing');
var Color = require('../../components/color');
var DESELECTDIM = require('../../constants/interactions').DESELECTDIM;
var barStyle = require('../bar/style');
var resizeText = require('../bar/uniform_text').resizeText;
var styleTextPoints = barStyle.styleTextPoints;

function style(gd, cd, sel) {
    var s = sel ? sel : d3.select(gd).selectAll('g[class^="waterfalllayer"]').selectAll('g.trace');
    resizeText(gd, s, 'waterfall');

    s.style('opacity', function (d) { return d[0].trace.opacity; });

    s.each(function (d) {
        var gTrace = d3.select(this);
        var trace = d[0].trace;

        gTrace.selectAll('.point > path').each(function (di) {
            if (!di.isBlank) {
                var cont = trace[di.dir].marker;

                d3.select(this)
                    .call(BlendMode.applySingleStyle, cont.blendmode || trace.blendmode)
                    .call(Color.fill, cont.color)
                    .call(Color.stroke, cont.line.color)
                    .call(Drawing.dashLine, cont.line.dash, cont.line.width)
                    .style('opacity', trace.selectedpoints && !di.selected ? DESELECTDIM : 1);
            }
        });

        styleTextPoints(gTrace, trace, gd);

        gTrace.selectAll('.lines').each(function () {
            var cont = trace.connector.line;
            d3.select(this).selectAll('path')
                .call(BlendMode.applyStyle, cont.blendmode || trace.blendmode)
                .style('fill', 'none')
                .call(Color.stroke, cont.color)
                .call(Drawing.dashLine, cont.dash, cont.width);
        });
    });
}

module.exports = {
    style: style
};
