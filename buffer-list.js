'use strict';

function BufferList() {
    this.bufs = [ ];
    this.lengths = [ ];
    this.pos = 0;
    this.num = 0;
    this.i = 0;
    this.length = 0;
}
BufferList.prototype.push = function (buf) {
    this.bufs.push(buf);
    this.lengths.push(buf.length);
    this.length += buf.length;
};
BufferList.prototype.get = function (i) {
    if (i > this.length || i < 0) { return; }

    if (i > this.i) { this.seekForward(i); }
    else if (i < this.i) { this.seekBackward(i); }

    return this.bufs[this.num][this.pos];
};
BufferList.prototype.seekForward = function (i) {
    var targ = this.pos + (i - this.i);

    while (targ >= this.lengths[this.num]) {
        targ -= this.lengths[this.num];
        this.num++;
    }
    this.pos = targ;
    this.i = i;
};
BufferList.prototype.seekBackward = function (i) {
    var diff = this.i - i;
    
    if (diff > this.pos) {
        diff -= this.pos;
        this.pos = 0;
    }
    
    while (diff) {
        this.num--;
        if (this.lengths[this.num] > diff) {
            this.pos = this.lengths[this.num] - diff;
            break;
        }
        diff -= this.lengths[this.num];
    }
    this.i = i;
};
BufferList.prototype.slice = function (start, end) {
    if (start === void 0) { start = 0; }
    if (end === void 0) { end = this.length; }
    else if (end < 0) { end = this.length + end; }
    
    var num = 0, pos = 0, i = 0;
    while (i < start) {
        if (i + this.lengths[num] < start) {
            i += this.lengths[num];
            num++;
        } else {
            pos = start - i;
            i = start;
        }
    }
    
    var startNum = num, startPos = pos;
    
    var j = i - pos;
    pos = 0;
    
    while (j < end) {
        if (j + this.lengths[num] < end) {
            j += this.lengths[num];
            num++;
        } else {
            pos = end - j;
            j = end;
        }
    }
    
    var endNum = num, endPos = pos;
    
    if (startNum === endNum) {
        return this.bufs[startNum].slice(startPos, endPos);
    }
    
    var bufs = [ ];
    num = startNum;
    if (startPos > 0) {
        bufs.push(this.bufs[num].slice(startPos));
        num++;
    }
    while (num < endNum) {
        bufs.push(this.bufs[num]);
        num++;
    }
    bufs.push(this.bufs[num].slice(0, endPos));
    
    return Buffer.concat(bufs);
};
BufferList.prototype.consume = function (bytes) {
    while (this.bufs.length) {
        if (bytes >= this.lengths[0]) {
            bytes -= this.lengths[0];
            this.length -= this.lengths[0];
            this.bufs.shift();
            this.lengths.shift();
        } else {
            this.bufs[0] = this.bufs[0].slice(bytes);
            this.lengths[0] -= bytes;
            this.length -= bytes;
            break;
        }
    }
    this.pos = 0;
    this.num = 0;
    this.i = 0;
};
BufferList.prototype.destroy = function () {
    this.bufs.length = 0;
};

module.exports = BufferList;