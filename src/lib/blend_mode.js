'use strict';

var VALUES = ['normal', 'add', 'multiply', 'screen'];

var CSS_VALUES = {
    add: 'plus-lighter'
};

var GL_BLEND_CONFIGS = {
    normal: {
        color: [0, 0, 0, 0],
        equation: {
            rgb: 'add',
            alpha: 'add'
        },
        func: {
            srcRGB: 'src alpha',
            dstRGB: 'one minus src alpha',
            srcAlpha: 'one minus dst alpha',
            dstAlpha: 'one'
        }
    },
    add: {
        color: [0, 0, 0, 0],
        equation: {
            rgb: 'add',
            alpha: 'add'
        },
        func: {
            srcRGB: 'one',
            dstRGB: 'one',
            srcAlpha: 'one',
            dstAlpha: 'one'
        }
    },
    multiply: {
        color: [0, 0, 0, 0],
        equation: {
            rgb: 'add',
            alpha: 'add'
        },
        func: {
            srcRGB: 'dst color',
            dstRGB: 'zero',
            srcAlpha: 'one',
            dstAlpha: 'one minus src alpha'
        }
    },
    screen: {
        color: [0, 0, 0, 0],
        equation: {
            rgb: 'add',
            alpha: 'add'
        },
        func: {
            srcRGB: 'one',
            dstRGB: 'one minus src color',
            srcAlpha: 'one',
            dstAlpha: 'one minus src alpha'
        }
    }
};

function attr(opts) {
    opts = opts || {};

    var out = {
        valType: 'enumerated',
        values: VALUES,
        dflt: 'normal',
        editType: opts.editType || 'style',
        description: opts.description || 'Sets how colors for this object blend with content drawn underneath.'
    };

    if (opts.arrayOk) {
        out.arrayOk = true;
    }

    return out;
}

function resolve(value, index, fallback) {
    var resolved = value;

    if (Array.isArray(resolved)) {
        resolved = resolved[index];
    }

    if (resolved === undefined || resolved === null) {
        resolved = fallback;
    }

    return resolved || 'normal';
}

function cssValue(value, index, fallback) {
    var mode = resolve(value, index, fallback);
    return CSS_VALUES[mode] || mode;
}

function styleValue(value, index, fallback) {
    var mode = cssValue(value, index, fallback);
    return mode === 'normal' ? null : mode;
}

function applyStyle(selection, value, fallback) {
    selection.style('mix-blend-mode', function (d, i) {
        return styleValue(typeof value === 'function' ? value.call(this, d, i) : value, i, fallback);
    });
}

function applySingleStyle(selection, value, index, fallback) {
    selection.style('mix-blend-mode', styleValue(value, index || 0, fallback));
}

function getTrace(datum) {
    if (datum && datum.trace) {
        return datum.trace;
    }

    if (Array.isArray(datum) && datum[0] && datum[0].trace) {
        return datum[0].trace;
    }

    return null;
}

function getTraceBlendMode(trace) {
    if (!trace) {
        return 'normal';
    }

    return trace.blendmode || ((trace._input || {}).blendmode) || 'normal';
}

function getContainerBlendMode(trace, container, containerPath) {
    var containerInput = trace && trace._input;
    var parts;
    var i;

    if (container && container.blendmode !== undefined) {
        return container.blendmode;
    }

    if (!containerInput || !containerPath) {
        return getTraceBlendMode(trace);
    }

    parts = containerPath.split('.');
    for (i = 0; i < parts.length && containerInput; i++) {
        containerInput = containerInput[parts[i]];
    }

    return containerInput && containerInput.blendmode !== undefined ? containerInput.blendmode : getTraceBlendMode(trace);
}

function getGLBlend(value, index, fallback) {
    return GL_BLEND_CONFIGS[resolve(value, index, fallback)] || GL_BLEND_CONFIGS.normal;
}

module.exports = {
    attr: attr,
    applyStyle: applyStyle,
    applySingleStyle: applySingleStyle,
    cssValue: cssValue,
    getContainerBlendMode: getContainerBlendMode,
    getGLBlend: getGLBlend,
    getTrace: getTrace,
    getTraceBlendMode: getTraceBlendMode,
    resolve: resolve,
    values: VALUES
};