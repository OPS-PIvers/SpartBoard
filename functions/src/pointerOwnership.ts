/** True when a pointer doc was written for a different session or teacher than the one it is read for. */
export function isForeignPointer(
  pointer: { sessionId?: unknown; teacherUid?: unknown } | null | undefined,
  expected: { sessionId?: string | null; teacherUid?: string | null }
): boolean {
  if (!pointer) return false;
  const differs = (actual: unknown, want: string | null | undefined) =>
    !!want && typeof actual === 'string' && actual !== want;
  return (
    differs(pointer.sessionId, expected.sessionId) ||
    differs(pointer.teacherUid, expected.teacherUid)
  );
}
