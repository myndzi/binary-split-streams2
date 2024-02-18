import { Transform } from 'node:stream';

// import Debug from 'debug';
// const debug = Debug('split');

export type SplitOpts = {
  maxBuffer?: number;
  strictTruncation?: boolean;
};

export class Split extends Transform {
  maxBuffer: number;
  strictTruncation: boolean;
  buf: Buffer;
  splitter: Buffer;
  trailingDelim: boolean;
  pushFn: (typeof this)['push'];

  constructor(splitter: string | Buffer, opts: SplitOpts) {
    super({ readableObjectMode: true });
    // debug(opts);

    this.maxBuffer = opts.maxBuffer || Infinity;
    this.strictTruncation = !!opts.strictTruncation;
    this.buf = Buffer.alloc(0);
    this.splitter = Buffer.from(splitter);
    this.trailingDelim = true;
    this.pushFn = this.strictTruncation ? this.pushTruncated : this.push;
  }

  pushTruncated(chunk: Buffer): boolean {
    let res: boolean;
    if (chunk.length > this.maxBuffer) {
      res = this.push(chunk.subarray(-this.maxBuffer));
      this.emit('truncated', chunk.length - this.maxBuffer);
    } else {
      res = this.push(chunk);
    }
    return res;
  }

  _transform(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null, data?: any) => void): void {
    let i = 0;
    let start = 0;

    this.trailingDelim = false;

    if (this.splitter.length === 0) {
      //debug('Empty splitter loop');
      for (i = 0; i < chunk.length; i++) {
        this.push(chunk.subarray(i, i + 1));
      }
      callback();
      return;
    }

    i = Math.max(0, this.buf.length - this.splitter.length + 1);
    //debug('_transform searching from %d', i);

    this.buf = Buffer.concat([this.buf, chunk]);

    while ((i = this.buf.indexOf(this.splitter, i)) > -1) {
      // match

      if (start === i) {
        // empty match
        //debug('Empty match @ %d', start);
        this.push(Buffer.alloc(0));
      } else {
        //debug('Match @ %d, emitting %d-%d', i, start, i-1);
        this.pushFn(this.buf.subarray(start, i));
      }

      // continue loop from after the splitter
      i += this.splitter.length;
      start = i;
    }

    // throw out old buffers
    if (start) {
      //debug('Consuming %d bytes', start);
      this.buf = this.buf.subarray(start);
    }

    // if the buffer is empty, the end of the last chunk was
    // a splitter; in this case, we want to flush an empty chunk
    // at the end, so keep track of it
    this.trailingDelim = this.buf.length === 0;

    var extra = this.buf.length - this.maxBuffer;
    if (extra > 0) {
      this.buf = this.buf.subarray(-this.maxBuffer);
      this.emit('truncated', extra);
    }

    callback();
  }

  _flush(callback: (error?: Error | null, data?: any) => void): void {
    //debug('flush', this.trailingDelim, this.buf.length);
    if (this.trailingDelim) {
      //debug('Pushing empty buffer (trailing delim)');
      this.push(Buffer.alloc(0));
    } else if (this.buf.length) {
      //debug('Flushing leftovers');
      this.pushFn(this.buf);
    }

    callback();
  }
}

export function split(): Split;
export function split(splitter: string | Buffer): Split;
export function split(opts: SplitOpts): Split;
export function split(splitter: string | Buffer, opts: SplitOpts): Split;
export function split(splitter?: string | Buffer | SplitOpts, opts?: SplitOpts): Split {
  // valid values for _splitter are strings and buffers
  // anything else gets counted as an options bag if there is only one argument,
  // and the splitter will be the default
  if (typeof splitter === 'object' && !Buffer.isBuffer(splitter) && arguments.length === 1) {
    opts = splitter;
    splitter = void 0;
  }
  opts ??= {};

  let _splitter: Buffer | undefined;
  if (Buffer.isBuffer(splitter)) {
    _splitter = Buffer.from(splitter);
  } else if (typeof splitter === 'string') {
    _splitter = Buffer.from(splitter);
  } else if (splitter === void 0) {
    _splitter = Buffer.from(require('os').EOL);
  }

  if (!Buffer.isBuffer(_splitter)) {
    throw new Error('Invalid splitter: ' + splitter);
  }

  if (Object.prototype.hasOwnProperty.call(opts, 'maxBuffer')) {
    if (typeof opts.maxBuffer !== 'number' || opts.maxBuffer < 1 || !Number.isFinite(opts.maxBuffer) || !Number.isInteger(opts.maxBuffer)) {
      throw new Error('Invalid maxBuffer: ' + opts.maxBuffer);
    }

    if (opts.maxBuffer <= _splitter.length) {
      throw new Error('maxBuffer must be greater than the length of the splitter');
    }
  }

  return new Split(_splitter, opts);
}
