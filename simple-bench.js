'use strict';

var fs = require('fs');
var stream = fs.createReadStream('./testfile.json');
//var split = require('binary-split');
var split = require('./index');
//var split = require('./binary-split2');
var start = Date.now();

var count = 0;
var last = 0;
var timer = setInterval(function () {
    var diff = count-last;
    last = count;
    console.log(diff);
}, 1000);

stream.pipe(split())
.on('data', function () {
    count++;
}).on('end', function () {
    clearInterval(timer);
    console.log('took ' + (Date.now() - start) + 'ms');
});

