'use strict';

// Shared opposite-axis attributes for the range slider.
// Used for yaxis entries inside an xaxis rangeslider (horizontal slider)
// and xaxis entries inside a yaxis rangeslider (vertical slider).
module.exports = {
    // not really a 'subplot' attribute container,
    // but this is the flag we use to denote attributes that
    // support yaxis/xaxis counters
    _isSubplotObj: true,

    rangemode: {
        valType: 'enumerated',
        values: ['auto', 'fixed', 'match'],
        dflt: 'match',
        editType: 'calc',
        description: [
            'Determines whether or not the range of this axis in',
            'the rangeslider use the same value than in the main plot',
            'when zooming in/out.',
            'If *auto*, the autorange will be used.',
            'If *fixed*, the `range` is used.',
            'If *match*, the current range of the corresponding axis on the main subplot is used.'
        ].join(' ')
    },
    range: {
        valType: 'info_array',
        items: [
            { valType: 'any', editType: 'plot' },
            { valType: 'any', editType: 'plot' }
        ],
        editType: 'plot',
        description: [
            'Sets the range of this axis for the rangeslider.'
        ].join(' ')
    },
    editType: 'calc'
};
