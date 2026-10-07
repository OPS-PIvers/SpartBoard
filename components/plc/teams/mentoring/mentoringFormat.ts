// Date and label formatting for mentoring screens.

import type { MentoringSubmitter } from '@/types';
import type { MentoringPairStatus } from '@/utils/mentoring';
import type { StatusTone } from '@/components/plc/redesignMockup/ui';

const fromKey = (dateKey: string): Date => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

const MONTH_DAY = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

/** "Sep 30". */
export const shortDate = (dateKey: string): string =>
  MONTH_DAY.format(fromKey(dateKey));

/** "Fri, Oct 24". */
export const dayAndDate = (dateKey: string): string => {
  const d = fromKey(dateKey);
  return `${WEEKDAY.format(d)}, ${MONTH_DAY.format(d)}`;
};

/** "Sep 29" from a timestamp. */
export const msDate = (ms: number): string => MONTH_DAY.format(new Date(ms));

/** Hub and tracker wording. */
export const SUBMITTER_LABEL: Record<MentoringSubmitter, string> = {
  mentee: 'Mentee',
  mentor: 'Mentor',
  both: 'Mentor and mentee',
};

/** Workspace table wording. */
export const SUBMITTER_SHORT: Record<MentoringSubmitter, string> = {
  mentee: 'Mentee',
  mentor: 'Mentor',
  both: 'Both',
};

export function pairStatusLabel(
  status: MentoringPairStatus
): [StatusTone, string] {
  if (status.kind === 'submitted') {
    const late =
      status.daysLate > 0
        ? ` · ${status.daysLate} ${status.daysLate === 1 ? 'day' : 'days'} late`
        : '';
    return ['done', `Submitted ${msDate(status.at)}${late}`];
  }
  if (status.kind === 'late') return ['warn', 'Late'];
  return ['none', 'Not started'];
}
