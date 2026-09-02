// Highest takeIndex wins; ties broken by earliest answeredAt.
export function selectRepresentativeAnswers<
  T extends { questionId: string; answeredAt?: number; takeIndex?: number },
>(answers: T[]): Map<string, T> {
  const sorted = [...answers].sort((a, b) => {
    const ai = a.takeIndex ?? 0;
    const bi = b.takeIndex ?? 0;
    if (ai !== bi) return bi - ai; // higher takeIndex first
    return (a.answeredAt ?? 0) - (b.answeredAt ?? 0); // then earliest answeredAt
  });
  const byQuestion = new Map<string, T>();
  for (const a of sorted) {
    if (!byQuestion.has(a.questionId)) byQuestion.set(a.questionId, a);
  }
  return byQuestion;
}

/**
 * Committed takes for one question. A take whose artifacts all failed to
 * upload never reaches the teacher, so it must not consume the student's
 * budget — same rule the archival callable's `countCommittedTakes` applies.
 */
export function countCommittedTakes<
  T extends {
    questionId: string;
    unresponded?: string;
    artifacts?: { uploadState?: string }[];
  },
>(answers: T[], questionId: string): number {
  return answers.filter(
    (a) =>
      a.questionId === questionId &&
      !a.unresponded &&
      (a.artifacts ?? []).some((art) => art?.uploadState !== 'failed')
  ).length;
}

/** Next `takeIndex` for a question; 1-based, so the first take is take 1. */
export function nextTakeIndex<
  T extends { questionId: string; takeIndex?: number },
>(answers: T[], questionId: string): number {
  return (
    answers
      .filter((a) => a.questionId === questionId)
      .reduce((max, a) => Math.max(max, a.takeIndex ?? 0), 0) + 1
  );
}

/** Prep-expiry markers that close the slot; a dead mic does not. */
const SLOT_CLOSING_REASONS = new Set(['passed', 'expired']);

/**
 * True once prep expiry wrote a terminal marker and no take exists. A late
 * take would outrank that marker in `selectRepresentativeAnswers`, so the
 * recorder must refuse to arm and the commit path must refuse to write.
 */
export function isRecordingSlotClosed<
  T extends { questionId: string; unresponded?: string },
>(answers: T[], questionId: string): boolean {
  const forQuestion = answers.filter((a) => a.questionId === questionId);
  if (forQuestion.some((a) => !a.unresponded)) return false;
  return forQuestion.some(
    (a) =>
      a.unresponded !== undefined && SLOT_CLOSING_REASONS.has(a.unresponded)
  );
}
