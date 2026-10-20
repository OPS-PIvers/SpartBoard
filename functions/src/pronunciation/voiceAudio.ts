// Server copies of utils/pronunciation/audio.ts and ctcDecode.ts for voice references; tests/pronunciation/lookupParity.test.ts keeps them equal.

export const MODEL_SAMPLE_RATE = 16000;

/** 16 kHz mono 16-bit PCM from a RIFF WAV (Cloud TTS LINEAR16), or null for any other layout. */
export function parseLinear16Wav(bytes: Uint8Array): Float32Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) =>
    String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let format = false;
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === 'fmt ') {
      if (size < 16 || body + 16 > bytes.length) return null;
      format =
        view.getUint16(body, true) === 1 &&
        view.getUint16(body + 2, true) === 1 &&
        view.getUint32(body + 4, true) === MODEL_SAMPLE_RATE &&
        view.getUint16(body + 14, true) === 16;
      if (!format) return null;
    } else if (id === 'data') {
      if (!format) return null;
      const end = Math.min(bytes.length, body + size);
      const count = Math.floor((end - body) / 2);
      const out = new Float32Array(count);
      for (let i = 0; i < count; i++)
        out[i] = view.getInt16(body + 2 * i, true) / 32768;
      return out;
    }
    at = body + size + (size % 2);
  }
  return null;
}

const TRIM_FRAME_SECONDS = 0.02;
const TRIM_PAD_SECONDS = 0.2;
const TRIM_PEAK_RATIO = 10 ** (-30 / 20);

export function trimSilence(
  audio: Float32Array,
  sampleRate = MODEL_SAMPLE_RATE
): Float32Array {
  const frameLen = Math.round(sampleRate * TRIM_FRAME_SECONDS);
  const frameCount = Math.floor(audio.length / frameLen);
  if (frameCount < 3) return audio;
  const rms = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    let sum = 0;
    for (let i = f * frameLen; i < (f + 1) * frameLen; i++)
      sum += audio[i] * audio[i];
    rms[f] = Math.sqrt(sum / frameLen);
  }
  const sorted = Float32Array.from(rms).sort();
  const peak = sorted[frameCount - 1];
  const noiseFloor = sorted[Math.floor(frameCount * 0.1)];
  const threshold = Math.max(peak * TRIM_PEAK_RATIO, noiseFloor * 2);
  const first = rms.findIndex((v) => v >= threshold);
  if (first < 0 || peak === 0) return audio;
  let last = frameCount - 1;
  while (rms[last] < threshold) last--;
  const pad = Math.round(sampleRate * TRIM_PAD_SECONDS);
  const start = Math.max(0, first * frameLen - pad);
  const end = Math.min(audio.length, (last + 1) * frameLen + pad);
  return audio.slice(start, end);
}

export function normalizeForWav2Vec2(audio: Float32Array): Float32Array {
  if (audio.length === 0) return new Float32Array(0);
  let mean = 0;
  for (const v of audio) mean += v;
  mean /= audio.length;
  let variance = 0;
  for (const v of audio) variance += (v - mean) ** 2;
  variance /= audio.length;
  const scale = 1 / Math.sqrt(variance + 1e-7);
  const out = new Float32Array(audio.length);
  for (let i = 0; i < audio.length; i++) out[i] = (audio[i] - mean) * scale;
  return out;
}

/** Greedy CTC symbols (argmax per frame, repeats collapsed, pad dropped), as greedyCtcDecode's tokens. */
export function greedyCtcSymbols(
  logits: Float32Array,
  frameCount: number,
  vocabSize: number,
  idToSymbol: readonly string[],
  padId: number
): string[] {
  if (logits.length < frameCount * vocabSize) {
    throw new Error(
      `logits length ${logits.length} < ${frameCount} frames × ${vocabSize}`
    );
  }
  const out: string[] = [];
  let prev = -1;
  for (let f = 0; f < frameCount; f++) {
    const base = f * vocabSize;
    let best = 0;
    let bestVal = logits[base];
    for (let k = 1; k < vocabSize; k++) {
      const v = logits[base + k];
      if (v > bestVal) {
        bestVal = v;
        best = k;
      }
    }
    if (best !== prev && best !== padId) out.push(idToSymbol[best] ?? '?');
    prev = best;
  }
  return out;
}
