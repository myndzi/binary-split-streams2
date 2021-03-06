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
            test(split(), ['a'+os.EOL+'b'], ['a', 'b'], done);
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
        var outputs = [ ], chunks = [ ], stream = split(splitter, opts);
        stream.on('truncated', function (amount) {
            outputs.push(amount);
        });
        stream.on('data', function (chunk) {
            chunks.push(chunk.toString());
        });
        function read() {
            while (1) {
                var chunk = stream.read();
                if (chunk === null) { break; }
                outputs.push(chunk.toString());
            }
        }
        inputs.forEach(function (input) {
            stream.write(input);
            read();
        });
        stream.end();
        read();

        return { outputs: outputs, chunks: chunks };
    }
    it('should truncate and emit if it accumulates > maxBuffer data (chunk.length < maxBuffer)', function () {
        testTruncation('#!', { maxBuffer: 5 }, [
            '12345',
            '678'
        ]).outputs.should.deepEqual([3]);
    });
    it('should truncate and emit if it accumulates > maxBuffer data (chunk.length === maxBuffer)', function () {
        testTruncation('#!', { maxBuffer: 5 }, [
            '12345',
            '67890'
        ]).outputs.should.deepEqual([5]);
    });
    it('should truncate and emit if it accumulates > maxBuffer data (chunk.length > maxBuffer)', function () {
        testTruncation('#!', { maxBuffer: 5 }, [
            '12345',
            '6789012'
        ]).outputs.should.deepEqual([7]);
    });
    it('should emit for each truncated chunk', function () {
        testTruncation('#!', { maxBuffer: 5 }, [
            '12345',
            '6',
            '7',
            '8',
            '90'
        ]).outputs.should.deepEqual([1, 1, 1, 2]);
        testTruncation('#!', { maxBuffer: 7 }, [
            '12345',
            '6',
            '7',
            '8',
            '90'
        ]).outputs.should.deepEqual([1, 2]);
    });
    it('should emit chunks longer than maxBuffer when received all at once', function () {
        testTruncation('.', { maxBuffer: 2 }, [
            'abcdefg.'
        ]).outputs.should.deepEqual([]);
    });
    it('should truncate chunks longer than maxBuffer when received in pieces', function () {
        testTruncation('.', { maxBuffer: 2 }, [
            'abc',
            'def',
            'g.'
        ]).outputs.should.deepEqual([1, 3]);
    });
    it('should always truncate the flushed data', function () {
        testTruncation('.', { maxBuffer: 2 }, [
            'abcdefg'
        ]).outputs.should.deepEqual([5]);
    });
    it('should emit all the chunks it can before truncation', function () {
        testTruncation('.', { maxBuffer: 2 }, [
            'aaa.bbb.ccc'
        ]).outputs.should.deepEqual([1]);
        testTruncation('.', { maxBuffer: 2 }, [
            'aaa.bbb',
            '.ccc'
        ]).chunks.should.deepEqual(['aaa', 'bb', 'cc']);
    });
    it('should not truncate', function () {
        testTruncation('#!', { }, [
            '12345',
            '6',
            '7',
            '8',
            '90'
        ]).outputs.should.deepEqual([]);
    });
    describe('strict truncation', function () {
        it('should NOT emit chunks longer than maxBuffer when received all at once', function () {
            testTruncation('.', { maxBuffer: 2, strictTruncation: true }, [
                'abcdefg.'
            ]).outputs.should.deepEqual([5]);
            testTruncation('.', { maxBuffer: 2, strictTruncation: true }, [
                'abcdefg.'
            ]).chunks.should.deepEqual(['fg', '']);
        });
        it('should truncate chunks longer than maxBuffer when received in pieces', function () {
            testTruncation('.', { maxBuffer: 2, strictTruncation: true }, [
                'abc',
                'def',
                'g.'
            ]).outputs.should.deepEqual([1, 3, 1]);
            testTruncation('.', { maxBuffer: 2, strictTruncation: true }, [
                'abc',
                'def',
                'g.'
            ]).chunks.should.deepEqual(['fg', '']);
        });
        it('should truncate the flushed data', function () {
            testTruncation('.', { maxBuffer: 2, strictTruncation: true }, [
                'abcdefg'
            ]).outputs.should.deepEqual([5]);
            testTruncation('.', { maxBuffer: 2, strictTruncation: true }, [
                'abcdefg'
            ]).chunks.should.deepEqual(['fg']);
        });
        it('should truncate every chunk', function () {
            testTruncation('.', { maxBuffer: 2, strictTruncation: true }, [
                'aaa.bbb.ccc'
            ]).outputs.should.deepEqual([1, 1, 1]);
            testTruncation('.', { maxBuffer: 2, strictTruncation: true }, [
                'aaa.bbb',
                '.ccc'
            ]).chunks.should.deepEqual(['aa', 'bb', 'cc']);
        });
    });
    describe('sanity', function () {
        function byteSumSanityTest(strictTruncation, splitter, loopSize, cb) {
            var stream = split(splitter, { maxBuffer: 5 });
            // a.b.c -> 'data' events is one greater than the number of splitters
            // a.b.c. -> same as number of splitters
            // for simplicity, we ensure we don't end on a splitter and subtract one
            // splitter's worth of bytes initially
            var bytesWritten = 0, bytesRead = 0, splitterBytes = -splitter.length, bytesTruncated = 0;
            stream.on('data', function (chunk) {
                splitterBytes += splitter.length;
                bytesRead += chunk.length;
            });
            stream.on('truncated', function (amount) {
                bytesTruncated += amount;
            });
            stream.on('end', function () {
                bytesWritten.should.equal(bytesRead + splitterBytes + bytesTruncated);
                cb(bytesWritten, bytesRead, splitterBytes, bytesTruncated);
            });
            var i, tmp;
            for (i = 0; i < loopSize; i++) {
                tmp = Math.random().toString(31).slice(Math.floor(Math.random()*10)+2);
                bytesWritten += tmp.length;
                stream.write(tmp);
            }
            bytesWritten++;
            stream.end('z'); // ensures we don't end on the splitter
        }
        [
            { strict: false, splitter: 'a' },
            { strict: false, splitter: 'aa' },
            { strict: true, splitter: 'a' },
            { strict: true, splitter: 'aa' },
        ].forEach(function (opts) {
            for (var i = 0; i < 5; i++) {
                it('should account for every byte (sample '+i+', strict: false, splitter: '+opts.splitter+')', function (done) {
                    byteSumSanityTest(opts.strict, opts.splitter, 1000, function (bytesWritten, bytesRead, splitterBytes, bytesTruncated) {
                        bytesWritten.should.equal(bytesRead + splitterBytes + bytesTruncated);
                        done();
                    });
                });
            }
        });
    });
});
describe('Empty delimiter', function () {
    it('emits every byte separately', function (done) {
        test(split(''), ['abc'], ['a', 'b', 'c'], done);
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
