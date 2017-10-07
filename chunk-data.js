'use strict';

// using globals so scripts inside Benchmark can use them
global.DATA_SIZE = 1000000;

var seedrandom = require('seedrandom');

// cache generated chunks when running across different packages with same settings
var SEED = null, CHUNK_SIZE = null, CHAR_RANGE = null;
var DATA = null;
global.chunkdata = function (seed, chunkSize, charRange) {
    if (seed === SEED && chunkSize === CHUNK_SIZE && charRange === CHAR_RANGE) {
        return DATA;
    }
    SEED = seed;
    CHUNK_SIZE = chunkSize;
    CHAR_RANGE = charRange;

    var rng = seedrandom(seed);
    function getChunk() {
        var buf = new Buffer(chunkSize);
        for (var i = 0; i < chunkSize; i++) {
            buf[i] = ~~(rng() * charRange)+97;
        }
        return buf;
    }

    DATA = [ ];
    console.log('generating chunk data: seed='+seed+', chunkSize='+chunkSize+', charRange='+charRange);
    for (var i = 0; i < DATA_SIZE; i += chunkSize) {
        DATA.push(getChunk());
    }
    return DATA;
};
