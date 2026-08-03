/**
 * Reference implementation — pronunciation alignment & scoring engine.
 *
 * SPIKE / DECISION HARNESS. Not wired into the app, not imported by any
 * feature code. It exists to prove that the decisions recorded in
 * `DECISIONS.md` (issue #2335) are internally consistent and to pin them as
 * executable assertions. See `engine.test.ts`.
 *
 * Diverges from the transcribed reference implementation in
 * `docs/multilingual-pronunciation-engine-spec.md` §4 on every point listed
 * in DECISIONS.md. Where they differ, DECISIONS.md is authoritative.
 */

/** Status of a single aligned position. */
export type AlignmentStatus =
  | 'correct'
  | 'substituted'
  | 'omitted'
  | 'inserted';

/**
 * One entry in the alignment breakdown.
 *
 * A5: insertions get a real entry (the reference implementation counted them
 * but emitted nothing, which made an insertion badge unrenderable).
 *
 * `position` is the 1-based index into the target sequence. It is NOT a
 * unique key: an `inserted` entry carries the position of the target sound it
 * follows (0 when it precedes the whole word), so it shares a position with
 * the neighbouring entry. Consumers must render `alignment` in array order —
 * which is utterance order — and must not sort or key by `position`.
 */
export interface AlignmentEntry {
  position: number;
  /** The expected sound. `null` for `inserted` — there is no target sound. */
  targetIPA: string | null;
  /** The detected sound. `null` for `omitted` — the student produced nothing. */
  spokenIPA: string | null;
  status: AlignmentStatus;
}

/**
 * Stress evidence, supplied by the separate stress-detection stage.
 *
 * A1: the selected CTC phoneme models cannot emit stress (verified: zero
 * stress markers across all 392 vocabulary tokens of both
 * `wav2vec2-xlsr-53-espeak-cv-ft` and `wav2vec2-lv-60-espeak-cv-ft`), so
 * stress never travels in the phoneme stream. It arrives here as its own
 * channel.
 *
 * Levels are per syllable; the encoding is the stress stage's to define. The
 * engine only ever compares them for equality.
 */
export interface StressInput {
  /** Detected stress pattern, one entry per syllable. */
  detected: number[];
  /**
   * Every regionally acceptable stress pattern for this question.
   *
   * A10: matching ANY accepted variant scores full stress credit. This is how
   * stress satisfies the never-penalize-a-correct-dialect rule (#2342).
   */
  accepted: number[][];
}

export interface EvaluateInput {
  targetPhonemes: string[];
  spokenPhonemes: string[];
  /** Key into `thresholds`. Rejected if absent from it (A7). */
  matchLevel: string;
  /**
   * Pass marks by level. Injected rather than hard-coded because thresholds
   * ship tunable (map standing preference) and are admin-configurable.
   */
  thresholds: Record<string, number>;
  stress?: StressInput;
  /**
   * Share of the combined score attributable to stress, 0–1 (A9).
   * Tunable, expected to default low. Ignored when `stress` is absent.
   */
  stressWeight?: number;
}

export interface EvaluateMetrics {
  targetPhonemeCount: number;
  correctCount: number;
  substitutionCount: number;
  omissionCount: number;
  insertionCount: number;
  /**
   * Phoneme error rate, (substitutions + omissions + insertions) / N.
   *
   * A6: this is the standard speech-recognition definition and CAN exceed 1
   * when the student produces many extra sounds. It is deliberately NOT
   * clamped or renormalized, so it stays comparable to published error rates.
   * It is an internal metric — never surface it to a teacher as a percentage.
   */
  per: number;
}

export interface EvaluateResult {
  /** Combined score, 0–100. Equals `segmentScore` when stress is not scored. */
  score: number;
  /** Sound-only score, 0–100. */
  segmentScore: number;
  /** Stress score 0–100, or `null` when no stress evidence was supplied. */
  stressScore: number | null;
  /** Stress weight actually applied — 0 when stress evidence was absent. */
  appliedStressWeight: number;
  passed: boolean;
  matchLevel: string;
  requiredScore: number;
  metrics: EvaluateMetrics;
  alignment: AlignmentEntry[];
}

/**
 * Thrown when `matchLevel` names a level that is not configured (A7).
 *
 * Deliberately a distinct class: D4 (#2334) recorded that `gradeAnswer()` ends in a
 * catch-all returning zero, so a caller that swallows this would silently
 * score an entire class 0. Callers must let it surface.
 */
export class InvalidMatchLevelError extends Error {
  public readonly matchLevel: string;
  public readonly availableLevels: string[];

  constructor(matchLevel: string, availableLevels: string[]) {
    super(
      `Unknown matchLevel "${matchLevel}". Configured levels: ${
        availableLevels.length > 0 ? availableLevels.join(', ') : '(none)'
      }`
    );
    this.name = 'InvalidMatchLevelError';
    this.matchLevel = matchLevel;
    this.availableLevels = availableLevels;
  }
}

/** Thrown when `stressWeight` is outside 0–1. */
export class InvalidStressWeightError extends Error {
  constructor(weight: number) {
    super(`stressWeight must be between 0 and 1, received ${weight}`);
    this.name = 'InvalidStressWeightError';
  }
}

/**
 * Scores a detected stress pattern against the accepted variants.
 *
 * Returns the best per-syllable agreement across all variants, 0–100.
 * An exact match with any variant returns 100 (A10).
 *
 * Returns `null` when there are no accepted variants to compare against.
 * A10a: an empty `accepted` list is *absent evidence*, not a failed match, so
 * it takes A9's degradation path (sounds-only) rather than scoring 0. Scoring
 * 0 would be class-wide silent failure: no score persists (D4 recomputes on
 * every read), so an admin clearing the accepted variants after authoring
 * would retroactively drag down every historical response on this question.
 * This state is not hypothetical — it is the state every question is in until
 * the accepted-variant reference exists.
 *
 * A10b: a syllable-count mismatch counts against the score. The denominator is
 * the LONGER of the two patterns, so detected `[1,1,0,1]` against an accepted
 * `[1,0]` scores 1/4, not 1/2 — producing the wrong number of syllables is a
 * real difference in what the student said, not a free pass. The risk is that
 * noisy syllable segmentation manufactures errors, which is why A9's weight
 * defaults low and why syllable-boundary reliability belongs to the stress
 * stage's own ticket.
 */
function scoreStress(stress: StressInput): number | null {
  if (stress.accepted.length === 0) return null;

  let best = 0;
  for (const variant of stress.accepted) {
    const span = Math.max(variant.length, stress.detected.length);
    if (span === 0) {
      best = Math.max(best, 100);
      continue;
    }
    let matched = 0;
    for (let k = 0; k < span; k++) {
      if (variant[k] !== undefined && variant[k] === stress.detected[k])
        matched++;
    }
    best = Math.max(best, (matched / span) * 100);
  }
  return best;
}

/**
 * Aligns expected against detected sounds and returns structured metrics.
 *
 * Pure: no I/O, no clock, no randomness, no phoneme-name lookup. It returns
 * the symbols it compared and nothing more — A4 removed the English prose
 * `diagnostic` field, which could not survive a four-language UI. Composing
 * human-readable feedback is the results UI's job, via i18n.
 */
export function evaluatePronunciation(input: EvaluateInput): EvaluateResult {
  const { targetPhonemes, spokenPhonemes, matchLevel, thresholds, stress } =
    input;

  if (!Object.prototype.hasOwnProperty.call(thresholds, matchLevel)) {
    throw new InvalidMatchLevelError(matchLevel, Object.keys(thresholds));
  }
  const requiredScore = thresholds[matchLevel];

  const stressWeight = input.stressWeight ?? 0;
  if (!Number.isFinite(stressWeight) || stressWeight < 0 || stressWeight > 1) {
    throw new InvalidStressWeightError(stressWeight);
  }

  const n = targetPhonemes.length;
  const m = spokenPhonemes.length;

  // 1. Levenshtein distance matrix. Equal unit cost for substitution,
  //    omission and insertion.
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        targetPhonemes[i - 1] === spokenPhonemes[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // 2. Backtrace.
  //
  // A8: when a substitution and an omission are both optimal, substitution
  // wins. That is the same outcome the reference implementation produced, but
  // there it was an accident of `else if` ordering; here it is deliberate.
  // Rationale: it keeps one entry per expected sound so the breakdown lines up
  // with the word, and "you said X instead of Y" is more useful to a student
  // than "you skipped Y and also added X".
  let i = n;
  let j = m;
  const alignment: AlignmentEntry[] = [];
  let substitutions = 0;
  let omissions = 0;
  let insertions = 0;
  let correct = 0;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && targetPhonemes[i - 1] === spokenPhonemes[j - 1]) {
      alignment.unshift({
        position: i,
        targetIPA: targetPhonemes[i - 1],
        spokenIPA: spokenPhonemes[j - 1],
        status: 'correct',
      });
      correct++;
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      alignment.unshift({
        position: i,
        targetIPA: targetPhonemes[i - 1],
        spokenIPA: spokenPhonemes[j - 1],
        status: 'substituted',
      });
      substitutions++;
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      alignment.unshift({
        position: i,
        targetIPA: targetPhonemes[i - 1],
        spokenIPA: null,
        status: 'omitted',
      });
      omissions++;
      i--;
    } else {
      // Extra sound. `position` is the target sound it follows — 0 when it
      // precedes the whole word — so it shares a position with its neighbour.
      alignment.unshift({
        position: i,
        targetIPA: null,
        spokenIPA: spokenPhonemes[j - 1],
        status: 'inserted',
      });
      insertions++;
      j--;
    }
  }

  // 3. Scores.
  const totalEdits = substitutions + omissions + insertions;
  const per = n > 0 ? totalEdits / n : 0;
  const segmentScore = Math.max(0, Math.round((1 - per) * 100));

  // A9: stress folds into a single combined score at a tunable weight. With
  // no stress evidence the weight collapses to 0 rather than scoring 0, so a
  // missing or unavailable stress stage degrades to sounds-only instead of
  // failing every student.
  const stressScore = stress ? scoreStress(stress) : null;
  const appliedStressWeight = stressScore === null ? 0 : stressWeight;
  const score =
    stressScore === null
      ? segmentScore
      : Math.round(
          (1 - appliedStressWeight) * segmentScore +
            appliedStressWeight * stressScore
        );

  return {
    score,
    segmentScore,
    stressScore,
    appliedStressWeight,
    passed: score >= requiredScore,
    matchLevel,
    requiredScore,
    metrics: {
      targetPhonemeCount: n,
      correctCount: correct,
      substitutionCount: substitutions,
      omissionCount: omissions,
      insertionCount: insertions,
      per: Number(per.toFixed(3)),
    },
    alignment,
  };
}
