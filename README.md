# Notice

Due to changes in the Buffer implementation from node 0.12 to node 4.0, this module suffers a critical performance penalty. My intent with this module was to implement a streams2 buffer splitter that supported laziness; beating 'binary-split' in performance was a pleasant surprise... but currently, under node 4.0, that module sees about 6 times the throughput of this one, so if you don't care about laziness, I recommend using `binary-split` until I can discern why this module is losing its speed.

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

### Other modules

`split` is a useful module and more full-featured than this, but it uses `through` which seems to only provide old-style (streams1) streams. Streams2 streams can be lazy, and that's helpful. There is also a module called `binary-split` which does more or less the same thing as this module, but also uses `through` and seems abandoned.

`binary-split` makes a bit of a case for performance, so I tested this module to make sure I wasn't putting out something "worse" than that module; this module runs about 150% as fast as that one in a simple test utilizing a similar scenario to the one described there (2.4 gb file with ~ 500 byte lines, split on newline).
