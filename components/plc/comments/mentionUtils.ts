/**
 * Pure @mention helpers for the PLC comment composer (Decision 2.6). Split out
 * of the component files so `react-refresh/only-export-components` stays happy
 * (the components export only components) and the matching/resolution logic is
 * unit-testable without rendering.
 */

import type { PlcMember } from '@/types';

export interface MentionCandidate {
  uid: string;
  displayName: string;
  email: string;
}

/**
 * Matches the in-progress `@query` immediately before the caret. The query is
 * the run of word characters (letters/digits/._-) after a trailing `@` that is
 * at the start of the text or preceded by whitespace.
 */
export const MENTION_QUERY_RE = /(?:^|\s)@([\w.-]*)$/;

/**
 * Filter + rank members for an @mention query (case-insensitive): matches at
 * the START of the display name or email local-part rank before substring
 * matches. Excludes `excludeUid` (the author shouldn't @mention themselves) and
 * caps the result at 8 rows. An empty query returns the first 8 members.
 */
export function filterMentionCandidates(
  members: readonly PlcMember[],
  query: string,
  excludeUid: string | null
): MentionCandidate[] {
  const q = query.trim().toLowerCase();
  const pool = members
    .filter((m) => m.uid !== excludeUid)
    .map((m) => ({
      uid: m.uid,
      displayName: m.displayName || m.email || m.uid,
      email: m.email,
    }));
  if (q.length === 0) return pool.slice(0, 8);
  const starts: MentionCandidate[] = [];
  const contains: MentionCandidate[] = [];
  for (const c of pool) {
    const name = c.displayName.toLowerCase();
    const local = c.email.split('@')[0]?.toLowerCase() ?? '';
    if (name.startsWith(q) || local.startsWith(q)) {
      starts.push(c);
    } else if (name.includes(q) || c.email.toLowerCase().includes(q)) {
      contains.push(c);
    }
  }
  return [...starts, ...contains].slice(0, 8);
}

/**
 * Resolve the final set of mentioned uids for a comment body: keep a selected
 * candidate only if its `@DisplayName` token still appears in the text (so
 * deleting the mention text drops the mention). De-duplicates by uid.
 */
export function resolveMentions(
  body: string,
  selected: readonly MentionCandidate[]
): string[] {
  const lower = body.toLowerCase();
  const uids: string[] = [];
  const seen = new Set<string>();
  for (const c of selected) {
    if (seen.has(c.uid)) continue;
    const token = `@${c.displayName}`.toLowerCase();
    if (lower.includes(token)) {
      seen.add(c.uid);
      uids.push(c.uid);
    }
  }
  return uids;
}
