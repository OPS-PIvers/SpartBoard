/** Text for the answer-key summary banner in the import review (QUIZ_IMPORT_RELIABILITY.md R19). */

/** What the key merge reports; matches `ExtractedQuiz.keySummary` from the key reader. */
export interface KeySummaryCounts {
  entries: number;
  matched: number;
  unmatchedLabels: readonly string[];
  conflicts: number;
}

/** "21–22" for a run of plain numbers, otherwise the labels as printed. */
export function formatLabels(labels: readonly string[]): string {
  if (labels.length === 0) return '';
  const nums = labels.map((l) => (/^\d+$/.test(l.trim()) ? Number(l) : NaN));
  if (nums.every((n) => !Number.isNaN(n))) {
    const sorted = [...new Set(nums)].sort((a, b) => a - b);
    const runs: string[] = [];
    let start = sorted[0];
    let prev = sorted[0];
    for (const n of [...sorted.slice(1), Infinity]) {
      if (n === prev + 1) {
        prev = n;
        continue;
      }
      runs.push(start === prev ? `${start}` : `${start}–${prev}`);
      start = n;
      prev = n;
    }
    return runs.join(', ');
  }
  return labels.join(', ');
}

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/** The banner's parts, in order; empty when there was no key and nothing unticked. */
export function keySummaryParts(
  summary: KeySummaryCounts | undefined,
  questionCount: number,
  untickedCount: number
): string[] {
  const parts: string[] = [];
  if (summary && summary.entries > 0) {
    parts.push(
      `${summary.matched} of ${plural(questionCount, 'question', 'questions')} matched`
    );
    const unmatched = summary.unmatchedLabels.length;
    parts.push(
      unmatched > 0
        ? `key lists ${plural(summary.entries, 'entry', 'entries')} (${formatLabels(summary.unmatchedLabels)} matched no question)`
        : `key lists ${plural(summary.entries, 'entry', 'entries')}`
    );
    if (summary.conflicts > 0) {
      parts.push(plural(summary.conflicts, 'conflict', 'conflicts'));
    }
  }
  if (untickedCount > 0) {
    parts.push(
      `${plural(untickedCount, 'item', 'items')} unticked (not scored)`
    );
  }
  return parts;
}
