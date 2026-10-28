import type { Dashboard } from '@/types';

/** A Claude change older than this is history, not something happening now. */
export const CLAUDE_EDIT_FRESH_MS = 10 * 60 * 1000;

/** Each board's last Claude edit time, 0 when Claude never touched it. */
export const claudeEditStamps = (
  boards: readonly Dashboard[]
): Map<string, number> =>
  new Map(boards.map((b) => [b.id, b.claudeEditedAt ?? 0]));

/** Boards with a fresh, newer Claude stamp, other than the one on screen, newest first. */
export const findNewClaudeEdits = (
  previous: ReadonlyMap<string, number>,
  boards: readonly Dashboard[],
  activeId: string | null | undefined,
  now: number
): Dashboard[] =>
  boards
    .filter((b) => {
      const stamp = b.claudeEditedAt;
      if (!stamp || b.id === activeId) return false;
      if (stamp <= (previous.get(b.id) ?? 0)) return false;
      return now - stamp < CLAUDE_EDIT_FRESH_MS;
    })
    .sort((a, b) => (b.claudeEditedAt ?? 0) - (a.claudeEditedAt ?? 0));

export type ClaudeBadge = 'created' | 'edited';

/** The Boards list badge for a board, or null once the teacher has opened it. */
export const claudeBadgeFor = (board: Dashboard): ClaudeBadge | null =>
  board.claudeUnseen === true && board.claudeAction ? board.claudeAction : null;

/** Whether the whole window is full screen (Fullscreen API on the page or the browser's own F11), not a widget's video or embed. */
export const isFullScreenWindow = (): boolean => {
  if (document.fullscreenElement)
    return document.fullscreenElement === document.documentElement;
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: fullscreen)').matches &&
    Math.abs(window.innerWidth - window.screen.width) <= 2 &&
    Math.abs(window.innerHeight - window.screen.height) <= 2
  );
};
