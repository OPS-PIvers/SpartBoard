// Choose-N picks for a Review game live on the device; the server learns them from what gets answered.
const keyFor = (sessionId: string, studentUid: string) =>
  `spartboard:quizGamePicks:${sessionId}:${studentUid}`;

export function loadGamePicks(
  sessionId: string,
  studentUid: string
): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(keyFor(sessionId, studentUid));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string[]> = {};
    for (const [section, ids] of Object.entries(parsed)) {
      if (Array.isArray(ids) && ids.every((id) => typeof id === 'string'))
        out[section] = ids;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveGamePicks(
  sessionId: string,
  studentUid: string,
  picks: Record<string, string[]>
): void {
  try {
    localStorage.setItem(keyFor(sessionId, studentUid), JSON.stringify(picks));
  } catch {
    // Private windows can refuse storage; picks then rebuild from answered questions.
  }
}
