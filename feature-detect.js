'use strict';

var Promise = require('bluebird');

function checkOutput(output, expected) {
    if (output.length !== expected.length) { return false; }
    for (var i = 0; i < output.length; i++) {
        if (output[i].toString() !== expected[i].toString()) {
            return false;
        }
    }
    return true;
};

function testPush(pack, args, input, expected) {
    return new Promise(function (resolve, reject) {
        var split = require(pack);
        var stream = split.apply(null, args);
        var output = [ ];

        stream.on('data', function (chunk) {
            output.push(chunk);
        });
        stream.on('end', function () {
            resolve(checkOutput(output, expected));
        });
        stream.on('error', reject);
        input.forEach(function (chunk) {
            stream.write(chunk);
        });
        stream.end();
    }).catch(function () { return false; });
}

function testPull(pack, args, input, expected) {
    return new Promise(function (resolve, reject) {
        var split = require(pack);
        var stream = split.apply(null, args);
        var output = [ ];
        input.forEach(function (chunk) {
            stream.write(chunk);
        });
        stream.end();
        var chunk;
        while ((chunk = stream.read()) !== null) {
            output.push(chunk);
        }
        resolve(checkOutput(output, expected));
    }).catch(function () { return false; });
}

function detectEmptySplit(pack) {
    return testPush(pack, [''], ['abcde'], ['a','b','c','d','e']);
}
function detectLongSplit(pack) {
    return testPush(pack, ['bc'], ['abcde'], ['a','de']);
}
function detectPull(pack) {
    return typeof require(pack)().read === 'function';
    //return testPull(pack, ['.'], ['a.b.c'], ['a', 'b', 'c']);
}
function detectMerge(pack) {
    return testPull(pack, ['.'], ['a', '.b.', 'c'], ['a', 'b', 'c']);
}
function detectRegex(pack) {
    return testPush(pack, [/\./], ['a.b.c'], ['a', 'b', 'c']);
}
function detectRegexEmptySplit(pack) {
    return testPush(pack, [new RegExp('')], ['abcde'], ['a', 'b', 'c', 'd', 'e']);
}
module.exports = function (packages) {
    return Promise.map(packages, function (pack) {
        return Promise.props({
            package: pack,
            emptySplit: detectEmptySplit(pack),
            longSplit: detectLongSplit(pack),
            pull: detectPull(pack),
            merge: detectMerge(pack).then(function (v) { return !v; }),
            regex: detectRegex(pack),
            emptyRegex: detectRegexEmptySplit(pack)
        });
    });
};
