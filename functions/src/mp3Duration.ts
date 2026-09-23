// MP3 length from frame headers, so cached TTS files can report a duration without decoding.

const BITRATES_V1_L3 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];
const BITRATES_V2_L3 = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
];
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};
/** Cloud TTS encodes MP3 at 32 kbps, which is 4 bytes per millisecond. */
const TTS_MP3_BYTES_PER_MS = 4;

function id3v2Length(bytes: Uint8Array): number {
  if (
    bytes.length < 10 ||
    bytes[0] !== 0x49 ||
    bytes[1] !== 0x44 ||
    bytes[2] !== 0x33
  )
    return 0;
  const size =
    ((bytes[6] & 0x7f) << 21) |
    ((bytes[7] & 0x7f) << 14) |
    ((bytes[8] & 0x7f) << 7) |
    (bytes[9] & 0x7f);
  const footer = bytes[5] & 0x10 ? 10 : 0;
  return 10 + size + footer;
}

/** Sums MPEG Layer III frames; null when no valid frame is found. */
export function mp3DurationMs(bytes: Uint8Array): number | null {
  let offset = id3v2Length(bytes);
  let seconds = 0;
  let frames = 0;
  while (offset + 4 <= bytes.length) {
    const b1 = bytes[offset + 1];
    const b2 = bytes[offset + 2];
    if (bytes[offset] !== 0xff || (b1 & 0xe0) !== 0xe0) break;
    const version = (b1 >> 3) & 0x03;
    const layer = (b1 >> 1) & 0x03;
    const bitrateIdx = (b2 >> 4) & 0x0f;
    const rateIdx = (b2 >> 2) & 0x03;
    const padding = (b2 >> 1) & 0x01;
    if (version === 1 || layer !== 1) break;
    if (bitrateIdx === 0 || bitrateIdx === 15 || rateIdx === 3) break;
    const isV1 = version === 3;
    const kbps = (isV1 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIdx];
    const sampleRate = SAMPLE_RATES[version][rateIdx];
    const frameBytes =
      Math.floor(((isV1 ? 144_000 : 72_000) * kbps) / sampleRate) + padding;
    if (frameBytes < 4) break;
    seconds += (isV1 ? 1152 : 576) / sampleRate;
    frames += 1;
    offset += frameBytes;
  }
  return frames > 0 ? Math.round(seconds * 1000) : null;
}

/** Duration from object metadata, else estimated from the object size at the TTS bitrate. */
export function storedDurationMs(
  metaValue: unknown,
  size: unknown
): number | undefined {
  const stored = Number(metaValue);
  if (typeof metaValue === 'string' && Number.isFinite(stored) && stored > 0)
    return Math.round(stored);
  const bytes = Number(size);
  if (Number.isFinite(bytes) && bytes > 0)
    return Math.round(bytes / TTS_MP3_BYTES_PER_MS);
  return undefined;
}
