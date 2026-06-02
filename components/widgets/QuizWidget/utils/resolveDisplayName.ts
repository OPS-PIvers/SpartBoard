/**
 * Shared display-name resolution for QuizResponse rows on the teacher side.
 *
 * A QuizResponse can come from one of two student auth flows:
 *   - Anonymous PIN join (the original `/join` and `/quiz?code=…` flow).
 *     Identity is the teacher-assigned roster PIN; names come from
 *     `pinToName` built off ClassRosters.
 *   - SSO `studentRole` join (ClassLink-via-Google, launched from
 *     `/my-assignments`). The response has no PIN; identity is the auth uid,
 *     and names come from `byStudentUid` populated by
 *     `useAssignmentPseudonyms` (`getPseudonymsForAssignmentV1`).
 *
 * Resolution priority:
 *   1. ClassLink name (authoritative for SSO students).
 *   2. Roster PIN match (teacher-built name list for anonymous students).
 *   3. Literal `PIN <pin>` for anonymous students with no roster name.
 *   4. `Student` for SSO students whose pseudonym lookup hasn't resolved yet
 *      or whose classId isn't synced — never `PIN undefined`.
 *
 * Also exposes id/color helpers because the scoreboard utilities key on
 * `response.pin`, which is now optional. Use these to keep keys stable
 * across both auth flows.
 */

import type { QuizResponse } from '@/types';
import {
  formatStudentName,
  type StudentName,
} from '@/hooks/useAssignmentPseudonyms';
import { resolvePinName } from './quizScoreboard';

/** Fallback rendered when no name source resolves. */
export const UNKNOWN_STUDENT_LABEL = 'Student';

/**
 * Resolve a friendly display name for a response. See module docstring for
 * resolution priority. Always returns a non-empty string.
 */
export function resolveResponseDisplayName(
  response: QuizResponse,
  pinToName: Record<string, string>,
  byStudentUid: Map<string, StudentName> | undefined
): string {
  const ssoName = byStudentUid
    ? formatStudentName(byStudentUid.get(response.studentUid))
    : '';
  if (ssoName) return ssoName;

  if (response.pin) {
    // Disambiguate by classPeriod so the same PIN in two rosters resolves
    // to two different students. `resolvePinName` falls back to a global
    // suffix scan when classPeriod is missing (legacy responses).
    const rosterName = resolvePinName(
      pinToName,
      response.classPeriod,
      response.pin
    );
    if (rosterName) return rosterName;
    return `PIN ${response.pin}`;
  }

  return UNKNOWN_STUDENT_LABEL;
}

/**
 * Returns true when the response came in via PIN auth (i.e. the response
 * has a usable `pin` value the teacher view can show in pin-mode).
 */
export function hasPinIdentity(response: QuizResponse): boolean {
  return typeof response.pin === 'string' && response.pin.length > 0;
}

/**
 * Detect likely duplicate / forked identities within a response set.
 *
 * A single physical student can end up with two response docs — e.g. a
 * ClassLink/SSO "joined" stub plus a separate completed doc written under a
 * different identity by the wrong-period PIN-bridge fork. Both resolve to the
 * SAME real roster/ClassLink name, so we flag any *resolved* name that maps to
 * more than one distinct response.
 *
 * Only real names are considered. The generic `Student` and `PIN <n>`
 * fallbacks recur across many unrelated rows (every unresolved SSO joiner is
 * "Student"), so counting them would flood the teacher with false positives —
 * they're skipped here.
 *
 * Returns the set of `responseTeamId(response)` values that share a real name
 * with at least one other response; callers badge those rows for review.
 */
export function findDuplicateResponseIds(
  responses: QuizResponse[],
  pinToName: Record<string, string>,
  byStudentUid: Map<string, StudentName> | undefined
): Set<string> {
  const idsByName = new Map<string, Set<string>>();
  for (const r of responses) {
    const name = resolveResponseDisplayName(r, pinToName, byStudentUid);
    // Skip the generic fallbacks — only a real resolved name is reliable.
    if (name === UNKNOWN_STUDENT_LABEL) continue;
    if (r.pin && name === `PIN ${r.pin}`) continue;
    const ids = idsByName.get(name) ?? new Set<string>();
    ids.add(responseTeamId(r));
    idsByName.set(name, ids);
  }
  const duplicates = new Set<string>();
  for (const ids of idsByName.values()) {
    if (ids.size > 1) ids.forEach((id) => duplicates.add(id));
  }
  return duplicates;
}

/**
 * Stable, unique team id for scoreboard rows. PIN joiners keep their
 * historical `pin-{pin}` shape so existing scoreboard widgets that reference
 * those ids (via `parseInt(response.pin, 10)`) keep working. SSO students
 * fall back to `uid-{studentUid}`.
 */
export function responseTeamId(response: QuizResponse): string {
  if (response.pin) return `pin-${response.pin}`;
  return `uid-${response.studentUid}`;
}

/**
 * djb2-style hash of a string. Returns a non-negative integer suitable for
 * indexing into a fixed-size palette via modulo. Stable across runs and
 * across browsers.
 */
function stableHash(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  // Force unsigned so the modulo result is always non-negative.
  return hash >>> 0;
}

/**
 * Stable color-palette index for a response. PIN joiners preserve their
 * existing numeric-pin-modulo behavior so a single session's colors don't
 * shuffle around when SSO students join. SSO students hash their studentUid.
 */
export function responseColorIndex(
  response: QuizResponse,
  paletteLength: number
): number {
  if (paletteLength <= 0) return 0;
  // True modulo: JS `%` keeps the sign of the dividend, so a negative-string
  // PIN (e.g. "-1") would yield a negative index and indexing into the
  // palette would return undefined. `((n % m) + m) % m` always lands in
  // [0, paletteLength). `stableHash` already returns an unsigned integer.
  const mod = (n: number) =>
    ((n % paletteLength) + paletteLength) % paletteLength;
  if (response.pin) {
    const numeric = parseInt(response.pin, 10);
    if (Number.isFinite(numeric)) return mod(numeric);
    return stableHash(response.pin) % paletteLength;
  }
  return stableHash(response.studentUid) % paletteLength;
}
