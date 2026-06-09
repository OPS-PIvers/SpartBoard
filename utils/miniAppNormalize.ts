/**
 * Read-side normalization for MiniApp session docs.
 *
 * Previously this logic lived as an unexported `normalizeSession` constant
 * inside `hooks/useMiniAppSession.ts`. The hand-enumerated literal return
 * silently dropped every optional field on `MiniAppSession` not explicitly
 * listed — including `classIds`, `rosterIds`, `endedAt`, `submissionsEnabled`,
 * and `mode`. When `onSnapshot` fired and the teacher's session list was
 * refreshed, those dropped fields caused data loss in the teacher UI (e.g.
 * `submissionsEnabled: false` became `undefined`, `classIds` vanished).
 *
 * Fix: spread `...data` first so ALL optional fields are preserved, then
 * override only the fields that require normalization or defaulting.
 *
 * Pure function; safe to call repeatedly.
 */

import type { MiniAppSession } from '@/types';

/**
 * Normalize a raw Firestore `mini_app_sessions` document into a
 * fully-typed `MiniAppSession`.
 *
 * Spreads the source data first so ALL optional fields (`classIds`,
 * `rosterIds`, `endedAt`, `submissionsEnabled`, `mode`, etc.) are
 * preserved. Required fields are then overridden with normalized /
 * defaulted values.
 */
export function normalizeMiniAppSession(
  sessionId: string,
  data: Partial<MiniAppSession>
): MiniAppSession {
  const appTitle = data.appTitle ?? 'Mini App';
  const createdAt = data.createdAt ?? Date.now();

  return {
    ...data,
    id: sessionId,
    appId: data.appId ?? '',
    appTitle,
    appHtml: data.appHtml ?? '',
    teacherUid: data.teacherUid ?? '',
    assignmentName:
      data.assignmentName && data.assignmentName.trim().length > 0
        ? data.assignmentName
        : `${appTitle} — ${new Date(createdAt).toLocaleString()}`,
    status: data.status === 'ended' ? 'ended' : 'active',
    createdAt,
  };
}
