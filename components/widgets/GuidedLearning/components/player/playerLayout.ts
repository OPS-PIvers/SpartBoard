import type React from 'react';
import type { GuidedLearningMode } from '@/types';

/** Below this player width, v2 moves speed and read-aloud into an overflow menu. */
export const FOOTER_COMPACT_PX = 520;

/** Footer control size; the Studio's footer preview reuses it so the stage keeps the player's height. */
export const FOOTER_BUTTON_SIZE: React.CSSProperties = {
  width: 'min(44px, 6cqmin)',
  height: 'min(44px, 6cqmin)',
};
export const FOOTER_ICON_SIZE: React.CSSProperties = {
  width: 'min(24px, 3.5cqmin)',
  height: 'min(24px, 3.5cqmin)',
};

/** The player shows its nav footer in structured and guided modes only. */
export function playerShowsFooter(
  mode: GuidedLearningMode,
  stepCount: number
): boolean {
  return mode !== 'explore' && stepCount > 0;
}
