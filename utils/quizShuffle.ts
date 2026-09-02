/**
 * Seeded shuffle for per-student answer randomization.
 *
 * The teacher-side `toPublicQuestion` already runs an unseeded Fisher-Yates
 * once at session creation (so the position of the correct answer doesn't
 * leak through Firestore — every option's offset is randomized before the
 * doc is written). But that single shuffle is shared across every student in
 * the session, which means kids on adjacent devices all see the same A/B/C/D
 * order and can copy by position. The functions below apply a *second* shuffle
 * on the client, deterministically seeded by the student's identity, so each
 * student sees their own order while a single student's order stays stable
 * across reloads and back-navigation.
 */
import type { QuizPublicQuestion } from '@/types';

/**
 * cyrb53 — fast, well-distributed 53-bit string hash (public-domain).
 * Returns a non-negative integer in [0, 2^53). Not cryptographically secure;
 * used here only to derive a deterministic PRNG seed from a string.
 */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Mulberry32 PRNG — 32-bit state, period 2^32, good enough for shuffles. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic Fisher-Yates shuffle. Same input + same seed → same output.
 * Returns a new array; the input is not mutated.
 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const result = items.slice();
  if (result.length <= 1) return result;
  const rng = mulberry32(cyrb53(seed));
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Re-shuffle a public question's display fields per student. The seed is
 * combined with the question id so every question shuffles independently
 * (otherwise two students with adjacent seeds could end up with correlated
 * orders across questions).
 */
export function shuffleQuestionForStudent(
  q: QuizPublicQuestion,
  studentSeed: string
): QuizPublicQuestion {
  const seed = `${studentSeed}:${q.id}`;
  if (q.type === 'MC' && q.choices && q.choices.length > 1) {
    return { ...q, choices: seededShuffle(q.choices, seed) };
  }
  if (q.type === 'Matching' && q.matchingRight && q.matchingRight.length > 1) {
    return { ...q, matchingRight: seededShuffle(q.matchingRight, seed) };
  }
  if (q.type === 'Ordering' && q.orderingItems && q.orderingItems.length > 1) {
    return { ...q, orderingItems: seededShuffle(q.orderingItems, seed) };
  }
  return q;
}

/**
 * Group questions into stimulus-connected components. Questions sharing any
 * stimulus id (transitively) form one unit that must stay contiguous, in
 * original relative order, so a shared stimulus never has to remount as the
 * student walks a shuffled quiz. Questions with no stimuli are singleton
 * units. Units are emitted in the order of their first member.
 */
export function groupIntoStimulusUnits<
  T extends Pick<QuizPublicQuestion, 'stimulusIds'>,
>(questions: readonly T[]): T[][] {
  // Union-find over question indices, merged via shared stimulus ids.
  const parent = questions.map((_, i) => i);
  const find = (x: number): number =>
    parent[x] === x ? x : (parent[x] = find(parent[x]));
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  const firstIndexByStimulus = new Map<string, number>();
  questions.forEach((q, i) => {
    for (const sid of q.stimulusIds ?? []) {
      const first = firstIndexByStimulus.get(sid);
      if (first === undefined) firstIndexByStimulus.set(sid, i);
      else union(first, i);
    }
  });
  const unitByRoot = new Map<number, T[]>();
  const units: T[][] = [];
  questions.forEach((q, i) => {
    const root = find(i);
    let unit = unitByRoot.get(root);
    if (!unit) {
      unit = [];
      unitByRoot.set(root, unit);
      units.push(unit);
    }
    unit.push(q);
  });
  return units;
}

/**
 * Re-order the session's public questions per student per attempt. Callers
 * should pass a seed that already encodes both the student identity and the
 * attempt number (e.g. `${studentUid}:attempt-${completedAttempts}` — the
 * format used by `QuizStudentApp`) so every retake walks through a fresh
 * ordering. The `:question-order` suffix decorrelates this shuffle from the
 * per-question option shuffle that uses the same base seed — without it,
 * the option order on the first question would be a deterministic function
 * of the question-order shuffle.
 *
 * Stimulus-aware: questions sharing a stimulus shuffle as one contiguous
 * unit (see `groupIntoStimulusUnits`). With no stimuli every unit is a
 * singleton, so the result is identical to the pre-stimulus behavior.
 */
export function shufflePublicQuestions(
  questions: readonly QuizPublicQuestion[],
  attemptSeed: string
): QuizPublicQuestion[] {
  const units = groupIntoStimulusUnits(questions);
  return seededShuffle(units, `${attemptSeed}:question-order`).flat();
}
