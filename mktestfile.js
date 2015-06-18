'use strict';

var fs = require('fs');
var EOL = require('os').EOL;

try {
    fs.unlinkSync('./testfile.json');
} catch (e) {
    if (e.code !== 'ENOENT') { throw e; }
}

var i, str;
for (i = 0; i < 5200000; i++) {
    str = new Array(501).join('x') + EOL;
    fs.appendFileSync('./testfile.json', str);
}

console.log('done');
