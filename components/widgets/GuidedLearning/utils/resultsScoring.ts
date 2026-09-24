import type {
  GuidedLearningPublicStep,
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
