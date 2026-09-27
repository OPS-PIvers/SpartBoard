/** Field the Claude connector sets on a student-facing item it creates or edits (functions/src/mcp/activity.ts REVIEW_MARK). */
export const CLAUDE_REVIEW_FIELD = 'claudeReviewPendingAt';

export interface ClaudeReviewable {
  claudeReviewPendingAt?: number | null;
}

export const isClaudeReviewPending = (item: ClaudeReviewable): boolean =>
  typeof item.claudeReviewPendingAt === 'number';

/** A teacher's own save counts as a review, so saves drop the mark instead of re-writing a stale one. */
export function withoutClaudeReview<T extends ClaudeReviewable>(item: T): T {
  if (!(CLAUDE_REVIEW_FIELD in item)) return item;
  const copy = { ...item };
  delete copy.claudeReviewPendingAt;
  return copy;
}
