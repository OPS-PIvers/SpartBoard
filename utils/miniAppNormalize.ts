/**
 * Read-side normalization for MiniApp session docs.
 *
 * Previously this logic lived as an unexported `normalizeSession` constant
 * inside `hooks/useMiniAppSession.ts`. The hand-enumerated literal return
 * silently dropped every optional field on `MiniAppSession` not explicitly
 * listed — including `ltiAttachment`, `sessionOptions`, `periodNames`, etc.
 * When `onSnapshot` fired and the teacher's session list was refreshed, those
 * dropped fields caused data loss in the teacher UI.
 *
 * Fix: destructure the known fields (applying their original normalization
 * logic unchanged), then spread `...restData` to preserve ALL other optional
 * fields that arrive in the Firestore snapshot.
 *
 * Pure function; safe to call repeatedly.
 */

import type { MiniAppSession } from '@/types';

/**
 * Normalize a raw Firestore `mini_app_sessions` document into a
 * fully-typed `MiniAppSession`.
 *
 * All explicitly-handled fields retain their original normalization guards
 * (classIds/rosterIds filtered to valid strings, endedAt type-checked,
 * submissionsEnabled only included when strictly true, mode validated).
 * All other optional fields are preserved via `...restData`.
 */
export function normalizeMiniAppSession(
  sessionId: string,
  data: Partial<MiniAppSession>
): MiniAppSession {
  const {
    id: _discardedId,
    appId,
    appTitle: rawAppTitle,
    appHtml,
    teacherUid,
    assignmentName: rawAssignmentName,
    status,
    createdAt: rawCreatedAt,
    endedAt,
    classIds: rawClassIds,
    rosterIds: rawRosterIds,
    submissionsEnabled,
    mode,
    ...restData
  } = data;

  const appTitle = rawAppTitle ?? 'Mini App';
  const createdAt = rawCreatedAt ?? Date.now();

  const classIds = Array.isArray(rawClassIds)
    ? rawClassIds.filter(
        (c): c is string => typeof c === 'string' && c.length > 0
      )
    : [];

  const rosterIds = Array.isArray(rawRosterIds)
    ? rawRosterIds.filter(
        (r): r is string => typeof r === 'string' && r.length > 0
      )
    : [];

  return {
    ...restData,
    id: sessionId,
    appId: appId ?? '',
    appTitle,
    appHtml: appHtml ?? '',
    teacherUid: teacherUid ?? '',
    assignmentName:
      rawAssignmentName && rawAssignmentName.trim().length > 0
        ? rawAssignmentName
        : `${appTitle} — ${new Date(createdAt).toLocaleString()}`,
    status: status === 'ended' ? 'ended' : 'active',
    createdAt,
    ...(typeof endedAt === 'number' ? { endedAt } : {}),
    ...(classIds.length > 0 ? { classIds } : {}),
    ...(rosterIds.length > 0 ? { rosterIds } : {}),
    ...(submissionsEnabled === true ? { submissionsEnabled: true } : {}),
    ...(mode === 'view-only' || mode === 'submissions' ? { mode } : {}),
  };
}
