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
