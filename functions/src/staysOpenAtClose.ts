// Server twin of utils/staysOpenAtClose.ts; both are checked against staysOpenAtClose.cases.json.
type Doc = Record<string, unknown>;

function num(map: unknown, uid: string): number | null {
  const v = map && typeof map === 'object' ? (map as Doc)[uid] : undefined;
  return typeof v === 'number' ? v : null;
}

/** Let in, reopened for, unlocked, scheduled for later, or nothing to turn in: left open by a class Close. */
export function staysOpenAtClose(
  session: Doc,
  response: Doc,
  now: number,
  opts: { blank: boolean }
): boolean {
  if (opts.blank || response.unlocked === true) return true;
  const uid =
    typeof response.studentUid === 'string' ? response.studentUid : '';
  if (!uid) return false;
  if (Array.isArray(session.reopenedFor) && session.reopenedFor.includes(uid))
    return true;
  const until = num(session.studentAccess, uid);
  const from = num(session.studentAccessFrom, uid);
  if (until === null || until <= now) return false;
  // A running pass, or a time set for later that the student still has ahead.
  return from === null || from <= now || until > from;
}
