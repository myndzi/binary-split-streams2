'use strict';

var Transform = require('stream').Transform,
    inherits = require('util').inherits;

var BufferList = require('bl');

var debug;

try {
    debug = require('debug')('split');
} catch (e) {
    debug = function () { };
}

function Iter(bl) {
    this.bl = bl;
    this.i = 0;
    this.num = 0;
    this.pos = 0;
}
Iter.prototype.seek = function (i) {
    var offs = this.bl._offset(i);
    this.num = offs[0];
    this.pos = offs[1];
    this.i = i;
};
Iter.prototype.seekBackward = function (i) {
    var diff = this.i - i;
    if (diff < this.pos) {
        this.pos -= diff;
    } else {
        var offs = this.bl._offset(i);
        this.num = offs[0];
        this.pos = offs[1];
    }
    this.i = i;
};
Iter.prototype.seekForward = function (i) {
    var diff = i - this.i,
        bufs = this.bl._bufs,
        len;

    while (this.pos + diff >= (len = bufs[this.num].length)) {
        diff = diff + this.pos - len;
        this.num++;
        this.pos = 0;
    }
    
    this.pos += diff;
    this.i = i;
};
Iter.prototype.get = function (i) {
    if (i >= this.i) { this.seekForward(i); }
    else if (i < this.i) { this.seekBackward(i); }
    
    return this.bl._bufs[this.num][this.pos];
};

function Split(_splitter) {
    if (!(this instanceof Split)) { return new Split(_splitter); }
    Transform.call(this, { readableObjectMode: true });
    
    var splitter;
    
    if (_splitter === void 0) {
        splitter = new Buffer(require('os').EOL);
    } else if (typeof _splitter === 'string') {
        splitter = new Buffer(_splitter);
    }
    
    if (!Buffer.isBuffer(splitter)) {
        throw new Error('Invalid splitter: ' + _splitter);
    }
    debug('Using splitter:', splitter);
    
    this.bl = new BufferList();
    this.iter = new Iter(this.bl);
    this.splitter = splitter;
    this.trailingDelim = false;
}
inherits(Split, Transform);

Split.prototype._transform = function (data, encoding, callback) {
    var i, j, start = 0;
    
    if (this.splitter.length === 0) {
        debug('Empty splitter loop');
        for (i = 0; i < data.length; i++) {
            this.push(data.slice(i, i+1));
        }
        callback();
        return;
    }
    
    var i = Math.max(0, this.bl.length - this.splitter.length + 1);
    
    debug('_transform searching from %d', i);
    
    this.bl.append(data);
    this.trailingDelim = false;
    
    var iter = this.iter;
    iter.num = 0;
    iter.pos = 0;
    iter.i = 0;
    
    outer: for (; i < this.bl.length; i++) {
        try {
            var foo = iter.get(i);
        } catch (e) {
            console.log(i, this.bl.length, iter.num, iter.pos);
            console.log(this.bl._offset(i));
            throw e;
        }
        if (iter.get(i) !== this.splitter[0]) { continue outer; }
        
        debug('Potential match (i=%d, start=%d)', i, start);
        
        // possible match

        // there are faster string search algorithms, but we don't expect to be
        // splitting on long or complex delimiters, so implementing them is not
        // really worth it. instead, we do it the naive way
        for (j = 1; j < this.splitter.length; j++) {
            if (i + j >= this.bl.length) {
                debug('Match failed @ %d: reached end of data', i + j);
                continue outer;
            }
            if (iter.get(i+j) !== this.splitter[j]) {
                debug('Match failed @ %d', i+j);
                continue outer;
            }
        }
        j--;
        
        // match
        
        if (start === i) {
            debug('Empty match @ %d', start);
            // empty match
            this.push(new Buffer(0));
        } else {
            debug('Match @ %d-%d, emitting %d-%d', i, i+j, start, i-1);
            this.push(this.bl.slice(start, i));
            
        }
        
        // continue loop from after the splitter
        i += j;
        start = i+1;
    }
    
    if (start === i) {
        // the end of this data is the end of a match; remember for _flush
        this.trailingDelim = true;
    }
    
    // throw out old buffers
    if (start) {
        debug('Consuming %d bytes', start);
        this.bl.consume(start);
    }
    
    callback();
};
Split.prototype._flush = function (callback) {
    if (this.trailingDelim) {
        debug('Pushing empty buffer (trailing delim)');
        this.push(new Buffer(0));
    } else if (this.bl.length) {
        debug('Flushing leftovers');
        this.push(this.bl.slice());
    }
    this.bl.destroy();

    callback();
};

module.exports = Split;
