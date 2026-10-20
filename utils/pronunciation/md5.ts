// Streaming MD5 (RFC 1321) for the model integrity check; Web Crypto has no MD5 and no incremental digest.

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
  9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
  16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
  21,
];
const K = Array.from(
  { length: 64 },
  (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0
);

export class Md5 {
  private a = 0x67452301;
  private b = 0xefcdab89;
  private c = 0x98badcfe;
  private d = 0x10325476;
  private readonly block = new Uint8Array(64);
  private readonly words = new Uint32Array(16);
  private blockLen = 0;
  private total = 0;

  update(data: Uint8Array): this {
    let i = 0;
    this.total += data.length;
    if (this.blockLen > 0) {
      const take = Math.min(64 - this.blockLen, data.length);
      this.block.set(data.subarray(0, take), this.blockLen);
      this.blockLen += take;
      i = take;
      if (this.blockLen < 64) return this;
      this.compress(this.block, 0);
      this.blockLen = 0;
    }
    for (; i + 64 <= data.length; i += 64) this.compress(data, i);
    if (i < data.length) {
      this.block.set(data.subarray(i), 0);
      this.blockLen = data.length - i;
    }
    return this;
  }

  hex(): string {
    const bits = this.total * 8;
    const pad = new Uint8Array(
      (this.blockLen < 56 ? 56 : 120) - this.blockLen + 8
    );
    pad[0] = 0x80;
    const lenAt = pad.length - 8;
    pad[lenAt] = bits & 0xff;
    pad[lenAt + 1] = (bits >>> 8) & 0xff;
    pad[lenAt + 2] = (bits >>> 16) & 0xff;
    pad[lenAt + 3] = (bits >>> 24) & 0xff;
    const high = Math.floor(bits / 2 ** 32);
    pad[lenAt + 4] = high & 0xff;
    pad[lenAt + 5] = (high >>> 8) & 0xff;
    pad[lenAt + 6] = (high >>> 16) & 0xff;
    pad[lenAt + 7] = (high >>> 24) & 0xff;
    const total = this.total;
    this.update(pad);
    this.total = total;
    let out = '';
    for (const v of [this.a, this.b, this.c, this.d]) {
      for (let k = 0; k < 4; k++)
        out += ((v >>> (k * 8)) & 0xff).toString(16).padStart(2, '0');
    }
    return out;
  }

  private compress(buf: Uint8Array, at: number): void {
    const w = this.words;
    for (let j = 0; j < 16; j++) {
      const o = at + j * 4;
      w[j] =
        buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24);
    }
    let a = this.a;
    let b = this.b;
    let c = this.c;
    let d = this.d;
    for (let j = 0; j < 64; j++) {
      let f: number;
      let g: number;
      if (j < 16) {
        f = (b & c) | (~b & d);
        g = j;
      } else if (j < 32) {
        f = (d & b) | (~d & c);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        f = b ^ c ^ d;
        g = (3 * j + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * j) % 16;
      }
      const sum = (a + f + K[j] + w[g]) | 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((sum << S[j]) | (sum >>> (32 - S[j])))) | 0;
    }
    this.a = (this.a + a) | 0;
    this.b = (this.b + b) | 0;
    this.c = (this.c + c) | 0;
    this.d = (this.d + d) | 0;
  }
}
