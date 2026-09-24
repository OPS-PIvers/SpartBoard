import type {
  GuidedLearningAnswerKey,
  GuidedLearningPublicStep,
  GuidedLearningSet,
  GuidedLearningQuestion,
  GuidedLearningStep,
} from '@/types';

const isQuestion = (s: { interactionType: string; question?: unknown }) =>
  s.interactionType === 'question' && !!s.question;

/** The session's frozen questions, keyed from the set by id; `null` session steps fall back to the set. */
export function scoringStepsForSession(
  sessionSteps: GuidedLearningPublicStep[] | null,
  setSteps: GuidedLearningStep[]
): GuidedLearningStep[] {
  const setById = new Map<string, GuidedLearningStep>();
  for (const s of setSteps) if (!setById.has(s.id)) setById.set(s.id, s);
  if (sessionSteps === null) {
    return [...setById.values()].filter(isQuestion);
  }
  const seen = new Set<string>();
  const out: GuidedLearningStep[] = [];
  for (const ps of sessionSteps) {
    if (!isQuestion(ps) || !ps.question || seen.has(ps.id)) continue;
    seen.add(ps.id);
    const setQ = setById.get(ps.id)?.question;
    const key: Partial<GuidedLearningQuestion> =
      setQ && setQ.type === ps.question.type
        ? {
            choices: setQ.choices,
            correctAnswer: setQ.correctAnswer,
            matchingPairs: setQ.matchingPairs,
            sortingItems: setQ.sortingItems,
          }
        : {};
    out.push({
      id: ps.id,
      xPct: ps.xPct,
      yPct: ps.yPct,
      imageIndex: ps.imageIndex,
      interactionType: 'question',
      question: { type: ps.question.type, text: ps.question.text, ...key },
    });
  }
  return out;
}

/** Each question's key by step id, with no undefined fields (Firestore rejects them). */
export function answerKeysForSteps(
  steps: GuidedLearningStep[]
): Record<string, GuidedLearningAnswerKey> {
  const keys: Record<string, GuidedLearningAnswerKey> = {};
  for (const s of steps) {
    if (!isQuestion(s) || !s.question || keys[s.id]) continue;
    const { type, choices, correctAnswer, matchingPairs, sortingItems } =
      s.question;
    keys[s.id] = {
      type,
      ...(choices ? { choices } : {}),
      ...(correctAnswer !== undefined ? { correctAnswer } : {}),
      ...(matchingPairs ? { matchingPairs } : {}),
      ...(sortingItems ? { sortingItems } : {}),
    };
  }
  return keys;
}

/** The set with each question's key replaced by the one frozen at assign, where the type still matches. */
export function withFrozenAnswerKeys(
  set: GuidedLearningSet,
  keys: Record<string, GuidedLearningAnswerKey> | undefined
): GuidedLearningSet {
  if (!keys) return set;
  return {
    ...set,
    steps: set.steps.map((s) => {
      const key = keys[s.id];
      if (!key || !s.question || s.question.type !== key.type) return s;
      return {
        ...s,
        question: {
          type: s.question.type,
          text: s.question.text,
          choices: key.choices,
          correctAnswer: key.correctAnswer,
          matchingPairs: key.matchingPairs,
          sortingItems: key.sortingItems,
        },
      };
    }),
  };
}
