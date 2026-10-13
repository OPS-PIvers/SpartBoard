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
