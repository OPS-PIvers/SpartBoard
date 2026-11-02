import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import type { DashboardContextValue } from '@/context/DashboardContextValue';
import type { Dashboard, SequenceConnection, WidgetConnection } from '@/types';
import {
  advanceRun,
  isStepFinished,
  joinRunByHand,
  liveSteps,
  type WidgetPatches,
} from '@/utils/connectionEngine';
import { CONNECTION_DEVICE_ID, onHandAction } from '@/utils/connectionSignals';

type ApplyChanges = DashboardContextValue['applyConnectionChanges'];

const TICK_MS = 250;
// Another device takes over a Run whose step has been finished this long without moving on.
const TAKEOVER_MS = 5000;

const hasRun = (d: Dashboard) =>
  (d.connections ?? []).some((c) => c.kind === 'sequence' && !!c.run);

const write = (
  apply: ApplyChanges | undefined,
  board: Dashboard,
  patches: WidgetPatches,
  updated: Map<string, WidgetConnection>
) => {
  const connections = (board.connections ?? []).map(
    (c) => updated.get(c.id) ?? c
  );
  apply?.(board.id, patches, connections);
};

// Carries out Sequence Runs on every board; renders nothing.
export const ConnectionsRunner: React.FC = () => {
  const { t } = useTranslation();
  const { dashboards, applyConnectionChanges, addToast } = useDashboard();
  const { canAccessFeature } = useAuth();
  const enabled = canAccessFeature('widget-connections');

  const latest = useRef({ dashboards, applyConnectionChanges, addToast, t });
  useLayoutEffect(() => {
    latest.current = { dashboards, applyConnectionChanges, addToast, t };
  });

  // Hand actions: start a Run at the matching step, or move the Run there.
  useEffect(() => {
    if (!enabled) return;
    return onHandAction((widgetId, hand) => {
      const board = latest.current.dashboards.find((d) =>
        d.widgets.some((w) => w.id === widgetId)
      );
      if (!board) return;
      const now = Date.now();
      const patches: WidgetPatches = {};
      const updated = new Map<string, WidgetConnection>();
      for (const c of board.connections ?? []) {
        if (c.kind !== 'sequence') continue;
        const joined = joinRunByHand(
          c,
          board.widgets,
          widgetId,
          hand,
          now,
          CONNECTION_DEVICE_ID
        );
        if (!joined) continue;
        updated.set(c.id, joined.sequence);
        Object.assign(patches, joined.patches);
      }
      if (updated.size > 0)
        write(latest.current.applyConnectionChanges, board, patches, updated);
    });
  }, [enabled]);

  const anyRun = enabled && dashboards.some(hasRun);
  const overdueSince = useRef(new Map<string, number>());
  const advancedAt = useRef(new Map<string, number>());

  useEffect(() => {
    if (!anyRun) return;
    const tick = () => {
      const now = Date.now();
      for (const board of latest.current.dashboards) {
        if (!hasRun(board)) continue;
        const patches: WidgetPatches = {};
        const updated = new Map<string, WidgetConnection>();
        let finishedAny = false;
        for (const c of board.connections ?? []) {
          if (c.kind !== 'sequence' || !c.run) continue;
          // The last write may not have reached this board copy yet.
          if (now - (advancedAt.current.get(c.id) ?? 0) < TICK_MS * 2) continue;
          const seq: SequenceConnection = c;
          const run = c.run;
          const steps = liveSteps(seq, board.widgets);
          const step = steps[run.stepIndex];
          const done =
            !step ||
            isStepFinished(step, board.widgets, run.stepStartedAt, now);
          if (!done) {
            overdueSince.current.delete(c.id);
            continue;
          }
          if (run.deviceId !== CONNECTION_DEVICE_ID) {
            const since = overdueSince.current.get(c.id) ?? now;
            overdueSince.current.set(c.id, since);
            if (now - since < TAKEOVER_MS) continue;
          }
          overdueSince.current.delete(c.id);
          advancedAt.current.set(c.id, now);
          const r = advanceRun(seq, board.widgets, now, CONNECTION_DEVICE_ID);
          updated.set(c.id, r.sequence);
          Object.assign(patches, r.patches);
          if (r.finished) finishedAny = true;
        }
        if (updated.size === 0) continue;
        write(latest.current.applyConnectionChanges, board, patches, updated);
        if (finishedAny) {
          latest.current.addToast(
            latest.current.t('connections.runFinished'),
            'info'
          );
        }
      }
    };
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [anyRun]);

  return null;
};
