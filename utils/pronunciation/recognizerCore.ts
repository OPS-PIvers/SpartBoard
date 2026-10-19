// Pure pieces shared by the recognizer and its Worker: the message protocol, confidence and voiced time.
import type { CtcToken } from './ctcDecode';
import type { ModelLoadFailure } from './modelCache';
import { MODEL_SAMPLE_RATE } from './audio';

export type WorkerRequest =
  | { type: 'load'; urls: string[] }
  | { type: 'recognize'; id: number; audio: Float32Array };

export type WorkerLoadFailure = ModelLoadFailure | 'no-wasm';

export type WorkerResponse =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'starting' }
  | { type: 'loaded'; source: 'cache' | 'network' }
  | { type: 'load-error'; reason: WorkerLoadFailure; message: string }
  | { type: 'result'; id: number; tokens: CtcToken[]; confidence: number }
  | { type: 'recognize-error'; id: number; message: string };

/** Mean max-posterior (softmax) over frames whose argmax is not the CTC blank; 0 when every frame is blank. */
export function meanNonBlankConfidence(
  logits: Float32Array,
  frameCount: number,
  vocabSize: number,
  padId: number
): number {
  let sum = 0;
  let count = 0;
  for (let f = 0; f < frameCount; f++) {
    const base = f * vocabSize;
    let best = 0;
    let bestVal = logits[base];
    for (let k = 1; k < vocabSize; k++) {
      if (logits[base + k] > bestVal) {
        bestVal = logits[base + k];
        best = k;
      }
    }
    if (best === padId) continue;
    let denom = 0;
    for (let k = 0; k < vocabSize; k++)
      denom += Math.exp(logits[base + k] - bestVal);
    sum += 1 / denom;
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

const FRAME_SECONDS = 0.02;
const PEAK_RATIO = 10 ** (-30 / 20);
// About -60 dBFS: below this the take is silence whatever its shape.
const ABSOLUTE_FLOOR = 0.001;

/** Milliseconds of 20 ms frames loud enough to be speech, on trimSilence's threshold plus an absolute floor. */
export function measureVoicedMs(
  audio: Float32Array,
  sampleRate = MODEL_SAMPLE_RATE
): number {
  const frameLen = Math.round(sampleRate * FRAME_SECONDS);
  const frameCount = Math.floor(audio.length / frameLen);
  if (frameCount === 0) return 0;
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
  const threshold = Math.max(peak * PEAK_RATIO, noiseFloor * 2, ABSOLUTE_FLOOR);
  let voiced = 0;
  for (const v of rms) if (v >= threshold) voiced += 1;
  return Math.round(voiced * FRAME_SECONDS * 1000);
}
