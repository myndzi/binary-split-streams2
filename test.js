'use strict';

require('should');

var PassThrough = require('stream').PassThrough;
var split = require('./index');
var os = require('os');

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
                split(item, { });
            }).should.throw(/Invalid splitter/);
        });
    });
    it('should only allow positive integers for maxBuffer', function () {
        [null, void 0, -1, 0, -0, new Date(), { }, [ ], Infinity, -Infinity, NaN, true, false]
        .forEach(function (item) {
            (function () {
                split({ maxBuffer: item });
            }).should.throw(/Invalid maxBuffer/);
            (function () {
                split('foo', { maxBuffer: item });
            }).should.throw(/Invalid maxBuffer/);
        });
    });
    it('should fail if maxBuffer is <= the splitter size', function () {
        (function () {
            split('foo', { maxBuffer: 1 });
        }).should.throw(/maxBuffer must be greater/);
        (function () {
            split('foo', { maxBuffer: 3 });
        }).should.throw(/maxBuffer must be greater/);
        (function () {
            split('foo', { maxBuffer: 4 });
        }).should.not.throw();
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
    it('should disallow mutating the splitter', function () {
        var buf = new Buffer('.');
        var stream = split(buf);
        buf[0] = 0;
        stream.end('a.b');
        stream.read().toString().should.equal('a');
        stream.read().toString().should.equal('b');
    });
    describe('argument handling', function () {
        it('accepts a buffer', function (done) {
            test(split(new Buffer('.')), ['a.b'], ['a', 'b'], done);
        });
        it('accepts a buffer with options', function (done) {
            test(split(new Buffer('.'), { }), ['a.b'], ['a', 'b'], done);
        });
        it('accepts a string', function (done) {
            test(split('.'), ['a.b'], ['a', 'b'], done);
        });
        it('accepts a string with options', function (done) {
            test(split('.', { }), ['a.b'], ['a', 'b'], done);
        });
        it('accepts options, with default splitter', function (done) {
            test(split({ }), ['a'+os.EOL+'b'], ['a', 'b'], done);
        });
        it('works with default splitter', function (done) {
            test(split({ }), ['a'+os.EOL+'b'], ['a', 'b'], done);
        });
    });
});
describe('Split.indexOf', function () {
    function testIndexOf(b1, b2, expected) {
        b2 = (Array.isArray(b2) ? new Buffer(b2) : b2);
        split.indexOf(new Buffer(b1), b2).should.equal(expected);
    }

    describe('fast path', function () {
        it('should be -1 if not found', function () {
            testIndexOf([0], 3, -1);
            testIndexOf([0, 1], 3, -1);
            testIndexOf([0, 1, 2], 3, -1);
        });
        it('should be the offset of the match', function () {
            testIndexOf([0, 1, 2, 3], 0, 0);
            testIndexOf([0, 1, 2, 3], 1, 1);
            testIndexOf([0, 1, 2, 3], 2, 2);
            testIndexOf([0, 1, 2, 3], 3, 3);
        });
    });

    describe('slow path', function () {
        it('should be -1 if not found', function () {
            testIndexOf([], [3, 4], -1);
            testIndexOf([0], [3, 4], -1);
            testIndexOf([0, 1], [3, 4], -1);
            testIndexOf([0, 1, 2], [3, 4], -1);
        });
        it('should be the offset of the match', function () {
            testIndexOf([0, 1, 2, 3], [], 0);
            testIndexOf([0, 1, 2, 3], [0], 0);
            testIndexOf([0, 1, 2, 3], [1], 1);
            testIndexOf([0, 1, 2, 3], [2], 2);
            testIndexOf([0, 1, 2, 3], [3], 3);
            testIndexOf([0, 1, 2, 3], [0, 1], 0);
            testIndexOf([0, 1, 2, 3], [1, 2], 1);
            testIndexOf([0, 1, 2, 3], [2, 3], 2);
            testIndexOf([0, 0, 1, 2, 3], [0, 1], 1);
            testIndexOf([0, 1, 1, 2, 3], [1, 2], 2);
            testIndexOf([0, 1, 2, 2, 3], [2, 3], 3);
            testIndexOf([0, 1, 2, 2, 2, 3], [2, 3], 4);
            testIndexOf([0, 1, 2, 2, 2, 3], [2, 2, 3], 3);
        });
        it('should fail partial matches', function () {
            testIndexOf([0, 1, 2, 3], [0, 2], -1);
            testIndexOf([0, 1, 2, 3], [1, 3], -1);
            testIndexOf([0, 1, 2, 3], [2, 4], -1);
            testIndexOf([0, 1, 2, 3], [3, 5], -1);
        });
        it('should succeed after partial prefix', function () {
            testIndexOf([0, 1, 2, 3, 3, 5], [3, 5], 4);
        });
    });
});
describe('maxBuffer', function () {
    function testTruncation(splitter, opts, inputs) {
        var outputs = [ ], stream = split(splitter, opts);
        stream.on('truncated', function (amount) {
            outputs.push(amount);
        });
        inputs.forEach(function (input) {
            stream.write(input);
        });
        return outputs;
    }
    it('should truncate and emit if it accumulates > maxBuffer data (chunk.length < maxBuffer)', function () {
        testTruncation('#!', { maxBuffer: 5 }, [
            '12345',
            '678'
        ]).should.deepEqual([3]);
    });
    it('should truncate and emit if it accumulates > maxBuffer data (chunk.length === maxBuffer)', function () {
        testTruncation('#!', { maxBuffer: 5 }, [
            '12345',
            '67890'
        ]).should.deepEqual([5]);
    });
    it('should truncate and emit if it accumulates > maxBuffer data (chunk.length > maxBuffer)', function () {
        testTruncation('#!', { maxBuffer: 5 }, [
            '12345',
            '6789012'
        ]).should.deepEqual([7]);
    });
    it('should emit for each truncated chunk', function () {
        testTruncation('#!', { maxBuffer: 5 }, [
            '12345',
            '6',
            '7',
            '8',
            '90'
        ]).should.deepEqual([1, 1, 1, 2]);
        testTruncation('#!', { maxBuffer: 7 }, [
            '12345',
            '6',
            '7',
            '8',
            '90'
        ]).should.deepEqual([1, 2]);
    });
    it('should not truncate', function () {
        testTruncation('#!', { }, [
            '12345',
            '6',
            '7',
            '8',
            '90'
        ]).should.deepEqual([]);
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
    it('empty string', function (done) {
        test(split('.'), [''], [''], done);
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
    it('empty string', function (done) {
        test(split('#!'), [''], [''], done);
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
