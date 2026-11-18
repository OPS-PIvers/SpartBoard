/** The Assigned tab's class status words (ASSIGNED_TAB.md D2), shown in place of Live, Paused or Ended. */
export type MonitorClassStatus =
  'open' | 'paused' | 'ready' | 'scheduled' | 'closed';

export const CLASS_STATUS_WORD: Record<MonitorClassStatus, string> = {
  open: 'Open',
  paused: 'Paused',
  ready: 'Ready',
  scheduled: 'Scheduled',
  closed: 'Closed',
};
