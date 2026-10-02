// Adds Segment>Info>Duration to a timesliced MediaRecorder WebM so <audio> gets a finite duration (PLC meeting recording).
const ID = {
  EBML: 0x1a45dfa3,
  Segment: 0x18538067,
  Info: 0x1549a966,
  Duration: 0x4489,
  TimecodeScale: 0x2ad7b1,
  Cluster: 0x1f43b675,
  Timecode: 0xe7,
  SimpleBlock: 0xa3,
  SeekHead: 0x114d9b74,
} as const;

interface Vint {
  v: number;
  len: number;
  unknown: boolean;
}

function vint(b: Buffer, o: number, keepMarker: boolean): Vint {
  if (o >= b.length) throw new Error(`vint past end at ${o}`);
  const f = b[o];
  let len = 1;
  while (len <= 8 && !(f & (0x80 >> (len - 1)))) len++;
  if (len > 8 || o + len > b.length) throw new Error(`bad vint at ${o}`);
  let v = keepMarker ? f : f & (0xff >> len);
  let ones = (f & (0xff >> len)) === 0xff >> len;
  for (let i = 1; i < len; i++) {
    v = v * 256 + b[o + i];
    if (b[o + i] !== 0xff) ones = false;
  }
  return { v, len, unknown: !keepMarker && ones };
}

function encSize(n: number, minLen: number): Buffer {
  let len = Math.max(minLen, 1);
  while (len < 8 && n >= 2 ** (7 * len) - 1) len++;
  const out = Buffer.alloc(len);
  let v = n;
  for (let i = len - 1; i >= 0; i--) {
    out[i] = v & 0xff;
    v = Math.floor(v / 256);
  }
  out[0] |= 0x80 >> (len - 1);
  return out;
}

interface Header {
  id: number;
  idLen: number;
  sizeLen: number;
  size: number | null;
  data: number;
}

function header(b: Buffer, o: number): Header {
  const id = vint(b, o, true);
  const sz = vint(b, o + id.len, false);
  return {
    id: id.v,
    idLen: id.len,
    sizeLen: sz.len,
    size: sz.unknown ? null : sz.v,
    data: o + id.len + sz.len,
  };
}

function tryHeader(b: Buffer, o: number): Header | null {
  try {
    return header(b, o);
  } catch {
    return null;
  }
}

/** Opus packet duration in ms from its TOC byte (RFC 6716 section 3.1). */
export function opusPacketMs(pkt: Buffer): number {
  if (pkt.length === 0) return 0;
  const toc = pkt[0];
  const cfg = toc >> 3;
  const c = toc & 3;
  const frame =
    cfg < 12
      ? [10, 20, 40, 60][cfg & 3]
      : cfg < 16
        ? [10, 20][cfg & 1]
        : [2.5, 5, 10, 20][cfg & 3];
  const n = c === 0 ? 1 : c < 3 ? 2 : pkt.length > 1 ? pkt[1] & 0x3f : 0;
  return frame * n;
}

function readUInt(b: Buffer, at: number, size: number): number {
  if (size < 1 || size > 6 || at + size > b.length) {
    throw new Error('bad uint');
  }
  return b.readUIntBE(at, size);
}

function segmentStart(b: Buffer): { segOff: number; seg: Header } {
  const ebml = header(b, 0);
  if (ebml.id !== ID.EBML || ebml.size === null) throw new Error('not EBML');
  const segOff = ebml.data + ebml.size;
  const seg = header(b, segOff);
  if (seg.id !== ID.Segment) throw new Error('no Segment');
  return { segOff, seg };
}

function timecodeScale(b: Buffer, seg: Header): number {
  for (let o = seg.data; o < b.length; ) {
    const h = header(b, o);
    if (h.id === ID.Cluster || h.size === null) break;
    if (h.id === ID.Info) {
      for (let p = h.data; p < h.data + h.size; ) {
        const c = header(b, p);
        if (c.size === null) break;
        if (c.id === ID.TimecodeScale) return readUInt(b, c.data, c.size);
        p = c.data + c.size;
      }
    }
    o = h.data + h.size;
  }
  return 1e6;
}

/** End time of the last block, from the last parseable Cluster scanning backwards so a corrupt splice can't cut it short. */
export function computeDurationMs(b: Buffer): number {
  const { seg } = segmentStart(b);
  const scale = timecodeScale(b, seg);
  const tag = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
  for (let at = b.lastIndexOf(tag); at > 0; at = b.lastIndexOf(tag, at - 1)) {
    try {
      const h = header(b, at);
      const tcEl = header(b, h.data);
      if (tcEl.id !== ID.Timecode || tcEl.size === null) continue;
      const tc = readUInt(b, tcEl.data, tcEl.size);
      let last = (tc * scale) / 1e6;
      const end =
        h.size === null ? b.length : Math.min(b.length, h.data + h.size);
      for (let p = tcEl.data + tcEl.size; p < end; ) {
        const c = tryHeader(b, p);
        if (!c || c.size === null || c.data + c.size > b.length) break;
        if (c.id === ID.SimpleBlock) {
          const tn = vint(b, c.data, false);
          const rel = b.readInt16BE(c.data + tn.len);
          const pkt = b.subarray(c.data + tn.len + 3, c.data + c.size);
          last = Math.max(last, ((tc + rel) * scale) / 1e6 + opusPacketMs(pkt));
        }
        p = c.data + c.size;
      }
      return last;
    } catch {
      // A false match inside a payload; keep scanning backwards.
    }
  }
  throw new Error('no Cluster found');
}

/** Returns a copy with Info's Duration set; throws when the layout is not the timeslice shape it expects. */
export function injectDuration(b: Buffer, durationMs: number): Buffer {
  const { segOff, seg } = segmentStart(b);
  let info: Header | null = null;
  let infoOff = 0;
  for (let o = seg.data; o < b.length; ) {
    const h = header(b, o);
    if (h.id === ID.SeekHead) throw new Error('SeekHead present');
    if (h.id === ID.Info) {
      info = h;
      infoOff = o;
      break;
    }
    if (h.id === ID.Cluster || h.size === null) break;
    o = h.data + h.size;
  }
  if (!info || info.size === null)
    throw new Error('no Info before first Cluster');
  let scale = 1e6;
  const kept: Buffer[] = [];
  for (let p = info.data; p < info.data + info.size; ) {
    const c = header(b, p);
    if (c.size === null) throw new Error('unsized Info child');
    const end = c.data + c.size;
    if (c.id === ID.TimecodeScale) scale = readUInt(b, c.data, c.size);
    if (c.id !== ID.Duration) kept.push(b.subarray(p, end));
    p = end;
  }
  const dur = Buffer.alloc(11);
  dur.writeUInt16BE(ID.Duration, 0);
  dur[2] = 0x88;
  dur.writeDoubleBE((durationMs * 1e6) / scale, 3);
  const body = Buffer.concat([...kept, dur]);
  const newInfo = Buffer.concat([
    b.subarray(infoOff, infoOff + info.idLen),
    encSize(body.length, info.sizeLen),
    body,
  ]);
  const oldInfoEnd = info.data + info.size;
  const delta = newInfo.length - (oldInfoEnd - infoOff);
  const segHead =
    seg.size === null
      ? b.subarray(segOff, seg.data)
      : Buffer.concat([
          b.subarray(segOff, segOff + seg.idLen),
          encSize(seg.size + delta, seg.sizeLen),
        ]);
  return Buffer.concat([
    b.subarray(0, segOff),
    segHead,
    b.subarray(seg.data, infoOff),
    newInfo,
    b.subarray(oldInfoEnd),
  ]);
}

/** Injects Duration when the change stays inside the first `headLen` bytes; returns null when it can't be done safely. */
export function withDuration(
  b: Buffer,
  headLen: number
): { data: Buffer; delta: number } | null {
  try {
    const fixed = injectDuration(b, computeDurationMs(b));
    const delta = fixed.length - b.length;
    if (headLen + delta < 0) return null;
    if (!fixed.subarray(headLen + delta).equals(b.subarray(headLen))) {
      return null;
    }
    return { data: fixed, delta };
  } catch {
    return null;
  }
}
