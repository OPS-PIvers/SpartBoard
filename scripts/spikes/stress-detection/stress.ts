/**
 * Reference implementation — on-device lexical stress detection.
 *
 * SPIKE / DECISION HARNESS. Not wired into the app, not imported by any
 * feature code. It exists to prove that the decisions recorded in
 * `DECISIONS.md` (issue #2359) are internally consistent and to pin them as
 * executable assertions. See `stress.test.ts`.
 *
 * Scope guard: this detects LEXICAL STRESS ONLY — which syllable of a known
 * word carries prominence. Fluency, rhythm and intonation remain out of scope
 * on the map (#2331). Nothing here may grow into general prosody scoring.
 */

import nucleiData from './nuclei.json';

/** The 244 nucleus-bearing tokens, derived from the model's own vocabulary. */
const NUCLEUS_TOKENS: ReadonlySet<string> = new Set(nucleiData.nuclei);

/**
 * A phoneme with its position in the audio, in CTC frames.
 *
 * Obtainable today: `Wav2Vec2ForCTC` is publicly exported by transformers.js
 * and returns raw `logits` shaped `[1, frames, 392]`, so an argmax + CTC
 * collapse we own yields a frame span per emitted symbol at the model's
 * ~20 ms stride. The `pipeline('automatic-speech-recognition')` helper does
 * NOT: its wav2vec2 branch returns `{ text }` and discards timing, and
 * `return_timestamps` is a Whisper-only option that the CTC branch never
 * reads. Using the helper forecloses stress detection entirely.
 */
export interface TimedPhoneme {
  symbol: string;
  /** Inclusive start frame. */
  startFrame: number;
  /** Exclusive end frame. */
  endFrame: number;
}

/**
 * Acoustic measurements for one syllable nucleus.
 *
 * S4: all four cues are compared RELATIVELY, between the nuclei of a single
 * word. Nothing here is an absolute threshold, so nothing needs the empirical
 * calibration the map defers.
 */
export interface NucleusMeasurement {
  /** Mean signal energy across the nucleus window. */
  energy: number;
  /** Mean fundamental frequency in Hz, or `null` where tracking failed. */
  f0Hz: number | null;
}

export interface Nucleus {
  /**
   * Index into the spoken phoneme array this nucleus came from.
   *
   * Deliberately the ONLY index carried. A nucleus's position among the
   * *spoken* syllables and its position among the *target* syllables are
   * different numbers that look identical, and only the target one is ever a
   * valid answer. `mapToTargetSyllable` is the sole way to obtain it, so
   * there is no spoken-syllable index lying around to be mistaken for one.
   */
  phonemeIndex: number;
  symbol: string;
  durationFrames: number;
}

export type StressLanguage = 'en' | 'es' | 'de';

export interface StressDetectorConfig {
  /**
   * Relative contribution of each cue. Tunable per the map's standing rule
   * that nothing calibratable ships hard-coded.
   */
  cueWeights: {
    duration: number;
    energy: number;
    pitch: number;
  };
  /**
   * S5: how far ahead of the runner-up the winning nucleus must sit, on the
   * normalised 0–1 prominence scale, before the reading is trusted. Below
   * this the detector reports nothing at all.
   */
  minProminenceMargin: number;
  language: StressLanguage;
}

/**
 * Stress evidence handed to the alignment engine.
 *
 * S1: a single syllable index, NOT a per-syllable vector. `detected` is the
 * 1-based index of the stressed syllable in TARGET syllable space, already
 * mapped through the alignment (S3).
 */
export interface StressEvidence {
  detected: number;
  /** Every regionally acceptable stressed-syllable index (#2360). */
  accepted: readonly number[];
}

/**
 * Vowels that are reduced by definition, and so cannot carry stress (S4).
 *
 * Every member is verified present in the model's vocabulary by
 * `stress.test.ts` — a symbol the model can never emit is a rule that can
 * never fire, and it fails silently. An earlier draft carried `ɪ̈` (ɪ plus a
 * combining diaeresis), which is absent from the vocabulary and was dead.
 *
 * Plain `ɪ` is deliberately NOT here: it is a full KIT vowel that carries
 * stress in `bit`, so treating it as reduced would rule out stress on every
 * syllable containing it. `ɚ` is, being the r-coloured schwa of `better`, and
 * so is `ᵻ` — espeak's own reduced high vowel, as in `roses` and `wanted`.
 */
export const REDUCED_VOWELS: ReadonlySet<string> = new Set([
  'ə',
  'ɐ',
  'ɚ',
  'ᵻ',
]);

/** A token is a syllable nucleus iff it appears in the derived set. */
export function isNucleus(symbol: string): boolean {
  return NUCLEUS_TOKENS.has(symbol);
}

/** Counts the syllable nuclei in a plain (untimed) phoneme sequence. */
export function countSyllables(phonemes: readonly string[]): number {
  return phonemes.filter(isNucleus).length;
}

/** Extracts the syllable nuclei, in utterance order, from a timed stream. */
export function extractNuclei(phonemes: readonly TimedPhoneme[]): Nucleus[] {
  const nuclei: Nucleus[] = [];
  phonemes.forEach((p, phonemeIndex) => {
    if (!isNucleus(p.symbol)) return;
    nuclei.push({
      phonemeIndex,
      symbol: p.symbol,
      durationFrames: p.endFrame - p.startFrame,
    });
  });
  return nuclei;
}

/** Scales values into 0–1 against the word's own range. All-equal ⇒ all 0.5. */
function normalise(values: readonly number[]): number[] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi === lo) return values.map(() => 0.5);
  return values.map((v) => (v - lo) / (hi - lo));
}

/**
 * Ranks the nuclei of one word by prominence.
 *
 * Pitch contributes only when tracked for every nucleus — a partially voiced
 * word would otherwise rank an untracked syllable against a tracked one on
 * different evidence. Its weight is redistributed rather than counted as zero,
 * which would read as "this syllable had no pitch" instead of "we did not
 * measure it".
 */
export function prominenceScores(
  nuclei: readonly Nucleus[],
  measurements: readonly NucleusMeasurement[],
  config: StressDetectorConfig
): number[] {
  const duration = normalise(nuclei.map((n) => n.durationFrames));
  const energy = normalise(measurements.map((m) => m.energy));

  const pitchTracked = measurements.every((m) => m.f0Hz !== null);
  const pitch = pitchTracked
    ? normalise(measurements.map((m) => m.f0Hz as number))
    : nuclei.map(() => 0);

  const w = config.cueWeights;
  const activeTotal = w.duration + w.energy + (pitchTracked ? w.pitch : 0) || 1;

  return nuclei.map((nucleus, i) => {
    let score =
      (w.duration * duration[i] +
        w.energy * energy[i] +
        (pitchTracked ? w.pitch * pitch[i] : 0)) /
      activeTotal;

    // S4: English reduces unstressed vowels to ə, so a reduced nucleus is
    // near-proof of "not stressed" — and it is already in the phoneme stream
    // at no cost. Spanish does not reduce vowels at all and German barely, so
    // this cue is English-only. Applying it to Spanish would penalise a
    // legitimately unstressed-looking but stressed vowel.
    if (config.language === 'en' && REDUCED_VOWELS.has(nucleus.symbol)) {
      score = 0;
    }
    return score;
  });
}

/**
 * An alignment entry, as produced by the #2335 engine. Structural mirror of
 * `AlignmentEntry` in `../alignment-engine/engine.ts`; duplicated rather than
 * imported so this spike stays self-contained.
 */
export interface AlignmentEntryLike {
  position: number;
  targetIPA: string | null;
  spokenIPA: string | null;
  status: 'correct' | 'substituted' | 'omitted' | 'inserted';
}

/**
 * Maps a nucleus of what the student SAID onto the syllable of the word they
 * were ASKED to say (S3).
 *
 * This is why syllable counts never have to agree. A10b compared per-syllable
 * vectors and paid for a length mismatch by scoring against the longer of the
 * two; here the alignment the engine already computed carries the detected
 * nucleus to its target counterpart, and a differing syllable count has
 * nothing left to mismatch.
 *
 * Returns `null` in two cases, both of them absent evidence rather than a
 * wrong answer:
 *
 * - The prominent nucleus is an INSERTION — a sound with no target
 *   counterpart at all (S3a).
 * - The prominent nucleus aligns to a target CONSONANT, so no target nucleus
 *   has been reached yet and the prefix contains no syllable (S3b). A student
 *   saying `a` where the target has `p` has produced a vowel in the onset; it
 *   is not the first target syllable's nucleus, and guessing that it is would
 *   assert a stress placement the student never made.
 */
export function mapToTargetSyllable(
  nucleus: Nucleus,
  alignment: readonly AlignmentEntryLike[],
  targetPhonemes: readonly string[]
): number | null {
  // Precondition, inherited from the #2335 engine: alignment entries with a
  // non-null `spokenIPA` stand 1-to-1 with `spokenPhonemes`, in the same
  // order — exactly one entry per spoken sound, never collapsed or expanded.
  // If that contract ever changes, this walk misaligns silently rather than
  // failing, so it is stated here where the assumption is actually made.
  // Entries carrying a spoken sound enumerate the spoken stream in order.
  let spokenCursor = -1;
  let entry: AlignmentEntryLike | undefined;
  for (const candidate of alignment) {
    if (candidate.spokenIPA === null) continue;
    spokenCursor += 1;
    if (spokenCursor === nucleus.phonemeIndex) {
      entry = candidate;
      break;
    }
  }

  if (!entry || entry.status === 'inserted') return null;

  // `position` is 1-based into the target sequence (A5).
  const targetSyllable = countSyllables(
    targetPhonemes.slice(0, entry.position)
  );
  return targetSyllable > 0 ? targetSyllable : null;
}

/**
 * Scores the stress dimension.
 *
 * S1 makes this binary: the detector reports one syllable, and either it is
 * one the question accepts or it is not. A10's "full credit for ANY accepted
 * variant" survives unchanged — `accepted` simply became a list of indices
 * rather than a list of vectors.
 */
export function scoreStress(evidence: StressEvidence): number {
  return evidence.accepted.includes(evidence.detected) ? 100 : 0;
}

/**
 * Full detection pass for one utterance.
 *
 * Returns `null` for every "I cannot read this" outcome. That is the ONLY
 * correct way to signal absence: A9's degradation path is reached by omitting
 * the stress input, so a caller passes through a `null` here as an absent
 * `stress` field.
 *
 * It must never be represented as an empty `detected` value. Raised in review
 * of PR #2358 and recorded on #2359: `accepted: []` means absent evidence and
 * degrades, but an empty DETECTED value against a populated `accepted` means
 * "the student matched none of it" and scores 0 at full weight. Getting these
 * backwards silently fails every student whose audio simply could not be read
 * — and since no score persists (D4 recomputes on every read), it would apply
 * retroactively to every historical response.
 */
export function detectStress(input: {
  spokenPhonemes: readonly TimedPhoneme[];
  measurements: readonly NucleusMeasurement[];
  alignment: readonly AlignmentEntryLike[];
  targetPhonemes: readonly string[];
  accepted: readonly number[];
  config: StressDetectorConfig;
}): StressEvidence | null {
  const {
    spokenPhonemes,
    measurements,
    alignment,
    targetPhonemes,
    accepted,
    config,
  } = input;

  // A10a: no reference to compare against is absent evidence, not a failure.
  if (accepted.length === 0) return null;

  const nuclei = extractNuclei(spokenPhonemes);
  if (nuclei.length === 0) return null;
  if (measurements.length !== nuclei.length) return null;

  // A single-syllable word has nothing to choose between: prominence is not a
  // meaningful judgement, and the margin test below would reject it anyway.
  if (nuclei.length === 1) {
    const only = mapToTargetSyllable(nuclei[0], alignment, targetPhonemes);
    return only === null ? null : { detected: only, accepted };
  }

  const scores = prominenceScores(nuclei, measurements, config);
  const ranked = scores
    .map((score, i) => ({ score, i }))
    .sort((a, b) => b.score - a.score);

  // S5: present-or-absent, never a partial weight. A confidence multiplier
  // would ship an uncalibrated number straight into a grade — calibration is
  // deferred by decision — and would make identical spoken performance score
  // differently by microphone, which no teacher can explain to a student.
  if (ranked[0].score - ranked[1].score < config.minProminenceMargin)
    return null;

  const detected = mapToTargetSyllable(
    nuclei[ranked[0].i],
    alignment,
    targetPhonemes
  );
  return detected === null ? null : { detected, accepted };
}
