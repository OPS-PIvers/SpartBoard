// Default title for a new meeting note, by team type.

import type { TFunction } from 'i18next';
import type { PlcGroupType } from '@/types';
import { formatShortDate } from './noteFormat';

export function meetingNoteTitle(
  t: TFunction,
  groupType: PlcGroupType,
  meetingAt: number
): string {
  const date = formatShortDate(meetingAt);
  switch (groupType) {
    case 'plc':
      return t('teams.notes.title.plc', {
        defaultValue: 'PLC meeting {{date}}',
        date,
      });
    case 'department':
      return t('teams.notes.title.department', {
        defaultValue: 'Department meeting {{date}}',
        date,
      });
    case 'mentoring':
      return t('teams.notes.title.mentoring', {
        defaultValue: 'Check-in {{date}}',
        date,
      });
    default:
      return t('teams.notes.title.other', {
        defaultValue: 'Meeting notes {{date}}',
        date,
      });
  }
}
