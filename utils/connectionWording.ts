import type { ConnectionStep, SequenceConnection, WidgetData } from '@/types';
import { actionDefFor } from '@/config/widgetConnections';

export type RowHeading =
  | { kind: 'start' }
  | { kind: 'after-pause' }
  | { kind: 'then' }
  | { kind: 'next-block' }
  | { kind: 'ends'; widgetIds: string[] };

const isPause = (s: ConnectionStep) =>
  s.actions.length === 0 && (s.waitSeconds ?? 0) > 0;

/** What a row waits for, from the step before it ("When Timer ends"); no step before means Start. */
export const headingAfter = (
  before: ConnectionStep | undefined,
  widgets: WidgetData[]
): RowHeading => {
  if (!before) return { kind: 'start' };
  if (isPause(before)) return { kind: 'after-pause' };
  const types = new Map(widgets.map((w) => [w.id, w.type]));
  const waits = before.actions.flatMap((a) => {
    const type = types.get(a.widgetId);
    const waitsFor = type && actionDefFor(type, a.action)?.waitsFor;
    return waitsFor ? [{ id: a.widgetId, waitsFor }] : [];
  });
  if (waits.some((w) => w.waitsFor === 'next-block')) {
    return { kind: 'next-block' };
  }
  if (waits.length > 0) {
    return { kind: 'ends', widgetIds: waits.map((w) => w.id) };
  }
  return { kind: 'then' };
};

/** What runs out to end a loop ("names", "items"), or null when only Stop ends it. */
export const loopRunsOut = (
  seq: SequenceConnection,
  widgets: WidgetData[]
): 'names' | 'items' | null => {
  const byId = new Map(widgets.map((w) => [w.id, w]));
  for (const s of seq.steps) {
    for (const a of s.actions) {
      const w = byId.get(a.widgetId);
      const runsOut =
        w &&
        actionDefFor(w.type, a.action)?.runsOut?.(
          w.config as Record<string, unknown>
        );
      if (runsOut) return runsOut;
    }
  }
  return null;
};
