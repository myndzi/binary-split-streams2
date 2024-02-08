import { PassThrough } from 'node:stream';
import { EOL } from 'node:os';

import { Split, SplitOpts, split } from './index';

const test = (split: Split, input: string[]) =>
  new Promise<string[]>((resolve, reject) => {
    const pt = new PassThrough();

    setImmediate(function next() {
      if (input.length === 0) {
        pt.end();
      } else {
        pt.write(input.shift());
        setImmediate(next);
      }
    });

    const _split = pt.pipe(split);
    const res: string[] = [];

    _split.on('data', (chunk: Buffer) => {
      res.push(chunk.toString());
    });
    _split.on('end', () => {
      resolve(res);
    });

    _split.on('error', reject);

    pt.on('error', reject);
  });

describe('Arguments', function () {
  it("splitter should default to require('os').EOL", async () => {
    const res = await test(split(), ['a\nb']);
    expect(res).toEqual(['a', 'b']);
  });
  describe('should throw on non-string, non-Buffer inputs', () => {
    it.each([null, 1, new Date(), {}, [], Infinity, NaN, true, false])('%p', (item: any) => {
      expect(() => split(item as any, {})).toThrow(/Invalid splitter/);
    });
  });
  describe('should only allow positive integers for maxBuffer', () => {
    it.each([null, void 0, -1, 0, -0, new Date(), {}, [], Infinity, -Infinity, NaN, true, false])('%p', (item: any) => {
      expect(() => split({ maxBuffer: item })).toThrow(/Invalid maxBuffer/);
      expect(() => split('foo', { maxBuffer: item as any })).toThrow(/Invalid maxBuffer/);
    });
  });
  it('should fail if maxBuffer is <= the splitter size', () => {
    expect(() => split('foo', { maxBuffer: 1 })).toThrow(/maxBuffer must be greater/);
    expect(() => split('foo', { maxBuffer: 3 })).toThrow(/maxBuffer must be greater/);
    expect(() => split('foo', { maxBuffer: 4 })).not.toThrow();
  });
});
describe('Zero char delimiter', () => {
  it('emits single characters', async () => {
    const res = await test(split(''), ['abcde']);
    expect(res).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
describe('Sanity', function () {
  // if you do this with just the passthrough stream, pt.read() will return 'a.bc.d' instead of 'a.b' then 'c.d'
  // this is just checking that the streams still behave as expected -- one value read per call to .push() in _transform
  it('should not combine outputs', async () => {
    const pt = new PassThrough();
    const stream = pt.pipe(split('.'));
    pt.write('a.b');
    pt.end('c.d');
    await new Promise<void>(resolve => {
      setImmediate(() => {
        expect(stream.read().toString()).toEqual('a');
        expect(stream.read().toString()).toEqual('bc');
        expect(stream.read().toString()).toEqual('d');
      });
      resolve();
    });
  });
  it('should disallow mutating the splitter', () => {
    const buf = Buffer.from('.');
    const stream = split(buf);
    buf[0] = 0;
    stream.end('a.b');
    expect(stream.read().toString()).toEqual('a');
    expect(stream.read().toString()).toEqual('b');
  });
  describe('argument handling', () => {
    it('accepts a buffer', async () => {
      const res = await test(split(Buffer.from('.')), ['a.b']);
      expect(res).toEqual(['a', 'b']);
    });
    it('accepts a buffer with options', async () => {
      const res = await test(split(Buffer.from('.'), {}), ['a.b']);
      expect(res).toEqual(['a', 'b']);
    });
    it('accepts a string', async () => {
      const res = await test(split('.'), ['a.b']);
      expect(res).toEqual(['a', 'b']);
    });
    it('accepts a string with options', async () => {
      const res = await test(split('.', {}), ['a.b']);
      expect(res).toEqual(['a', 'b']);
    });
    it('accepts options, with default splitter', async () => {
      const res = await test(split({}), ['a' + EOL + 'b']);
      expect(res).toEqual(['a', 'b']);
    });
    it('works with default splitter', async () => {
      const res = await test(split(), ['a' + EOL + 'b']);
      expect(res).toEqual(['a', 'b']);
    });
  });
});
describe('maxBuffer', function () {
  const testTruncation = (splitter: string, opts: SplitOpts, inputs: string[]) =>
    new Promise<{ outputs: string[]; chunks: Buffer[] }>((resolve, reject) => {
      const outputs: string[] = [];
      const chunks: Buffer[] = [];
      const stream = split(splitter, opts);

      stream.on('truncated', function (amount) {
        outputs.push(amount);
      });
      stream.on('data', function (chunk) {
        chunks.push(chunk.toString());
      });
      function read() {
        while (1) {
          var chunk = stream.read();
          if (chunk === null) {
            break;
          }
          outputs.push(chunk.toString());
        }
      }
      inputs.forEach(function (input) {
        stream.write(input);
        read();
      });
      stream.end();
      read();

      resolve({ outputs: outputs, chunks: chunks });
    });

  it('should truncate and emit if it accumulates > maxBuffer data (chunk.length < maxBuffer)', async () => {
    const res = (await testTruncation('#!', { maxBuffer: 5 }, ['12345', '678'])).outputs;
    expect(res).toEqual([3]);
  });
  it('should truncate and emit if it accumulates > maxBuffer data (chunk.length === maxBuffer)', async () => {
    const res = (await testTruncation('#!', { maxBuffer: 5 }, ['12345', '67890'])).outputs;
    expect(res).toEqual([5]);
  });
  it('should truncate and emit if it accumulates > maxBuffer data (chunk.length > maxBuffer)', async () => {
    const res = (await testTruncation('#!', { maxBuffer: 5 }, ['12345', '6789012'])).outputs;
    expect(res).toEqual([7]);
  });
  it('should emit for each truncated chunk', async () => {
    const res = (await testTruncation('#!', { maxBuffer: 5 }, ['12345', '6', '7', '8', '90'])).outputs;
    expect(res).toEqual([1, 1, 1, 2]);
    const res2 = (await testTruncation('#!', { maxBuffer: 7 }, ['12345', '6', '7', '8', '90'])).outputs;
    expect(res2).toEqual([1, 2]);
  });
  it('should emit chunks longer than maxBuffer when received all at once', async () => {
    const res = (await testTruncation('.', { maxBuffer: 2 }, ['abcdefg.'])).outputs;
    expect(res).toEqual([]);
  });
  it('should truncate chunks longer than maxBuffer when received in pieces', async () => {
    const res = (await testTruncation('.', { maxBuffer: 2 }, ['abc', 'def', 'g.'])).outputs;
    expect(res).toEqual([1, 3]);
  });
  it('should always truncate the flushed data', async () => {
    const res = (await testTruncation('.', { maxBuffer: 2 }, ['abcdefg'])).outputs;
    expect(res).toEqual([5]);
  });
  it('should emit all the chunks it can before truncation', async () => {
    const res = (await testTruncation('.', { maxBuffer: 2 }, ['aaa.bbb.ccc'])).outputs;
    expect(res).toEqual([1]);
    const res2 = (await testTruncation('.', { maxBuffer: 2 }, ['aaa.bbb', '.ccc'])).chunks;
    expect(res2).toEqual(['aaa', 'bb', 'cc']);
  });
  it('should not truncate', async () => {
    const res = (await testTruncation('#!', {}, ['12345', '6', '7', '8', '90'])).outputs;
    expect(res).toEqual([]);
  });
  describe('strict truncation', () => {
    it('should NOT emit chunks longer than maxBuffer when received all at once', async () => {
      const res = (await testTruncation('.', { maxBuffer: 2, strictTruncation: true }, ['abcdefg.'])).outputs;
      expect(res).toEqual([5]);
      const res2 = (await testTruncation('.', { maxBuffer: 2, strictTruncation: true }, ['abcdefg.'])).chunks;
      expect(res2).toEqual(['fg', '']);
    });
    it('should truncate chunks longer than maxBuffer when received in pieces', async () => {
      const res = (await testTruncation('.', { maxBuffer: 2, strictTruncation: true }, ['abc', 'def', 'g.'])).outputs;
      expect(res).toEqual([1, 3, 1]);
      const res2 = (await testTruncation('.', { maxBuffer: 2, strictTruncation: true }, ['abc', 'def', 'g.'])).chunks;
      expect(res2).toEqual(['fg', '']);
    });
    it('should truncate the flushed data', async () => {
      const res = (await testTruncation('.', { maxBuffer: 2, strictTruncation: true }, ['abcdefg'])).outputs;
      expect(res).toEqual([5]);
      const res2 = (await testTruncation('.', { maxBuffer: 2, strictTruncation: true }, ['abcdefg'])).chunks;
      expect(res2).toEqual(['fg']);
    });
    it('should truncate every chunk', async () => {
      const res = (await testTruncation('.', { maxBuffer: 2, strictTruncation: true }, ['aaa.bbb.ccc'])).outputs;
      expect(res).toEqual([1, 1, 1]);
      const res2 = (await testTruncation('.', { maxBuffer: 2, strictTruncation: true }, ['aaa.bbb', '.ccc'])).chunks;
      expect(res2).toEqual(['aa', 'bb', 'cc']);
    });
  });
  describe('sanity', () => {
    const byteSumSanityTest = (strictTruncation: boolean, splitter: string, loopSize: number) =>
      new Promise<{ bytesRead: number; splitterBytes: number; bytesTruncated: number; bytesWritten: number }>((resolve, reject) => {
        const stream = split(splitter, { maxBuffer: 5 });
        // a.b.c -> 'data' events is one greater than the number of splitters
        // a.b.c. -> same as number of splitters
        // for simplicity, we ensure we don't end on a splitter and subtract one
        // splitter's worth of bytes initially
        let bytesWritten = 0;
        let bytesRead = 0;
        let splitterBytes = -splitter.length;
        let bytesTruncated = 0;
        stream.on('data', (chunk: Buffer) => {
          splitterBytes += splitter.length;
          bytesRead += chunk.length;
        });
        stream.on('truncated', (amount: number) => {
          bytesTruncated += amount;
        });
        stream.on('end', () => {
          resolve({ bytesWritten, bytesRead, splitterBytes, bytesTruncated });
          // bytesWritten.should.equal(bytesRead + splitterBytes + bytesTruncated);
          // cb(bytesWritten, bytesRead, splitterBytes, bytesTruncated);
        });
        let i: number;
        let tmp: string;
        for (i = 0; i < loopSize; i++) {
          tmp = Math.random()
            .toString(31)
            .slice(Math.floor(Math.random() * 10) + 2);
          bytesWritten += tmp.length;
          stream.write(tmp);
        }
        bytesWritten++;
        stream.end('z'); // ensures we don't end on the splitter
      });
    it.each(
      new Array(5).fill(0).flatMap((_, i) => [
        { strict: false, splitter: 'a', iter: i + 1 },
        { strict: false, splitter: 'aa', iter: i + 1 },
        { strict: true, splitter: 'a', iter: i + 1 },
        { strict: true, splitter: 'aa', iter: i + 1 },
      ])
    )('should account for every byte (sample $iter, strict: $strict, splitter: $splitter)', async ({ strict, splitter }) => {
      const { bytesRead, splitterBytes, bytesTruncated, bytesWritten } = await byteSumSanityTest(strict, splitter, 1000);
      expect(bytesWritten).toEqual(bytesRead + splitterBytes + bytesTruncated);
    });
  });
});
describe('Empty delimiter', () => {
  it('emits every byte separately', async () => {
    const res = await test(split(''), ['abc']);
    expect(res).toEqual(['a', 'b', 'c']);
  });
});
describe('Single char delimiter', () => {
  it('one chunk', async () => {
    const res = await test(split('.'), ['a.b']);
    expect(res).toEqual(['a', 'b']);
  });
  it('aligned chunks', async () => {
    const res = await test(split('.'), ['a.', 'b']);
    expect(res).toEqual(['a', 'b']);
  });
  it('misaligned chunks', async () => {
    const res = await test(split('.'), ['a.b', 'c.d']);
    expect(res).toEqual(['a', 'bc', 'd']);
  });
  it('late delimiter', async () => {
    const res = await test(split('.'), ['a', 'b', 'c.d']);
    expect(res).toEqual(['abc', 'd']);
  });
  it('no delimiter, one chunk', async () => {
    const res = await test(split('.'), ['abc']);
    expect(res).toEqual(['abc']);
  });
  it('no delimiter, multiple chunks', async () => {
    const res = await test(split('.'), ['a', 'b', 'c']);
    expect(res).toEqual(['abc']);
  });
  it('empty token at start', async () => {
    const res = await test(split('.'), ['.a']);
    expect(res).toEqual(['', 'a']);
  });
  it('empty token in middle', async () => {
    const res = await test(split('.'), ['a..b']);
    expect(res).toEqual(['a', '', 'b']);
  });
  it('empty token at end', async () => {
    const res = await test(split('.'), ['a.']);
    expect(res).toEqual(['a', '']);
  });
  it('all empty tokens', async () => {
    const res = await test(split('.'), ['.', '..']);
    expect(res).toEqual(['', '', '', '']);
  });
  it('empty string', async () => {
    const res = await test(split('.'), ['']);
    expect(res).toEqual(['']);
  });
});
describe('Multi-char delimiter', () => {
  it('aligned chunks', async () => {
    const res = await test(split('#!'), ['a#!', 'b']);
    expect(res).toEqual(['a', 'b']);
  });
  it('misaligned chunks', async () => {
    const res = await test(split('#!'), ['a#!b', 'c#!d']);
    expect(res).toEqual(['a', 'bc', 'd']);
  });
  it('late delimiter', async () => {
    const res = await test(split('#!'), ['a', 'b', 'c#!d']);
    expect(res).toEqual(['abc', 'd']);
  });
  it('no delimiter, one chunk', async () => {
    const res = await test(split('#!'), ['abc']);
    expect(res).toEqual(['abc']);
  });
  it('no delimiter, multiple chunks', async () => {
    const res = await test(split('#!'), ['a', 'b', 'c']);
    expect(res).toEqual(['abc']);
  });
  it('empty token at start', async () => {
    const res = await test(split('#!'), ['#!a']);
    expect(res).toEqual(['', 'a']);
  });
  it('empty token in middle', async () => {
    const res = await test(split('#!'), ['a#!#!b']);
    expect(res).toEqual(['a', '', 'b']);
  });
  it('empty token at end', async () => {
    const res = await test(split('#!'), ['a#!']);
    expect(res).toEqual(['a', '']);
  });
  it('all empty tokens', async () => {
    const res = await test(split('#!'), ['#!', '#!#!']);
    expect(res).toEqual(['', '', '', '']);
  });
  it('empty string', async () => {
    const res = await test(split('#!'), ['']);
    expect(res).toEqual(['']);
  });
  it('split delimiter', async () => {
    const res = await test(split('#!'), ['a#', '!b#!c']);
    expect(res).toEqual(['a', 'b', 'c']);
  });
  it('false positive', async () => {
    const res = await test(split('#!'), ['a#b']);
    expect(res).toEqual(['a#b']);
  });
  it('many chunk span', async () => {
    const res = await test(split('bcdef'), ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(res).toEqual(['a', 'g']);
  });
  it('partial match ending the stream', async () => {
    const res = await test(split('bcdef'), ['a', 'b', 'c', 'd', 'e']);
    expect(res).toEqual(['abcde']);
  });
});
