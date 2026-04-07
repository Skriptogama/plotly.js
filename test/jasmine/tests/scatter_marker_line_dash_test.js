var Plotly = require('../../../lib/index');
var createGraphDiv = require('../assets/create_graph_div');
var destroyGraphDiv = require('../assets/destroy_graph_div');

describe('Test scatter marker line dash:', function () {
    var gd;

    beforeEach(function () {
        gd = createGraphDiv();
    });

    afterEach(destroyGraphDiv);

    it('should support marker line dash', function (done) {
        Plotly.newPlot(gd, [{
            mode: 'markers',
            x: [1, 2, 3],
            y: [1, 2, 3],
            marker: {
                size: 20,
                line: {
                    color: 'red',
                    width: 2,
                    dash: 'dash'
                }
            }
        }]).then(function () {
            var markers = gd.querySelectorAll('.point');
            expect(markers.length).toBe(3);

            markers.forEach(function (node) {
                // In plotly.js, dash is applied via stroke-dasharray
                expect(node.style.strokeDasharray).not.toBe('');
            });
        })
            .then(done, done.fail);
    });

    it('should support array marker line dash', function (done) {
        Plotly.newPlot(gd, [{
            mode: 'markers',
            x: [1, 2, 3],
            y: [1, 2, 3],
            marker: {
                size: 20,
                line: {
                    color: 'red',
                    width: 2,
                    dash: ['solid', 'dot', 'dash']
                }
            }
        }]).then(function () {
            var markers = gd.querySelectorAll('.point');
            expect(markers.length).toBe(3);

            // 'solid' should have no dasharray or 'none' (represented as empty string in node.style.strokeDasharray)
            // 'dot' and 'dash' should have numerical dasharrays
            expect(markers[0].style.strokeDasharray).toBe('');
            expect(markers[1].style.strokeDasharray).not.toBe('');
            expect(markers[2].style.strokeDasharray).not.toBe('');
        })
            .then(done, done.fail);
    });

    it('should show marker line dash in the legend', function (done) {
        Plotly.newPlot(
            gd,
            [{
                mode: 'markers',
                x: [1, 2, 3],
                y: [1, 2, 3],
                marker: {
                    line: {
                        color: 'red',
                        width: 2,
                        dash: 'dash'
                    }
                }
            }],
            { showlegend: true }
        )
            .then(function () {
                var legendPoints = gd.querySelectorAll('.legendpoints path.scatterpts');
                expect(legendPoints.length).toBe(1);
                expect(legendPoints[0].style.strokeDasharray).not.toBe('');
            })
            .then(done, done.fail);
    });

    it('should update marker line dash via restyle', function (done) {
        Plotly.newPlot(gd, [{
            mode: 'markers',
            x: [1, 2, 3],
            y: [1, 2, 3],
            marker: {
                line: {
                    color: 'red',
                    width: 2,
                    dash: 'solid'
                }
            }
        }]).then(function () {
            var markers = gd.querySelectorAll('.point');
            expect(markers[0].style.strokeDasharray).toBe('');

            return Plotly.restyle(gd, { 'marker.line.dash': 'dot' });
        }).then(function () {
            var markers = gd.querySelectorAll('.point');
            expect(markers[0].style.strokeDasharray).not.toBe('');
        })
            .then(done, done.fail);
    });
    it('should support marker line dash on open markers', function (done) {
        Plotly.newPlot(gd, [{
            mode: 'markers',
            x: [1, 2, 3],
            y: [1, 2, 3],
            marker: {
                symbol: 'circle-open',
                line: {
                    color: 'red',
                    width: 2,
                    dash: 'dash'
                }
            }
        }]).then(function () {
            var markers = gd.querySelectorAll('.point');
            expect(markers.length).toBe(3);

            markers.forEach(function (node) {
                expect(node.style.strokeDasharray).not.toBe('');
            });
        })
            .then(done, done.fail);
    });
});

describe('Test scatter trace line cap:', function () {
    var gd;

    beforeEach(function () {
        gd = createGraphDiv();
    });

    afterEach(destroyGraphDiv);

    it('should default to square line cap rendered internally as butt', function (done) {
        Plotly.newPlot(gd, [{
            mode: 'lines',
            x: [1, 2, 3],
            y: [1, 2, 3],
            line: { width: 4 }
        }]).then(function () {
            var path = gd.querySelector('.js-line');
            // 'butt' is the browser default so the style may be empty string or 'butt'
            var cap = path.style.strokeLinecap;
            expect(cap === '' || cap === 'butt').toBe(true);
        })
            .then(done, done.fail);
    });

    it('should apply round line cap to trace line', function (done) {
        Plotly.newPlot(gd, [{
            mode: 'lines',
            x: [1, 2, 3],
            y: [1, 2, 3],
            line: { width: 4, cap: 'round' }
        }]).then(function () {
            var path = gd.querySelector('.js-line');
            expect(path.style.strokeLinecap).toBe('round');
        })
            .then(done, done.fail);
    });

    it('should apply square line cap to trace line using butt stroke caps internally', function (done) {
        Plotly.newPlot(gd, [{
            mode: 'lines',
            x: [1, 2, 3],
            y: [1, 2, 3],
            line: { width: 4, cap: 'square' }
        }]).then(function () {
            var path = gd.querySelector('.js-line');
            var cap = path.style.strokeLinecap;
            expect(cap === '' || cap === 'butt').toBe(true);
        })
            .then(done, done.fail);
    });

    it('should update line cap via restyle', function (done) {
        Plotly.newPlot(gd, [{
            mode: 'lines',
            x: [1, 2, 3],
            y: [1, 2, 3],
            line: { width: 4, cap: 'square' }
        }]).then(function () {
            var path = gd.querySelector('.js-line');
            var cap = path.style.strokeLinecap;
            expect(cap === '' || cap === 'butt').toBe(true);
            return Plotly.restyle(gd, { 'line.cap': 'round' });
        }).then(function () {
            var path = gd.querySelector('.js-line');
            expect(path.style.strokeLinecap).toBe('round');
        })
            .then(done, done.fail);
    });

    it('should support custom dash string on trace line', function (done) {
        Plotly.newPlot(gd, [{
            mode: 'lines',
            x: [1, 2, 3],
            y: [1, 2, 3],
            line: { width: 4, dash: '8px,4px,2px,4px' }
        }]).then(function () {
            var path = gd.querySelector('.js-line');
            expect(path.style.strokeDasharray).toBe('8px,4px,2px,4px');
        })
            .then(done, done.fail);
    });
});
