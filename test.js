'use strict';

require('should');

var PassThrough = require('stream').PassThrough;
var split = require('./index');

function test(split, input, output, cb) {
    var pt = new PassThrough();
    
    setImmediate(function next() {
        if (input.length === 0) {
            pt.end();
        } else {
            pt.write(input.shift());
            setImmediate(next);
        }
    });
    
    var split = pt.pipe(split), res = [ ];
    split.on('data', function (chunk) {
        res.push(chunk.toString());
    });
    split.on('end', function () {
        res.should.match(output);
        cb();
    });
    
    split.on('error', cb);
    pt.on('error', cb);
}

describe('Arguments', function () {
    it('splitter should default to require(\'os\').EOL', function (done) {
        test(split(), ['a\nb'], ['a', 'b'], done);
    });
    it('should throw on non-string, non-Buffer inputs', function () {
        [null, 1, new Date(), { }, [ ], Infinity, NaN, true, false]
        .forEach(function (item) {
            (function () {
                split(item);
            }).should.throw(/Invalid splitter/);
        });
    });
});
describe('Zero char delimiter', function () {
    it('emits single characters', function (done) {
        test(split(''), ['abcde'], ['a', 'b', 'c', 'd', 'e'], done);
    });
});
describe('Sanity', function () {
    // if you do this with just the passthrough stream, pt.read() will return 'a.bc.d' instead of 'a.b' then 'c.d'
    // this is just checking that the streams still behave as expected -- one value read per call to .push() in _transform
    it('should not combine outputs', function (done) {
        var pt = new PassThrough();
        var stream = pt.pipe(split('.'));
        pt.write('a.b');
        pt.end('c.d');
        setImmediate(function () {
            stream.read().toString().should.equal('a');
            stream.read().toString().should.equal('bc');
            stream.read().toString().should.equal('d');
            done();
        });
    });
});
describe('Single char delimiter', function () {
    it('one chunk', function (done) {
        test(split('.'), ['a.b'], ['a', 'b'], done);
    });
    it('aligned chunks', function (done) {
        test(split('.'), ['a.', 'b'], ['a', 'b'], done);
    });
    it('misaligned chunks', function (done) {
        test(split('.'), ['a.b', 'c.d'], ['a', 'bc', 'd'], done);
    });
    it('late delimiter', function (done) {
        test(split('.'), ['a', 'b', 'c.d'], ['abc', 'd'], done);
    });
    it('no delimiter, one chunk', function (done) {
        test(split('.'), ['abc'], ['abc'], done);
    });
    it('no delimiter, multiple chunks', function (done) {
        test(split('.'), ['a', 'b', 'c'], ['abc'], done);
    });
    it('empty token at start', function (done) {
        test(split('.'), ['.a'], ['', 'a'], done);
    });
    it('empty token in middle', function (done) {
        test(split('.'), ['a..b'], ['a', '', 'b'], done);
    });
    it('empty token at end', function (done) {
        test(split('.'), ['a.'], ['a', ''], done);
    });
    it('all empty tokens', function (done) {
        test(split('.'), ['.', '..'], ['', '', ''], done);
    });
});
describe('Multi-char delimiter', function () {
    it('aligned chunks', function (done) {
        test(split('#!'), ['a#!', 'b'], ['a', 'b'], done);
    });
    it('misaligned chunks', function (done) {
        test(split('#!'), ['a#!b', 'c#!d'], ['a', 'bc', 'd'], done);
    });
    it('late delimiter', function (done) {
        test(split('#!'), ['a', 'b', 'c#!d'], ['abc', 'd'], done);
    });
    it('no delimiter, one chunk', function (done) {
        test(split('#!'), ['abc'], ['abc'], done);
    });
    it('no delimiter, multiple chunks', function (done) {
        test(split('#!'), ['a', 'b', 'c'], ['abc'], done);
    });
    it('empty token at start', function (done) {
        test(split('#!'), ['#!a'], ['', 'a'], done);
    });
    it('empty token in middle', function (done) {
        test(split('#!'), ['a#!#!b'], ['a', '', 'b'], done);
    });
    it('empty token at end', function (done) {
        test(split('#!'), ['a#!'], ['a', ''], done);
    });
    it('all empty tokens', function (done) {
        test(split('#!'), ['#!', '#!#!'], ['', '', ''], done);
    });
    it('split delimiter', function (done) {
        test(split('#!'), ['a#', '!b#!c'], ['a', 'b', 'c'], done);
    });
    it('false positive', function (done) {
        test(split('#!'), ['a#b'], ['a#b'], done);
    });
    it('many chunk span', function (done) {
        test(split('bcdef'), ['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['a', 'g'], done);
    });
    it('partial match ending the stream', function (done) {
        test(split('bcdef'), ['a', 'b', 'c', 'd', 'e'], ['abcde'], done);
    });
});
