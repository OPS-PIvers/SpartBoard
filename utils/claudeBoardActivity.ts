import type { Dashboard } from '@/types';

/** A Claude change older than this is history, not something happening now. */
export const CLAUDE_EDIT_FRESH_MS = 10 * 60 * 1000;

/** Each board's last Claude edit time, 0 when Claude never touched it. */
export const claudeEditStamps = (
  boards: readonly Dashboard[]
): Map<string, number> =>
  new Map(boards.map((b) => [b.id, b.claudeEditedAt ?? 0]));

/**
 * Boards whose Claude stamp moved since `previous`, other than the one on
 * screen, newest first. Stale stamps are skipped so a late first load never
 * announces old edits.
 */
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

/** Whether the window is full screen, by the Fullscreen API or the browser's own (F11). */
export const isFullScreenWindow = (): boolean =>
  Boolean(document.fullscreenElement) ||
  (typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: fullscreen)').matches);
