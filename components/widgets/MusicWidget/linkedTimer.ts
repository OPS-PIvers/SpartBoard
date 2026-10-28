import type { WidgetData } from '@/types';

/** The Timer this Music widget follows: its linked one when still on the board, else the board's first Timer. */
export const resolveSyncedTimer = (
  widgets: readonly WidgetData[],
  linkedTimerId: string | undefined
): WidgetData | undefined =>
  (linkedTimerId
    ? widgets.find((w) => w.id === linkedTimerId && w.type === 'time-tool')
    : undefined) ?? widgets.find((w) => w.type === 'time-tool');
