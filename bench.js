'use strict';

global.require = require;
global.noop = function () { };
global.drain = function (stream) {
    while (stream.read() !== null) { }
};

var PACKAGES = ['./index', 'binary-split', 'split'];

require('./chunk-data');

var Benchmark = require('benchmark');
var benchmarks = [ ];

function genBenchmark(pack, pull, charRange, chunkSize, seed, splitter) {
    var opts = {
        package: pack,
        pull: pull,
        splitter: (
            typeof splitter === 'string' ?
            "'"+splitter+"'" :
            String(splitter)
        ),
        charRange: charRange,
        chunkSize: chunkSize,
        seed: seed
    };

    var bench = new Benchmark({
        'id': JSON.stringify(opts),
        'setup': function () {
            var split = require($_package_);
            var splitter = $_splitter_;
            var chunkdata = global.chunkdata($_seed_, $_chunkSize_, $_charRange_);
            var ended = false;
            function onError(deferred, e) {
                ended = true;
                global.setError(e);
                deferred.resolve();
            }
        }.toString().replace(/\$_(.*?)_/g, function (_, v) {
            if (v === 'package') { return "'"+pack+"'"; }
            if (v === 'splitter') { return "'"+splitter+"'"; }
            if (v === 'charRange') { return charRange; }
            if (v === 'chunkSize') { return chunkSize; }
            if (v === 'seed') { return "'"+seed+"'"; }
        }).slice(13,-1),
        'defer': !pull,
        'fn': pull ?
            function () {
                var stream = split(splitter);
                for (var i = 0, x = chunkdata.length; i < x; i++) {
                    stream.write(chunkdata[i]);
                    global.drain(stream);
                }
                stream.end();
                global.drain(stream);
            }.toString().slice(13,-1)
            :
            function (deferred) {
                var stream = split(splitter);
                stream.on('data', global.noop);
                stream.on('error', function (e) {
                    onError(deferred, e);
                });
                var timer = setTimeout(function () {
                    onError(deferred, new Error('Stream never ended'));
                }, 250);

                stream.on('end', function () {
                    clearTimeout(timer);
                    deferred.resolve();
                });
                stream.resume();
                for (var i = 0, x = chunkdata.length; i < x; i++) {
                    if (ended) { return; }
                    stream.write(chunkdata[i]);
                }
                stream.end();
            }.toString().slice(21,-1)
        ,
        'onError': function (e) {
            console.log('error', e);
        }
    });
    benchmarks.push(bench);
}

var err = null;
global.setError = function (e) {
    err = e;
};
function doBench(i) {
    var bench = benchmarks[i];
    if (bench) {
        setError(null);
        bench.on('complete', function () {
            var opts = JSON.parse(bench.options.id),
                mean = Math.round(bench.stats.mean*100)/100,
                sem = Math.round(bench.stats.sem*100*100)/100;

            var throughput = Math.round((global.DATA_SIZE / mean) / 1024 * 100)/100;

            console.log(
                (i+1)+'/'+benchmarks.length,
                opts.package,
                opts.splitter,
                opts.pull ? 'pull' : 'push',
                (err ?
                    '['+err.message+']' :
                    ''+throughput+'KiB/s +/- '+sem+'%'
                ),
                'chunkSize='+opts.chunkSize,
                'charRange='+opts.charRange)
            ;

            doBench(i+1);
        });
        bench.run();
    } else {
        console.log('all done');
    }
}

require('./feature-detect')(PACKAGES).then(function (FEATURES) {
    console.log(FEATURES);
    var i = 0;
    function buildBenchmarks(charRange, chunkSize, seed, splitter) {
        FEATURES.forEach(function (obj) {
            var isRegex = !(typeof splitter === 'string');
            var isEmpty = (splitter === '');
            var supported = true;
            if (isEmpty) {
                if (!obj.emptySplit && obj.emptyRegex) {
                    splitter = new RegExp('');
                } else {
                    supported = supported && obj.emptySplit;
                }
            }
            if (isRegex) {
                supported = supported && obj.regex;
            }
            if (!supported) { return; }

            genBenchmark(obj.package, false, charRange, chunkSize, seed, splitter);
            if (obj.pull) {
                genBenchmark(obj.package, true, charRange, chunkSize, seed, splitter);
            }
        });
    }

    [5, 13, 26, 64].forEach(function(charRange) {
        [32, 64, 1024, 2048].forEach(function (chunkSize) {
            ['foo', 'bar', 'baz'].forEach(function (seed) {
                ['', 'a', 'ab', 'aab', 'abb', 'abab', 'aabb', /a/, /ab/]
                .forEach(function (splitter) {
                    buildBenchmarks(charRange, chunkSize, seed, splitter);
                });
            });
        });
    });

    doBench(0);
});
