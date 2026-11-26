/** Library items a teacher imports from a share link; each has one route prefix. */
export type LibraryShareKind =
  'quiz' | 'assignment' | 'videoActivity' | 'rubric';

export interface LibraryShareLink {
  kind: LibraryShareKind;
  shareId: string;
}

export const LIBRARY_SHARE_PREFIXES: Record<LibraryShareKind, string> = {
  quiz: '/share/quiz/',
  assignment: '/share/assignment/',
  videoActivity: '/share/video-activity/',
  rubric: '/share/rubric/',
};

const SHARE_ID = /^[a-zA-Z0-9_-]+$/;

/** The library share a path points at, or null for any other route. */
export const parseLibrarySharePath = (
  pathname: string
): LibraryShareLink | null => {
  for (const [kind, prefix] of Object.entries(LIBRARY_SHARE_PREFIXES) as [
    LibraryShareKind,
    string,
  ][]) {
    if (!pathname.startsWith(prefix)) continue;
    const shareId = pathname.slice(prefix.length).replace(/\/$/, '');
    return SHARE_ID.test(shareId) ? { kind, shareId } : null;
  }
  return null;
};

/** True for any /share/<kind>/ path, even one with a malformed id. */
export const isLibrarySharePath = (pathname: string): boolean =>
  Object.values(LIBRARY_SHARE_PREFIXES).some((prefix) =>
    pathname.startsWith(prefix)
  );

/** Parses pasted text (a full URL, a scheme-less URL or a path) into a library share. */
export const parseLibraryShareLink = (
  text: string
): LibraryShareLink | null => {
  let candidate = text.trim();
  if (!candidate) return null;
  if (
    !/^(http|https):\/\//i.test(candidate) &&
    /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:[/:?].*)?$/.test(candidate)
  ) {
    candidate = `https://${candidate}`;
  }
  try {
    return parseLibrarySharePath(
      new URL(candidate, window.location.origin).pathname
    );
  } catch {
    return null;
  }
};

export const librarySharePath = (kind: LibraryShareKind, shareId: string) =>
  `${LIBRARY_SHARE_PREFIXES[kind]}${shareId}`;
