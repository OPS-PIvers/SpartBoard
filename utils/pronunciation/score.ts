// Pronunciation alignment and scoring (A1–A13, T1–T5, S1/S3 stress shape); pure, no I/O.

// A5/T2: `held` is a repeated recognized token that scores zero and is not an error.
export type AlignmentStatus =
  'correct' | 'substituted' | 'omitted' | 'inserted' | 'held';

/** `position` is the 1-based target index (an extra sound shares its predecessor's); render in array order (A5). */
export interface AlignmentEntry {
  position: number;
  targetIPA: string | null;
  spokenIPA: string | null;
  status: AlignmentStatus;
}

/** S1: one detected target-syllable index against every accepted index. */
export interface StressInput {
  detected: number;
  accepted: readonly number[];
}

export interface EvaluateInput {
  targetPhonemes: readonly string[];
  spokenPhonemes: readonly string[];
  matchLevel: string;
  thresholds: Readonly<Record<string, number>>;
  stress?: StressInput | null;
  stressWeight?: number;
}

export interface EvaluateMetrics {
  targetPhonemeCount: number;
  correctCount: number;
  substitutionCount: number;
  omissionCount: number;
  insertionCount: number;
  heldCount: number;
  // A6: internal only and may exceed 1; never shown to a teacher.
  per: number;
}

export interface EvaluateResult {
  score: number;
  segmentScore: number;
  stressScore: number | null;
  appliedStressWeight: number;
  passed: boolean;
  matchLevel: string;
  requiredScore: number;
  metrics: EvaluateMetrics;
  alignment: AlignmentEntry[];
}

// A7: must surface; gradeAnswer()'s catch-all would turn it into a class-wide 0.
export class InvalidMatchLevelError extends Error {
  readonly matchLevel: string;
  readonly availableLevels: string[];

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

// A13: must surface; an empty reference would otherwise pass a whole class.
export class EmptyReferenceError extends Error {
  constructor() {
    super(
      'targetPhonemes is empty — a question with no reference phonemes cannot be graded'
    );
    this.name = 'EmptyReferenceError';
  }
}

export class InvalidStressWeightError extends Error {
  constructor(weight: number) {
    super(`stressWeight must be between 0 and 1, received ${weight}`);
    this.name = 'InvalidStressWeightError';
  }
}

/** S1/A10: binary, full credit for any accepted index; an empty accepted list is absent evidence (A10a). */
export function scoreStress(stress: StressInput): number | null {
  if (stress.accepted.length === 0) return null;
  return stress.accepted.includes(stress.detected) ? 100 : 0;
}

export function evaluatePronunciation(input: EvaluateInput): EvaluateResult {
  const { targetPhonemes: target, spokenPhonemes: spoken } = input;
  const { matchLevel, thresholds } = input;

  if (!Object.prototype.hasOwnProperty.call(thresholds, matchLevel)) {
    throw new InvalidMatchLevelError(matchLevel, Object.keys(thresholds));
  }
  const requiredScore = thresholds[matchLevel];

  const stressWeight = input.stressWeight ?? 0;
  if (!Number.isFinite(stressWeight) || stressWeight < 0 || stressWeight > 1) {
    throw new InvalidStressWeightError(stressWeight);
  }
  if (target.length === 0) throw new EmptyReferenceError();

  const n = target.length;
  const m = spoken.length;
  // T1: an extra token repeating the recognized token before it is free, so a run is charged at most once.
  const insertCost = (j: number) =>
    j >= 2 && spoken[j - 1] === spoken[j - 2] ? 0 : 1;

  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );
  for (let i = 1; i <= n; i++) dp[i][0] = i;
  for (let j = 1; j <= m; j++) dp[0][j] = dp[0][j - 1] + insertCost(j);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = dp[i - 1][j - 1] + (target[i - 1] === spoken[j - 1] ? 0 : 1);
      dp[i][j] = Math.min(diag, dp[i - 1][j] + 1, dp[i][j - 1] + insertCost(j));
    }
  }

  // Backtrace checks each step against dp because free insertions break plain Levenshtein's greedy match; A8 order: match, substitution, omission, insertion.
  const alignment: AlignmentEntry[] = [];
  const counts = {
    correct: 0,
    substituted: 0,
    omitted: 0,
    inserted: 0,
    held: 0,
  };
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const same = i > 0 && j > 0 && target[i - 1] === spoken[j - 1];
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (same ? 0 : 1)) {
      const status = same ? 'correct' : 'substituted';
      alignment.push({
        position: i,
        targetIPA: target[i - 1],
        spokenIPA: spoken[j - 1],
        status,
      });
      counts[status]++;
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      alignment.push({
        position: i,
        targetIPA: target[i - 1],
        spokenIPA: null,
        status: 'omitted',
      });
      counts.omitted++;
      i--;
    } else {
      const status = insertCost(j) === 0 ? 'held' : 'inserted';
      alignment.push({
        position: i,
        targetIPA: null,
        spokenIPA: spoken[j - 1],
        status,
      });
      counts[status]++;
      j--;
    }
  }
  alignment.reverse();

  // T3: held entries are not edits.
  const per = (counts.substituted + counts.omitted + counts.inserted) / n;
  const segmentScore = Math.max(0, Math.round((1 - per) * 100));

  // A9: no stress evidence collapses the weight to 0 instead of scoring 0.
  const stressScore = input.stress ? scoreStress(input.stress) : null;
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
      correctCount: counts.correct,
      substitutionCount: counts.substituted,
      omissionCount: counts.omitted,
      insertionCount: counts.inserted,
      heldCount: counts.held,
      per: Number(per.toFixed(3)),
    },
    alignment,
  };
}
