// Lexical stress detection (S1–S5): which syllable of a known word is most prominent; never general prosody.
import nucleiData from './xlsr53Nuclei.json';
import { MODEL_SAMPLE_RATE } from './audio';
import type { AlignmentEntry } from './score';
import type { CtcToken } from './ctcDecode';

const NUCLEUS_TOKENS: ReadonlySet<string> = new Set(nucleiData.nuclei);

// wav2vec2's conv stack emits one frame per 320 samples at 16 kHz (20 ms).
export const SAMPLES_PER_FRAME = 320;

/** S4: English-only cue; every member is a model vocabulary token. Plain ɪ is a full vowel and stays out. */
export const REDUCED_VOWELS: ReadonlySet<string> = new Set([
  'ə',
  'ɐ',
  'ɚ',
  'ᵻ',
]);

export type StressLanguage = 'en' | 'es' | 'de';

export interface StressDetectorConfig {
  cueWeights: { duration: number; energy: number; pitch: number };
  // S5: winner's lead over the runner-up on the 0–1 scale, below which nothing is reported.
  minProminenceMargin: number;
  language: StressLanguage;
}

// S4/S5 starting values; unvalidated against real audio (#2366) and meant to become admin-tunable.
export const DEFAULT_STRESS_CONFIG: Omit<StressDetectorConfig, 'language'> = {
  cueWeights: { duration: 1, energy: 1, pitch: 1 },
  minProminenceMargin: 0.15,
};

/** `phonemeIndex` indexes the spoken stream; only `mapToTargetSyllable` yields a target syllable. */
export interface Nucleus {
  phonemeIndex: number;
  symbol: string;
  startFrame: number;
  endFrame: number;
}

export interface NucleusMeasurement {
  energy: number;
  f0Hz: number | null;
}

export function isNucleus(symbol: string): boolean {
  return NUCLEUS_TOKENS.has(symbol);
}

export function countSyllables(phonemes: readonly string[]): number {
  return phonemes.filter(isNucleus).length;
}

/** Alignment entry per spoken token, in order (entries with a spoken sound are 1:1 with the spoken stream). */
function spokenEntries(alignment: readonly AlignmentEntry[]): AlignmentEntry[] {
  return alignment.filter((e) => e.spokenIPA !== null);
}

/** S2: nuclei from the timed stream; a `held` repeat (T2) extends the nucleus it repeats instead of becoming a syllable. */
export function extractNuclei(
  phonemes: readonly CtcToken[],
  alignment?: readonly AlignmentEntry[]
): Nucleus[] {
  const entries = alignment ? spokenEntries(alignment) : [];
  const nuclei: Nucleus[] = [];
  phonemes.forEach((p, phonemeIndex) => {
    if (!isNucleus(p.symbol)) return;
    const prev = nuclei[nuclei.length - 1];
    if (
      entries[phonemeIndex]?.status === 'held' &&
      prev?.symbol === p.symbol &&
      prev.phonemeIndex === phonemeIndex - 1
    ) {
      prev.endFrame = p.endFrame;
      return;
    }
    nuclei.push({
      phonemeIndex,
      symbol: p.symbol,
      startFrame: p.startFrame,
      endFrame: p.endFrame,
    });
  });
  return nuclei;
}

const F0_MIN_HZ = 75;
const F0_MAX_HZ = 400;
const VOICING_THRESHOLD = 0.5;

/** Normalized-autocorrelation f0 for one window, or null when unvoiced or too short. */
function trackF0(window: Float32Array, sampleRate: number): number | null {
  const minLag = Math.floor(sampleRate / F0_MAX_HZ);
  const maxLag = Math.ceil(sampleRate / F0_MIN_HZ);
  if (window.length < maxLag * 2) return null;
  let bestLag = 0;
  let best = VOICING_THRESHOLD;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let cross = 0;
    let a = 0;
    let b = 0;
    for (let i = 0; i + lag < window.length; i++) {
      cross += window[i] * window[i + lag];
      a += window[i] * window[i];
      b += window[i + lag] * window[i + lag];
    }
    const r = a > 0 && b > 0 ? cross / Math.sqrt(a * b) : 0;
    if (r > best) {
      best = r;
      bestLag = lag;
    }
  }
  return bestLag > 0 ? sampleRate / bestLag : null;
}

/** S4 energy and pitch per nucleus, from the same audio the model decoded; pitch windows widen to two periods of 75 Hz. */
export function measureNuclei(
  audio: Float32Array,
  nuclei: readonly Nucleus[],
  sampleRate = MODEL_SAMPLE_RATE
): NucleusMeasurement[] {
  const pitchSpan = Math.ceil((sampleRate / F0_MIN_HZ) * 2) + 1;
  return nuclei.map((n) => {
    const start = Math.min(audio.length, n.startFrame * SAMPLES_PER_FRAME);
    const end = Math.min(audio.length, n.endFrame * SAMPLES_PER_FRAME);
    let energy = 0;
    for (let i = start; i < end; i++) energy += audio[i] * audio[i];
    energy = end > start ? energy / (end - start) : 0;
    const centre = Math.floor((start + end) / 2);
    const half = Math.max(
      Math.ceil(pitchSpan / 2),
      Math.floor((end - start) / 2)
    );
    const window = audio.subarray(
      Math.max(0, centre - half),
      Math.min(audio.length, centre + half)
    );
    return { energy, f0Hz: trackF0(window, sampleRate) };
  });
}

function normalise(values: readonly number[]): number[] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi === lo) return values.map(() => 0.5);
  return values.map((v) => (v - lo) / (hi - lo));
}

/** S4: relative prominence within the word; pitch counts only when tracked on every nucleus, else its weight is redistributed. */
export function prominenceScores(
  nuclei: readonly Nucleus[],
  measurements: readonly NucleusMeasurement[],
  config: StressDetectorConfig
): number[] {
  const duration = normalise(nuclei.map((n) => n.endFrame - n.startFrame));
  const energy = normalise(measurements.map((m) => m.energy));
  const pitchValues = measurements.map((m) => m.f0Hz);
  const pitchTracked = pitchValues.every((f) => f !== null);
  const pitch = pitchTracked ? normalise(pitchValues) : [];
  const w = config.cueWeights;
  const activeTotal = w.duration + w.energy + (pitchTracked ? w.pitch : 0) || 1;

  return nuclei.map((nucleus, i) => {
    if (config.language === 'en' && REDUCED_VOWELS.has(nucleus.symbol))
      return 0;
    return (
      (w.duration * duration[i] +
        w.energy * energy[i] +
        (pitchTracked ? w.pitch * pitch[i] : 0)) /
      activeTotal
    );
  });
}

/** S3: carries a spoken nucleus to the target syllable; null for an extra sound (S3a) or one ahead of every target nucleus (S3b). */
export function mapToTargetSyllable(
  nucleus: Nucleus,
  alignment: readonly AlignmentEntry[],
  targetPhonemes: readonly string[]
): number | null {
  const entry = spokenEntries(alignment)[nucleus.phonemeIndex];
  if (!entry || entry.status === 'inserted' || entry.status === 'held')
    return null;
  const syllable = countSyllables(targetPhonemes.slice(0, entry.position));
  return syllable > 0 ? syllable : null;
}

/** Full pass; every unreadable outcome is null so the caller omits `stress` (S5), never an empty detected value. */
export function detectStress(input: {
  nuclei: readonly Nucleus[];
  measurements: readonly NucleusMeasurement[];
  alignment: readonly AlignmentEntry[];
  targetPhonemes: readonly string[];
  accepted: readonly number[];
  config: StressDetectorConfig;
}): { detected: number; accepted: readonly number[] } | null {
  const { nuclei, measurements, alignment, targetPhonemes, accepted, config } =
    input;
  if (accepted.length === 0) return null;
  if (nuclei.length === 0 || measurements.length !== nuclei.length) return null;

  let winner = nuclei[0];
  if (nuclei.length > 1) {
    const ranked = prominenceScores(nuclei, measurements, config)
      .map((score, i) => ({ score, i }))
      .sort((a, b) => b.score - a.score);
    if (ranked[0].score - ranked[1].score < config.minProminenceMargin)
      return null;
    winner = nuclei[ranked[0].i];
  }
  const detected = mapToTargetSyllable(winner, alignment, targetPhonemes);
  return detected === null ? null : { detected, accepted };
}
