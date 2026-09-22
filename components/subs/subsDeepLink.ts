/**
 * Parsing and building the `/subs/s/{shareId}[/{boardId}]` deep link.
 *
 * Pure string work — no Firestore, no auth, no React — so the routing rules
 * are testable without a provider tree. Whether the sub may actually open the
 * share is decided by the read rules and the expiry check, not here.
 */

export interface SubsDeepLink {
  shareId: string;
  /** Absent means "open the share's default board". */
  boardId?: string;
}

/** A Firestore document id may not be empty, `.`, `..`, or contain a slash. */
function isUsableId(raw: string): boolean {
  return raw.length > 0 && raw !== '.' && raw !== '..' && !raw.includes('/');
}

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    // A malformed escape sequence is not an id we can look up.
    return null;
  }
}

/**
 * Reads a share (and optionally a board) out of a `/subs` pathname. Returns
 * null for every other `/subs` path, including the bare portal, so the caller
 * falls through to the building picker.
 */
export function parseSubsDeepLink(pathname: string): SubsDeepLink | null {
  const segments = pathname.split('/').filter((s) => s.length > 0);
  if (segments[0] !== 'subs' || segments[1] !== 's') return null;
  if (segments.length < 3 || segments.length > 4) return null;

  const shareId = decode(segments[2]);
  if (shareId === null || !isUsableId(shareId)) return null;
  if (segments.length === 3) return { shareId };

  const boardId = decode(segments[3]);
  if (boardId === null || !isUsableId(boardId)) return null;
  return { shareId, boardId };
}

/** The canonical link for a share, optionally pinned to one board. */
export function subsDeepLinkPath(shareId: string, boardId?: string): string {
  const base = `/subs/s/${encodeURIComponent(shareId)}`;
  return boardId ? `${base}/${encodeURIComponent(boardId)}` : base;
}
