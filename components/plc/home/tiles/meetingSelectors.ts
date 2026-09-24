// Meeting tile selectors over the bounded Home meetings slice.

import type { PlcMeeting } from '@/types';

export { pickInProgressMeeting } from '@/components/plc/home/cards/commonAssessmentBannerSelectors';

/** The most recently held completed meeting, if any. */
export function pickLastCompletedMeeting(
  meetings: readonly PlcMeeting[]
): PlcMeeting | null {
  let best: PlcMeeting | null = null;
  for (const m of meetings) {
    if (m.deletedAt != null || m.status !== 'completed') continue;
    if (!best || m.heldAt > best.heldAt) best = m;
  }
  return best;
}
