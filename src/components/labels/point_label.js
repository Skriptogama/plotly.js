'use strict';

var Lib = require('../../lib');
var LINE_SPACING = require('../../constants/alignment').LINE_SPACING;

var DEFAULT_TEXT_POSITION = 'middle center';
var AUTO_TEXT_POSITION = 'auto';
var AUTO_TEXT_CANDIDATES = [
    'top center',
    'top right',
    'top left',
    'middle right',
    'middle left',
    'bottom center',
    'bottom right',
    'bottom left',
    'middle center'
];

var SVG_TEXT_ANCHOR = {
    left: 'end',
    center: 'middle',
    right: 'start'
};

var GL_TEXT_ALIGN = {
    left: 'right',
    center: 'center',
    right: 'left'
};

var GL_TEXT_BASELINE = {
    top: 'bottom',
    middle: 'middle',
    bottom: 'top'
};

var GL_TEXT_OFFSET_SIGN = {
    left: -1,
    center: 0,
    right: 1,
    top: -1,
    middle: 0,
    bottom: 1
};

function normalizeTextPosition(textPosition) {
    return textPosition === AUTO_TEXT_POSITION || !textPosition ? DEFAULT_TEXT_POSITION : textPosition;
}

function parseTextPosition(textPosition) {
    var position = normalizeTextPosition(textPosition);

    return {
        position: position,
        vertical: position.indexOf('top') !== -1 ? 'top' : position.indexOf('bottom') !== -1 ? 'bottom' : 'middle',
        horizontal: position.indexOf('left') !== -1 ? 'left' : position.indexOf('right') !== -1 ? 'right' : 'center'
    };
}

function splitTextLines(text) {
    return String(text).split(/<br\s*\/?>|\n/);
}

function estimateTextBox(text, fontSize) {
    var size = fontSize > 0 ? fontSize : 0;
    var lines = splitTextLines(text);
    var maxLength = 0;

    for (var i = 0; i < lines.length; i++) {
        maxLength = Math.max(maxLength, lines[i].length);
    }

    return {
        width: maxLength * size * 0.6 + 2,
        height: Math.max(1, lines.length) * size * LINE_SPACING
    };
}

function makeLabelRect(x, y, width, height, textPosition, markerPad) {
    var parsed = parseTextPosition(textPosition);
    var left;
    var top;

    if (parsed.horizontal === 'left') {
        left = x - markerPad - width;
    } else if (parsed.horizontal === 'right') {
        left = x + markerPad;
    } else {
        left = x - width / 2;
    }

    if (parsed.vertical === 'top') {
        top = y - markerPad - height;
    } else if (parsed.vertical === 'bottom') {
        top = y + markerPad;
    } else {
        top = y - height / 2;
    }

    return {
        left: left,
        top: top,
        right: left + width,
        bottom: top + height
    };
}

function rectsOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function rectFitsViewport(rect, viewport) {
    return rect.left >= viewport.left && rect.right <= viewport.right &&
        rect.top >= viewport.top && rect.bottom <= viewport.bottom;
}

function createState(viewport) {
    return {
        viewport: viewport,
        occupied: []
    };
}

function addRectObstacle(state, rect) {
    if (!state || !rect) return;
    if (!rectFitsViewport(rect, state.viewport)) return;
    state.occupied.push(rect);
}

function addPointObstacle(state, x, y, markerPad) {
    if (!isFinite(x) || !isFinite(y) || !markerPad) return;

    addRectObstacle(state, {
        left: x - markerPad,
        right: x + markerPad,
        top: y - markerPad,
        bottom: y + markerPad
    });
}

function canPlaceRect(state, rect) {
    if (!rectFitsViewport(rect, state.viewport)) return false;

    for (var i = 0; i < state.occupied.length; i++) {
        if (rectsOverlap(rect, state.occupied[i])) return false;
    }

    return true;
}

function placePointLabel(state, opts) {
    var markerPad = opts.markerPad || 0;
    var fontSize = opts.fontSize || 0;
    var textBox = estimateTextBox(opts.text, fontSize);
    var candidates = opts.candidates || AUTO_TEXT_CANDIDATES;

    for (var i = 0; i < candidates.length; i++) {
        var textPosition = candidates[i];
        var rect = makeLabelRect(opts.x, opts.y, textBox.width, textBox.height, textPosition, markerPad);

        if (canPlaceRect(state, rect)) {
            state.occupied.push(rect);
            return textPosition;
        }
    }

    return false;
}

function hasAutoTextPosition(textPosition) {
    if (textPosition === AUTO_TEXT_POSITION) return true;
    if (!Lib.isArrayOrTypedArray(textPosition)) return false;

    for (var i = 0; i < textPosition.length; i++) {
        if (textPosition[i] === AUTO_TEXT_POSITION) return true;
    }

    return false;
}

function getPointTextPosition(textPosition, index) {
    if (!Lib.isArrayOrTypedArray(textPosition)) {
        return textPosition || DEFAULT_TEXT_POSITION;
    }

    return textPosition[index] || DEFAULT_TEXT_POSITION;
}

function getSvgTextAnchor(textPosition) {
    return SVG_TEXT_ANCHOR[parseTextPosition(textPosition).horizontal];
}

function getGlTextPosition(textPosition, fontSize, markerPad) {
    var parsed = parseTextPosition(textPosition);
    var horizontal = parsed.horizontal;
    var vertical = parsed.vertical;
    var size = fontSize > 0 ? fontSize : 1;
    var xSign = GL_TEXT_OFFSET_SIGN[horizontal];
    var ySign = GL_TEXT_OFFSET_SIGN[vertical];

    return {
        align: GL_TEXT_ALIGN[horizontal],
        baseline: GL_TEXT_BASELINE[vertical],
        offset: [
            xSign * markerPad / size,
            (-ySign * markerPad - ySign * 0.5) / size
        ]
    };
}

module.exports = {
    AUTO_TEXT_POSITION: AUTO_TEXT_POSITION,
    DEFAULT_TEXT_POSITION: DEFAULT_TEXT_POSITION,
    createState: createState,
    addRectObstacle: addRectObstacle,
    addPointObstacle: addPointObstacle,
    placePointLabel: placePointLabel,
    hasAutoTextPosition: hasAutoTextPosition,
    getPointTextPosition: getPointTextPosition,
    normalizeTextPosition: normalizeTextPosition,
    getSvgTextAnchor: getSvgTextAnchor,
    getGlTextPosition: getGlTextPosition
};