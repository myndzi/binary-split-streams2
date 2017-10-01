function subarray(buf, from, to) {
    arguments.length;
    return buf.slice(from, to);
}

module.exports = (function () {
    'use strict';

    var Transform = require('stream').Transform,
        inherits = require('util').inherits;

    var debug;

    var NODE_VERSION = (function () {
        var matched = process.version.match(/^v(\d+)\.(\d+)\.(\d+)$/);
        return [+matched[1], +matched[2], +matched[3]];
    })();

    /* istanbul ignore next */
    try {
        debug = require('debug')('split');
    } catch (e) {
        debug = function () { };
    }

    function Split(_splitter, opts) {
        if (!(this instanceof Split)) { return new Split(_splitter, opts); }

        if (NODE_VERSION[0] === 0 && NODE_VERSION[1] <= 10) {
            Transform.call(this);
            this._readableState.objectMode = true;
        } else {
            Transform.call(this, { readableObjectMode: true });
        }

        var splitter;

        if (_splitter === void 0) {
            splitter = new Buffer(require('os').EOL);
        } else if (typeof _splitter === 'string') {
            splitter = new Buffer(_splitter);
        }

        if (!Buffer.isBuffer(splitter)) {
            throw new Error('Invalid splitter: ' + _splitter);
        }
        //debug('Using splitter:', splitter);

        opts = opts || { };
        if (opts.hasOwnProperty('maxBuffer')) {
            if (
                typeof opts.maxBuffer !== 'number' ||
                opts.maxBuffer < 1 ||
                parseInt(opts.maxBuffer) !== opts.maxBuffer ||
                !isFinite(opts.maxBuffer)
            ) {
                throw new Error('Invalid maxBuffer: '+opts.maxBuffer);
            }
            if (opts.maxBuffer <= _splitter.length) {
                throw new Error('maxBuffer must be greater than the length of the splitter');
            }
        }
        debug(opts);

        this.maxBuffer = opts.maxBuffer || 0;
        this.buf = new Buffer(0);
        this.splitter = splitter;
        this.trailingDelim = true;
        this.indexOf = (
            Buffer.prototype.hasOwnProperty('indexOf') ?
                Function.prototype.call.bind(Buffer.prototype.indexOf) :
                Split.indexOf
        );
        this.findFn = (this.splitter.length === 1 ? this.fastFind : this.slowFind);
    }
    inherits(Split, Transform);

    // execute Array.indexOf on a buffer target
    function arrayIndexOf(buf, val, pos) { return Array.prototype.indexOf.call(buf, val, pos); }
    Split.indexOf = function (buf, val, pos) {
        // single value
        if (typeof val === 'number') { return arrayIndexOf(buf, val, pos); }

        var i = (arguments.length > 2 ? pos : 0),
            vl = val.length;

        // empty buffer always matches
        if (vl === 0) { return i; }

        // single value buffer can be reduced
        if (vl === 1) { return arrayIndexOf(buf, val[0], pos); }

        var bl = buf.length, x = bl - vl, j = 0, t = 0, matched = true;
        for (; i < bl; i++) {
            i = arrayIndexOf(buf, val[0], i);

            // no match if arrayIndexOf found none, or the match
            // would overrun the end of the haystack buffer
            if (i < 0 || i > x) { return -1; }

            // loop over the rest of the value buffer to verify
            // that the bytes match
            for (j = i + 1, t = 1, matched = true; matched && t < vl; j++, t++) {
                matched = (buf[j] === val[t]);
            };

            // all the values matched, we found something!
            if (matched) { return i; }
        }

        // if all else fails, no match
        return -1;
    };
    Split.prototype.fastFind = function (i) {
        return this.indexOf(this.buf, this.splitter[0], i);
    };
    Split.prototype.slowFind = function (i) {
        return this.indexOf(this.buf, this.splitter, i);
    };
    Split.prototype.appendBuffer = function (data) {
        var bl = this.buf.length, dl = data.length, limit = this.maxBuffer;

        if (this.maxBuffer <= 0 || bl + dl <= limit) {
            this.buf = Buffer.concat([this.buf, data]);
            return;
        }

        if (dl === limit) {
            this.buf = data;
        } else if (dl > limit) {
            this.buf = subarray(data, -limit);
        } else {
            this.buf = Buffer.concat([
                this.buf.slice(-(limit - dl)),
                data
            ]);
        }
        this.emit('truncated', ((bl + dl) - limit));
    };
    Split.prototype._transform = function (data, encoding, callback) {
        var i = 0, start = 0;

        if (this.splitter.length === 0) {
            //debug('Empty splitter loop');
            for (i = 0; i < data.length; i++) {
                this.push(subarray(data, i, i+1));
            }
            callback();
            return;
        }

        i = Math.max(0, this.buf.length - this.splitter.length + 1);
        //debug('_transform searching from %d', i);

        this.appendBuffer(data);
        this.trailingDelim = false;

        while ((i = this.findFn(i)) > -1) {
            // match

            if (start === i) {
                // empty match
                //debug('Empty match @ %d', start);
                this.push(new Buffer(0));
            } else {
                //debug('Match @ %d, emitting %d-%d', i, start, i-1);
                this.push(subarray(this.buf, start, i));
            }

            // continue loop from after the splitter
            i += this.splitter.length;
            start = i;
        }

        // throw out old buffers
        if (start) {
            //debug('Consuming %d bytes', start);
            this.buf = subarray(this.buf, start);
        }

        // if the buffer is empty, the end of the last chunk was
        // a splitter; in this case, we want to flush an empty chunk
        // at the end, so keep track of it
        this.trailingDelim = (this.buf.length === 0);

        callback();
    };
    Split.prototype._flush = function (callback) {
        //debug('flush', this.trailingDelim, this.buf.length);
        if (this.trailingDelim) {
            //debug('Pushing empty buffer (trailing delim)');
            this.push(new Buffer(0));
        } else if (this.buf.length) {
            //debug('Flushing leftovers');
            this.push(this.buf);
        }

        callback();
    };

    return Split;
})();
