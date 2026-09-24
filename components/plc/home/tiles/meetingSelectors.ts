// Meeting tile selectors over the bounded Home meetings slice.

import type { PlcMeeting } from '@/types';
import { zonedDateKey } from '@/utils/plcHomeTime';

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

/** Chicago dates of completed meetings, for the meeting-day hero (D26). */
export function completedMeetingDateKeys(
  meetings: readonly PlcMeeting[]
): string[] {
  return meetings
    .filter((m) => m.deletedAt == null && m.status === 'completed')
    .map((m) => zonedDateKey(m.heldAt));
}
