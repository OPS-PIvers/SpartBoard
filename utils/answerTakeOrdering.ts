/**
 * Shared "pick one representative answer per questionId" rule for every
 * scoring/stat consumer that must dedupe a duplicate-questionId `answers[]`
 * array (Firestore arrayUnion races, Drive-sync double-writes, or a genuine
 * retake once takes exist).
 *
 * Highest `takeIndex` wins; ties (equal or absent `takeIndex`) are broken by
 * earliest `answeredAt`. A race-created duplicate carries the SAME
 * `takeIndex` as the original, so it stays resolved by `answeredAt` exactly
 * as before — while a genuine retake (strictly higher `takeIndex`) wins
 * cleanly. Absent `takeIndex` is treated as `0` for every entry, which
 * reproduces today's first-occurrence-by-`answeredAt` behavior byte-for-byte
 * on every document written before takes existed (#1728, #1777).
 */
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
