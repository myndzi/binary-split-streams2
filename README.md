# binary-split-streams2

This module is a simple streams2 implementation of a stream tokenizer. It takes a stream in, and emits the chunks between the specified delimiter, in the same way as `String.prototype.split` makes arrays from a string.

This module operates entirely on buffers and is implemented as a Transform stream. There are no dependencies. This could cause problems with certain delimiters depending on the character encoding of the input; be aware of this. For my purpose (splitting JSON on newlines), it will work just fine; newlines can't be embedded in UTF-8 characters.

# Usage

    var split = require('binary-split-streams2');
    require('fs').createReadStream(__filename)
		.pipe(split())
		.on('data', function (chunk) {
            console.log(chunk);
        });

You can specify the empty string, `''` to split between every character, just like with `String.prototype.split`. The default delimiter is `require('os').EOL`.

# Truncation

As of version 1.1.0, you may specify a max size of the internal buffer. The buffer is truncated to be no greater than this size *before* emitting new lines, so it is possible that this package will not emit a full line, even if that line fits within the buffer. Size accordingly.

When the buffer is truncated, the stream will emit a 'truncated' event with the amount of bytes that were dropped.

    var split = require('binary-split-streams2');
    require('fs').createReadStream(__filename)
		.pipe(split({maxBuffer: 1000}))
		.on('data', function (chunk) {
            console.log(chunk);
        })
        .on('truncated', function (amount) {
            console.log('dropped %d bytes from the input stream', amount);
        });

### Other modules

`split` is a useful module and more full-featured than this, but it uses `through` which seems to only provide old-style (streams1) streams. Streams2 streams can be lazy, and that's helpful. There is also a module called `binary-split` which does more or less the same thing as this module, but also uses `through` and seems abandoned.

`binary-split` makes a bit of a case for performance, so I tested this module to make sure I wasn't putting out something "worse" than that module; this module runs about 150% as fast as that one in a simple test utilizing a similar scenario to the one described there (2.4 gb file with ~ 500 byte lines, split on newline). Recent versions of `binary-split` have been equal to or faster than this module, however as of version 1.1.0, in node 4.0 or higher, this module is again much faster.

