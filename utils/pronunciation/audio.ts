export const MODEL_SAMPLE_RATE = 16000;

/** Decodes any browser-playable audio to mono at the model's 16 kHz (the browser resamples). */
export async function decodeToModelRate(
  bytes: ArrayBuffer
): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, 1, MODEL_SAMPLE_RATE);
  const buffer = await ctx.decodeAudioData(bytes);
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0).slice();
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < out.length; i++)
      out[i] += data[i] / buffer.numberOfChannels;
  }
  return out;
}

const TRIM_FRAME_SECONDS = 0.02;
const TRIM_PAD_SECONDS = 0.2;
const TRIM_PEAK_RATIO = 10 ** (-30 / 20);

/** Cuts leading and trailing silence, keeping 200 ms around the loudest-relative speech so stop bursts survive. */
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

/** Wav2Vec2FeatureExtractor with do_normalize: zero mean, unit variance. */
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
