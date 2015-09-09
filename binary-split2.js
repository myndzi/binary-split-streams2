var bops = require('bops')
var os = require('os')

var Transform = require('stream').Transform,
    inherits = require('util').inherits;

module.exports = BinarySplit

function BinarySplit(matcher) {
  if (!(this instanceof BinarySplit)) return new BinarySplit(matcher)
  Transform.call(this);
  
  this.matcher = bops.from(matcher || os.EOL)
  this.buffered = void 0
  this.bufcount = 0
}
inherits(BinarySplit, Transform);
BinarySplit.prototype._transform = function (buf, encoding, callback) {
  this.bufcount++
  var offset = 0
      
  if (this.buffered) {
    buf = bops.join([this.buffered, buf])
    this.buffered = void 0
  }
  
  while (buf) {
    var idx = this.firstMatch(buf, offset)
    if (idx) {
      var line = bops.subarray(buf, offset, idx)
      if (idx === buf.length) {
        this.buffered = line
        buf = void 0
        offset = idx
      } else {
        this.push(line)
        offset = idx + this.matcher.length
      }
    } else if (idx === 0) {
      buf = bops.subarray(buf, offset + this.matcher.length)
    } else {
      if (offset >= buf.length) {
        this.buffered = void 0
      } else {
        this.buffered = buf
      }
      buf = void 0
    }
  }
  callback()
};
BinarySplit.prototype._flush = function (callback) {
  if (this.buffered) this.push(this.buffered)
  callback()
};
  
BinarySplit.prototype.firstMatch = function (buf, offset) {
  var i = offset
  if (offset >= buf.length) return false
  for (var i = offset; i < buf.length; i++) {
    if (buf[i] === this.matcher[0]) {
      if (this.matcher.length > 1) {
        var fullMatch = true
        for (var j = i, k = 0; j < i + this.matcher.length; j++, k++) {
          if (buf[j] !== this.matcher[k]) {
            fullMatch = false
            break
          }
        }
        if (fullMatch) return j - this.matcher.length
      } else {
        break
      }
    }
  }

  var idx = i + this.matcher.length - 1
  return idx
}

module.exports = BinarySplit;
