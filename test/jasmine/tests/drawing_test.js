var d3Select = require('../../strict-d3').select;
var Plotly = require('../../../lib/index');
var Drawing = require('../../../src/components/drawing');
var svgTextUtils = require('../../../src/lib/svg_text_utils');
var createGraphDiv = require('../assets/create_graph_div');
var destroyGraphDiv = require('../assets/destroy_graph_div');


describe('Drawing', function () {
    'use strict';

    describe('setClipUrl', function () {
        beforeEach(function () {
            this.svg = d3Select('body').append('svg');
            this.g = this.svg.append('g');
        });

        afterEach(function () {
            this.svg.remove();
            this.g.remove();
        });

        it('should set the clip-path attribute', function () {
            expect(this.g.attr('clip-path')).toBe(null);

            Drawing.setClipUrl(this.g, 'id1', { _context: {} });

            expect(this.g.attr('clip-path')).toEqual('url(#id1)');
        });

        it('should unset the clip-path if arg is falsy', function () {
            this.g.attr('clip-path', 'url(\'#id2\')');

            Drawing.setClipUrl(this.g, false);

            expect(this.g.attr('clip-path')).toBe(null);
        });

        it('should append window URL to clip-path if <base> is present', function () {
            // append <base> with href
            var base = d3Select('body')
                .append('base')
                .attr('href', 'https://chart-studio.plotly.com');

            // grab window URL
            var href = window.location.href;

            Drawing.setClipUrl(this.g, 'id3', { _context: { _baseUrl: href } });

            expect(this.g.attr('clip-path'))
                .toEqual('url(\'' + href + '#id3\')');

            base.remove();
        });

        it('should append window URL w/o hash to clip-path if <base> is present', function () {
            var base = d3Select('body')
                .append('base')
                .attr('href', 'https://chart-studio.plotly.com/#hash');

            window.location.hash = 'hash';
            var href = window.location.href;
            var href2 = href.split('#')[0];

            Drawing.setClipUrl(this.g, 'id4', { _context: { _baseUrl: href2 } });

            var expected = 'url(\'' + href2 + '#id4\')';

            expect(this.g.attr('clip-path')).toEqual(expected);

            base.remove();
            window.location.hash = '';
        });
    });

    describe('getTranslate', function () {
        it('should work with regular DOM elements', function () {
            var el = document.createElement('div');

            expect(Drawing.getTranslate(el)).toEqual({ x: 0, y: 0 });

            el.setAttribute('transform', 'translate(123.45px,67)');
            expect(Drawing.getTranslate(el)).toEqual({ x: 123.45, y: 67 });

            el.setAttribute('transform', 'translate(123.45)');
            expect(Drawing.getTranslate(el)).toEqual({ x: 123.45, y: 0 });

            el.setAttribute('transform', 'translate(1,2)');
            expect(Drawing.getTranslate(el)).toEqual({ x: 1, y: 2 });

            el.setAttribute('transform', 'translate(1,2); rotate(20deg)');
            expect(Drawing.getTranslate(el)).toEqual({ x: 1, y: 2 });

            el.setAttribute('transform', 'rotate(20deg)translate(1,2);');
            expect(Drawing.getTranslate(el)).toEqual({ x: 1, y: 2 });

            el.setAttribute('transform', 'rotate(20deg)');
            expect(Drawing.getTranslate(el)).toEqual({ x: 0, y: 0 });
        });

        it('should work with d3 elements', function () {
            var el = d3Select(document.createElement('div'));

            el.attr('transform', 'translate(123.45px,67)');
            expect(Drawing.getTranslate(el)).toEqual({ x: 123.45, y: 67 });

            el.attr('transform', 'translate(123.45)');
            expect(Drawing.getTranslate(el)).toEqual({ x: 123.45, y: 0 });

            el.attr('transform', 'translate(1,2)');
            expect(Drawing.getTranslate(el)).toEqual({ x: 1, y: 2 });

            el.attr('transform', 'translate(1,2); rotate(20)');
            expect(Drawing.getTranslate(el)).toEqual({ x: 1, y: 2 });

            el.attr('transform', 'rotate(20)');
            expect(Drawing.getTranslate(el)).toEqual({ x: 0, y: 0 });
        });

        it('should work with negative values', function () {
            var el = document.createElement('div');
            var el3 = d3Select(document.createElement('div'));

            expect(Drawing.getTranslate(el)).toEqual({ x: 0, y: 0 });

            var testCases = [
                { transform: 'translate(-123.45px,-67)', x: -123.45, y: -67 },
                { transform: 'translate(-123.45px,67)', x: -123.45, y: 67 },
                { transform: 'translate(123.45px,-67)', x: 123.45, y: -67 },
                { transform: 'translate(-123.45)', x: -123.45, y: 0 },
                { transform: 'translate(-1,-2)', x: -1, y: -2 },
                { transform: 'translate(-1,2)', x: -1, y: 2 },
                { transform: 'translate(1,-2)', x: 1, y: -2 },
                { transform: 'translate(-1,-2); rotate(20deg)', x: -1, y: -2 },
                { transform: 'translate(-1,2); rotate(20deg)', x: -1, y: 2 },
                { transform: 'translate(1,-2); rotate(20deg)', x: 1, y: -2 },
                { transform: 'rotate(20deg)translate(-1,-2);', x: -1, y: -2 },
                { transform: 'rotate(20deg)translate(-1,2);', x: -1, y: 2 },
                { transform: 'rotate(20deg)translate(1,-2);', x: 1, y: -2 }
            ];

            for (var i = 0; i < testCases.length; i++) {
                var testCase = testCases[i];
                var transform = testCase.transform;
                var x = testCase.x;
                var y = testCase.y;

                el.setAttribute('transform', transform);
                expect(Drawing.getTranslate(el)).toEqual({ x: x, y: y });

                el3.attr('transform', transform);
                expect(Drawing.getTranslate(el)).toEqual({ x: x, y: y });
            }
        });
    });

    describe('setTranslate', function () {
        it('should work with regular DOM elements', function () {
            var el = document.createElement('div');

            Drawing.setTranslate(el, 5);
            expect(el.getAttribute('transform')).toBe('translate(5,0)');

            Drawing.setTranslate(el, 10, 20);
            expect(el.getAttribute('transform')).toBe('translate(10,20)');

            Drawing.setTranslate(el);
            expect(el.getAttribute('transform')).toBe('');

            el.setAttribute('transform', 'rotate(30)');
            Drawing.setTranslate(el, 30, 40);
            expect(el.getAttribute('transform')).toBe('rotate(30)translate(30,40)');
        });

        it('should work with d3 elements', function () {
            var el = d3Select(document.createElement('div'));

            Drawing.setTranslate(el, 5);
            expect(el.attr('transform')).toBe('translate(5,0)');

            Drawing.setTranslate(el, 30, 40);
            expect(el.attr('transform')).toBe('translate(30,40)');

            Drawing.setTranslate(el);
            expect(el.attr('transform')).toBe('');

            el.attr('transform', 'rotate(30)');
            Drawing.setTranslate(el, 30, 40);
            expect(el.attr('transform')).toBe('rotate(30)translate(30,40)');
        });
    });

    describe('getScale', function () {
        it('should work with regular DOM elements', function () {
            var el = document.createElement('div');

            expect(Drawing.getScale(el)).toEqual({ x: 1, y: 1 });

            el.setAttribute('transform', 'scale(1.23, 45)');
            expect(Drawing.getScale(el)).toEqual({ x: 1.23, y: 45 });

            el.setAttribute('transform', 'scale(123.45)');
            expect(Drawing.getScale(el)).toEqual({ x: 123.45, y: 1 });

            el.setAttribute('transform', 'scale(0.1,2)');
            expect(Drawing.getScale(el)).toEqual({ x: 0.1, y: 2 });

            el.setAttribute('transform', 'scale(0.1,2); rotate(20deg)');
            expect(Drawing.getScale(el)).toEqual({ x: 0.1, y: 2 });

            el.setAttribute('transform', 'rotate(20deg)scale(0.1,2);');
            expect(Drawing.getScale(el)).toEqual({ x: 0.1, y: 2 });

            el.setAttribute('transform', 'rotate(20deg)');
            expect(Drawing.getScale(el)).toEqual({ x: 1, y: 1 });
        });

        it('should work with d3 elements', function () {
            var el = d3Select(document.createElement('div'));

            el.attr('transform', 'scale(1.23,45)');
            expect(Drawing.getScale(el)).toEqual({ x: 1.23, y: 45 });

            el.attr('transform', 'scale(123.45)');
            expect(Drawing.getScale(el)).toEqual({ x: 123.45, y: 1 });

            el.attr('transform', 'scale(0.1,2)');
            expect(Drawing.getScale(el)).toEqual({ x: 0.1, y: 2 });

            el.attr('transform', 'scale(0.1,2); rotate(20)');
            expect(Drawing.getScale(el)).toEqual({ x: 0.1, y: 2 });

            el.attr('transform', 'rotate(20)');
            expect(Drawing.getScale(el)).toEqual({ x: 1, y: 1 });
        });
    });

    describe('setScale', function () {
        it('should work with regular DOM elements', function () {
            var el = document.createElement('div');

            Drawing.setScale(el, 5);
            expect(el.getAttribute('transform')).toBe('scale(5,1)');

            Drawing.setScale(el, 30, 40);
            expect(el.getAttribute('transform')).toBe('scale(30,40)');

            Drawing.setScale(el);
            expect(el.getAttribute('transform')).toBe('scale(1,1)');

            el.setAttribute('transform', 'scale(1,1); rotate(30)');
            Drawing.setScale(el, 30, 40);
            expect(el.getAttribute('transform')).toBe('rotate(30)scale(30,40)');
        });

        it('should work with d3 elements', function () {
            var el = d3Select(document.createElement('div'));

            Drawing.setScale(el, 5);
            expect(el.attr('transform')).toBe('scale(5,1)');

            Drawing.setScale(el, 30, 40);
            expect(el.attr('transform')).toBe('scale(30,40)');

            Drawing.setScale(el);
            expect(el.attr('transform')).toBe('scale(1,1)');

            el.attr('transform', 'scale(0,0); rotate(30)');
            Drawing.setScale(el, 30, 40);
            expect(el.attr('transform')).toBe('rotate(30)scale(30,40)');
        });
    });

    describe('setPointGroupScale', function () {
        var el, sel;

        beforeEach(function () {
            el = document.createElement('div');
            sel = d3Select(el);
        });

        it('sets the scale of a point', function () {
            Drawing.setPointGroupScale(sel, 2, 2);
            expect(el.getAttribute('transform')).toBe('scale(2,2)');
        });

        it('appends the scale of a point', function () {
            el.setAttribute('transform', 'translate(1,2)');
            Drawing.setPointGroupScale(sel, 2, 2);
            expect(el.getAttribute('transform')).toBe('translate(1,2)scale(2,2)');
        });

        it('modifies the scale of a point', function () {
            el.setAttribute('transform', 'translate(1,2)scale(3,4)');
            Drawing.setPointGroupScale(sel, 2, 2);
            expect(el.getAttribute('transform')).toBe('translate(1,2)scale(2,2)');
        });

        it('does not apply the scale of a point if scale (1,1)', function () {
            el.setAttribute('transform', 'translate(1,2)');
            Drawing.setPointGroupScale(sel, 1, 1);
            expect(el.getAttribute('transform')).toBe('translate(1,2)');
        });

        it('removes the scale of a point if scale (1,1)', function () {
            el.setAttribute('transform', 'translate(1,2)scale(3,4)');
            Drawing.setPointGroupScale(sel, 1, 1);
            expect(el.getAttribute('transform')).toBe('translate(1,2)');
        });
    });

    describe('setTextPointsScale', function () {
        var svg, g, text;

        beforeEach(function () {
            svg = d3Select(document.createElement('svg'));
            g = svg.append('g');
            text = g.append('text');
        });

        it('sets the transform on an empty element', function () {
            Drawing.setTextPointsScale(g, 2, 3);
            expect(g.attr('transform')).toEqual('scale(2,3)');
        });

        it('unsets the transform', function () {
            Drawing.setTextPointsScale(g, 1, 1);
            expect(g.attr('transform')).toEqual('');
        });

        it('preserves a leading translate', function () {
            Drawing.setTextPointsScale(g, 1, 1);
            g.attr('transform', 'translate(1,2)');
            expect(g.attr('transform')).toEqual('translate(1,2)');
        });

        it('preserves transforms', function () {
            text.attr('x', 8);
            text.attr('y', 9);
            g.attr('transform', 'translate(1,2)');
            Drawing.setTextPointsScale(g, 4, 5);
            expect(g.attr('transform')).toEqual('translate(8,9)scale(4,5)translate(-8,-9)translate(1,2)');
        });

        it('should not break when <text> is not present', function () {
            text.remove();
            expect(function () { Drawing.setTextPointsScale(g, 4, 5); }).not.toThrow();
        });
    });

    describe('bBox', function () {
        afterEach(destroyGraphDiv);

        function assertBBox(actual, expected) {
            [
                'height', 'top', 'bottom',
                'width', 'left', 'right'
            ].forEach(function (dim) {
                // give larger dimensions some extra tolerance
                var tol = Math.max(expected[dim] / 10, 5.5);
                expect(actual[dim]).toBeWithin(expected[dim], tol, dim);
            });
        }

        it('should update bounding box dimension on window scroll', function (done) {
            var gd = createGraphDiv();

            // allow page to scroll
            gd.style.position = 'static';

            Plotly.newPlot(gd, [{
                y: [1, 2, 1]
            }], {
                annotations: [{
                    text: 'hello'
                }],
                height: window.innerHeight * 2,
                width: 500
            })
                .then(function () {
                    var node = d3Select('text.annotation-text').node();
                    assertBBox(Drawing.bBox(node), {
                        height: 14,
                        width: 27.671875,
                        left: -13.671875,
                        top: -11,
                        right: 14,
                        bottom: 3
                    });

                    window.scroll(0, 200);
                    return Plotly.relayout(gd, 'annotations[0].text', 'HELLO');
                })
                .then(function () {
                    var node = d3Select('text.annotation-text').node();
                    assertBBox(Drawing.bBox(node), {
                        height: 14,
                        width: 41.015625,
                        left: -20.671875,
                        top: -11,
                        right: 20.34375,
                        bottom: 3
                    });

                    window.scroll(200, 0);
                    return Plotly.relayout(gd, 'annotations[0].font.size', 20);
                })
                .then(function () {
                    var node = d3Select('text.annotation-text').node();
                    assertBBox(Drawing.bBox(node), {
                        height: 22,
                        width: 66.015625,
                        left: -32.78125,
                        top: -18,
                        right: 33.234375,
                        bottom: 4
                    });
                })
                .then(done, done.fail);
        });

        it('works with dummy nodes created in Drawing.tester', function () {
            var node = Drawing.tester.append('text')
                .text('bananas')
                .call(Drawing.font, {
                    family: '"Open Sans", verdana, arial, sans-serif',
                    size: 19
                })
                .call(svgTextUtils.convertToTspans).node();

            expect(node.parentNode).toBe(Drawing.tester.node());

            assertBBox(Drawing.bBox(node), {
                height: 21,
                width: 76,
                left: 0,
                top: -17,
                right: 76,
                bottom: 4
            });

            expect(node.parentNode).toBe(Drawing.tester.node());

            node.parentNode.removeChild(node);
        });
    });

    describe('curve interpolators', function () {
        // Sample points used across tests
        var P4 = [[0, 0], [100, 80], [200, -20], [300, 60]];
        var P2 = [[0, 0], [100, 100]];
        var P1 = [[50, 50]];

        describe('cardinalopen', function () {
            it('returns M+L path for 2 points', function () {
                var path = Drawing.cardinalopen(P2, 0.5);
                expect(path).toBe('M0,0L100,100');
            });

            it('returns M+L path for 1 point', function () {
                var path = Drawing.cardinalopen(P1, 0.5);
                expect(path).toMatch(/^M/);
                expect(path).not.toContain('C');
            });

            it('returns path starting with M for 4 points', function () {
                var path = Drawing.cardinalopen(P4, 0.5);
                expect(path[0]).toBe('M');
                expect(path).toContain('C');
            });

            it('tension=0 and tension=1 produce different control points', function () {
                var p0 = Drawing.cardinalopen(P4, 0);
                var p1 = Drawing.cardinalopen(P4, 1);
                expect(p0).not.toEqual(p1);
            });
        });

        describe('cardinalclosed', function () {
            it('returns Z-terminated path for 4 points', function () {
                var path = Drawing.cardinalclosed(P4, 0.5);
                expect(path[0]).toBe('M');
                expect(path[path.length - 1]).toBe('Z');
                expect(path).toContain('C');
            });

            it('returns Z-terminated line for 2 points', function () {
                var path = Drawing.cardinalclosed(P2, 0.5);
                expect(path[path.length - 1]).toBe('Z');
                expect(path).not.toContain('C');
            });
        });

        describe('catmullromopen', function () {
            it('returns M+L path for 2 points', function () {
                var path = Drawing.catmullromopen(P2, 0.5);
                expect(path).toBe('M0,0L100,100');
            });

            it('returns path starting with M and C for 4 points', function () {
                var path = Drawing.catmullromopen(P4, 0.5);
                expect(path[0]).toBe('M');
                expect(path).toContain('C');
            });

            it('alpha=0 and alpha=1 produce different control points', function () {
                var p0 = Drawing.catmullromopen(P4, 0);
                var p1 = Drawing.catmullromopen(P4, 1);
                expect(p0).not.toEqual(p1);
            });
        });

        describe('catmullromclosed', function () {
            it('returns Z-terminated path for 4 points', function () {
                var path = Drawing.catmullromclosed(P4, 0.5);
                expect(path[0]).toBe('M');
                expect(path[path.length - 1]).toBe('Z');
                expect(path).toContain('C');
            });
        });

        describe('monotoneopen', function () {
            it('returns L path for 2 points', function () {
                var path = Drawing.monotoneopen(P2);
                expect(path).toBe('M0,0L100,100');
            });

            it('returns path with cubic beziers for 4 points', function () {
                var path = Drawing.monotoneopen(P4);
                expect(path[0]).toBe('M');
                expect(path).toContain('C');
            });

            it('produces same path as linear for collinear points', function () {
                var collinear = [[0, 0], [100, 100], [200, 200]];
                var path = Drawing.monotoneopen(collinear);
                // collinear tangents = 1, bezier control points lie on the line
                expect(path[0]).toBe('M');
                expect(path).toContain('C');
            });

            it('does not overshoot for monotone increasing sequence', function () {
                // y-values are monotone: each segment should not produce overshoots
                var mono = [[0, 0], [1, 1], [2, 4], [3, 9]];
                var path = Drawing.monotoneopen(mono);
                expect(path[0]).toBe('M');
                // all control-point y values should be >= 0 (no overshoot below 0)
                var nums = path.match(/-?\d+\.?\d*/g).map(Number);
                expect(nums.every(function (v) { return v >= 0; })).toBe(true);
            });
        });

        describe('naturalopen', function () {
            it('returns L path for 2 points', function () {
                var path = Drawing.naturalopen(P2);
                expect(path).toBe('M0,0L100,100');
            });

            it('returns path with cubic beziers for 4 points', function () {
                var path = Drawing.naturalopen(P4);
                expect(path[0]).toBe('M');
                expect(path).toContain('C');
            });

            it('ends at the last data point', function () {
                var path = Drawing.naturalopen(P4);
                // last point should be 300,60
                expect(path).toMatch(/300,60$/);
            });
        });
    });
});

describe('gradients', function () {
    var gd;

    beforeEach(function () {
        gd = createGraphDiv();
    });

    afterEach(destroyGraphDiv);

    function checkGradientIds(ids, types, c1, c2) {
        var expected = ids.map(function (id) {
            return 'g' + gd._fullLayout._uid + '-' + gd._fullData[0].uid + id;
        });

        var gids = [];
        var typesOut = [];
        var c1Out = [];
        var c2Out = [];
        var gradients = d3Select(gd).selectAll('radialGradient,linearGradient');
        gradients.each(function () {
            gids.push(this.id);
            typesOut.push(this.nodeName.replace('Gradient', ''));
            c1Out.push(d3Select(this).select('stop[offset="100%"]').attr('stop-color'));
            c2Out.push(d3Select(this).select('stop[offset="0%"]').attr('stop-color'));
        });
        gids.sort();

        expect(gids.length).toBe(expected.length);

        for (var i = 0; i < Math.min(gids.length, expected.length); i++) {
            expect(gids[i]).toBe(expected[i]);
            expect(typesOut[i]).toBe(types[i]);
            expect(c1Out[i]).toBe(c1[i]);
            expect(c2Out[i]).toBe(c2[i]);
        }
    }

    it('clears unused gradients after a replot', function (done) {
        Plotly.newPlot(gd, [{
            y: [0, 1, 2],
            mode: 'markers',
            marker: {
                color: '#123',
                gradient: {
                    type: 'radial',
                    color: ['#fff', '#eee', '#ddd']
                }
            }
        }])
            .then(function () {
                checkGradientIds(
                    ['-0', '-1', '-2'],
                    ['radial', 'radial', 'radial'],
                    ['rgb(17, 34, 51)', 'rgb(17, 34, 51)', 'rgb(17, 34, 51)'],
                    ['rgb(255, 255, 255)', 'rgb(238, 238, 238)', 'rgb(221, 221, 221)']);

                return Plotly.restyle(gd, { 'marker.color': '#456' });
            })
            .then(function () {
                // simple scalar restyle doesn't trigger a full replot, so
                // doesn't clear the old gradients
                checkGradientIds(
                    ['-0', '-1', '-2'],
                    ['radial', 'radial', 'radial'],
                    ['rgb(68, 85, 102)', 'rgb(68, 85, 102)', 'rgb(68, 85, 102)'],
                    ['rgb(255, 255, 255)', 'rgb(238, 238, 238)', 'rgb(221, 221, 221)']);

                return Plotly.restyle(gd, { 'marker.gradient.type': [['horizontal', 'vertical', 'radial']] });
            })
            .then(function () {
                // array restyle does replot
                checkGradientIds(
                    ['-0', '-1', '-2'],
                    ['linear', 'linear', 'radial'],
                    ['rgb(68, 85, 102)', 'rgb(68, 85, 102)', 'rgb(68, 85, 102)'],
                    ['rgb(255, 255, 255)', 'rgb(238, 238, 238)', 'rgb(221, 221, 221)']);

                return Plotly.restyle(gd, {
                    'marker.gradient.type': 'vertical',
                    'marker.gradient.color': '#abc'
                });
            })
            .then(function () {
                // down to a single gradient because they're all the same
                checkGradientIds(
                    [''],
                    ['linear'],
                    ['rgb(68, 85, 102)'],
                    ['rgb(170, 187, 204)']);

                return Plotly.restyle(gd, { mode: 'lines' });
            })
            .then(function () {
                // full replot and no resulting markers at all -> no gradients
                checkGradientIds([], [], [], []);
            })
            .then(done, done.fail);
    });

    it('should append window URL to gradient ref if <base> is present', function (done) {
        var base = d3Select('body')
            .append('base')
            .attr('href', 'https://chart-studio.plotly.com');

        Plotly.newPlot(gd, [{
            type: 'heatmap',
            x: [1, 2],
            y: [2, 3],
            z: [[1, 3], [2, 3]]
        }])
            .then(function () {
                var cbfills = d3Select(gd).select('.cbfills > rect');
                expect(cbfills.node().style.fill).toBe([
                    'url("',
                    window.location.href,
                    'g',
                    gd._fullLayout._uid,
                    '-cb',
                    gd._fullData[0].uid,
                    '")'
                ].join(''));
            })
            .then(function () {
                base.remove();
                done();
            }, done.fail);
    });
});
