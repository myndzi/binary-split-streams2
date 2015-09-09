module.exports = {
  join: function (arr) { return Buffer.concat(arr); },
  subarray: function (buf, from, to) { return arguments.length === 2 ? buf.slice(from) : buf.slice(from, to); },
  from: function (arg) { return new Buffer(arg); }
};
