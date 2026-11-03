import type { WidgetConnection, WidgetData } from '@/types';
import { liveConnections, liveSteps } from '@/utils/connectionEngine';

/** Step numbers this widget holds across its board's live Sequences, plus whether the current Run step is its own. */
export const summaryKey = (
  connections: WidgetConnection[] | undefined,
  widgets: WidgetData[],
  widgetId: string
): string => {
  const numbers: number[] = [];
  let running = false;
  let follows = false;
  let firstId = '';
  let seqId = '';
  let seqRunning = false;
  for (const c of liveConnections(connections, widgets)) {
    if (c.kind === 'follow') {
      if (c.leaderId === widgetId || c.followerId === widgetId) {
        follows = true;
        firstId ||= c.id;
      }
      continue;
    }
    // Pause-only steps fold into an arrow in the editor, so they take no number here either.
    let shown = 0;
    liveSteps(c, widgets).forEach((s, i) => {
      if (s.actions.length > 0) shown += 1;
      if (!s.actions.some((a) => a.widgetId === widgetId)) return;
      numbers.push(shown);
      firstId ||= c.id;
      if (!seqId) {
        seqId = c.id;
        seqRunning = !!c.run;
      }
      if (c.run?.stepIndex === i) running = true;
    });
  }
  if (!firstId) return '';
  return [
    firstId,
    numbers.join(' · '),
    running ? '1' : '',
    follows ? '1' : '',
    seqId,
    seqRunning ? '1' : '',
  ].join('|');
};

/** True when this widget shows the connection tab, so widgets can keep their own top-right controls clear of it. */
export const hasConnectionTab = (
  connections: WidgetConnection[] | undefined,
  widgets: WidgetData[],
  widgetId: string
): boolean => !!summaryKey(connections, widgets, widgetId);
