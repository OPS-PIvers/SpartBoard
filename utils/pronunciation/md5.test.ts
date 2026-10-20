import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Md5 } from './md5';

const nodeMd5 = (data: Uint8Array) =>
  createHash('md5').update(data).digest('hex');

describe('Md5', () => {
  it('matches the RFC 1321 test vectors', () => {
    const enc = new TextEncoder();
    expect(new Md5().update(enc.encode('')).hex()).toBe(
      'd41d8cd98f00b204e9800998ecf8427e'
    );
    expect(new Md5().update(enc.encode('abc')).hex()).toBe(
      '900150983cd24fb0d6963f7d28e17f72'
    );
  });

  it('matches node:crypto for every length around block edges, fed in odd chunks', () => {
    const data = Uint8Array.from(
      { length: 300 },
      (_, i) => (i * 37 + 11) & 0xff
    );
    for (let len = 0; len <= 200; len++) {
      const slice = data.subarray(0, len);
      const md5 = new Md5();
      for (let at = 0; at < len; at += 7)
        md5.update(slice.subarray(at, at + 7));
      expect(md5.hex()).toBe(nodeMd5(slice));
    }
  });

  it('matches node:crypto on a large buffer', () => {
    const data = Uint8Array.from(
      { length: 1_000_003 },
      (_, i) => (i * 131) & 0xff
    );
    const md5 = new Md5();
    for (let at = 0; at < data.length; at += 65_536)
      md5.update(data.subarray(at, at + 65_536));
    expect(md5.hex()).toBe(nodeMd5(data));
  });
});
