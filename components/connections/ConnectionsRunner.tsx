import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import type { DashboardContextValue } from '@/context/DashboardContextValue';
import type {
  ChecklistConfig,
  Dashboard,
  SequenceConnection,
  WidgetConnection,
} from '@/types';
import { useRosterGroupsIntegrationSettingsState } from '@/hooks/useRosterGroupsIntegrationSettings';
import { checklistUsesClassRoster } from '@/utils/checklistCurrent';
import { engineWidgets } from '@/utils/connectionRosterView';
import {
  advanceRun,
  isStepFinished,
  startRun,
  joinRunByHand,
  liveSteps,
  type WidgetPatches,
} from '@/utils/connectionEngine';
import {
  CONNECTION_DEVICE_ID,
  onHandAction,
  onRunCommand,
  type RunCommand,
} from '@/utils/connectionSignals';
import { convertLegacyConnections } from '@/utils/legacyConnections';

type ApplyChanges = DashboardContextValue['applyConnectionChanges'];

const TICK_MS = 250;
// Another device takes over a Run whose step has been finished this long without moving on.
const TAKEOVER_MS = 5000;
// A Run this page finds already finished and this old was left behind by a closed page, so it stops instead of going on.
const STALE_RUN_MS = 10 * 60 * 1000;

// Runs move on their own, so they're left out of the comparison.
const sameConnections = (a: WidgetConnection[], b: WidgetConnection[]) => {
  const strip = (cs: WidgetConnection[]) =>
    JSON.stringify(
      cs.map((c) => (c.kind === 'sequence' ? { ...c, run: null } : c))
    );
  return strip(a) === strip(b);
};

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

// Reads the saved-groups gate only while some Connection needs it, so most boards open no extra listener.
const RosterGroupsGateReader: React.FC<{
  onChange: (gate: { enabled: boolean; ready: boolean }) => void;
}> = ({ onChange }) => {
  const { canAccessFeature } = useAuth();
  const rollout = useRosterGroupsIntegrationSettingsState();
  const enabled = rollout.settings.enabled && canAccessFeature('roster-groups');
  const ready = rollout.loaded;
  useLayoutEffect(() => {
    onChange({ enabled, ready });
  }, [enabled, ready, onChange]);
  return null;
};

const needsRosterGroups = (boards: Dashboard[]) =>
  boards.some(
    (b) =>
      (b.connections ?? []).length > 0 &&
      b.widgets.some(
        (w) =>
          w.type === 'checklist' &&
          checklistUsesClassRoster(w.config as ChecklistConfig) &&
          !!(w.config as ChecklistConfig).rosterPoolGroupId
      )
  );

// Carries out Sequence Runs on every board; renders nothing.
export const ConnectionsRunner: React.FC = () => {
  const { t } = useTranslation();
  const {
    dashboards,
    activeDashboard,
    applyConnectionChanges,
    addToast,
    rosters,
    activeRosterId,
  } = useDashboard();
  const { canAccessFeature } = useAuth();
  const enabled = canAccessFeature('widget-connections');
  const [gate, setGate] = useState({ enabled: false, ready: false });
  const groupsEnabled = gate.enabled;
  const groupsReady = gate.ready;

  const latest = useRef({
    dashboards,
    activeDashboard,
    applyConnectionChanges,
    addToast,
    t,
    roster: { rosters, activeRosterId, groupsEnabled, groupsReady },
  });
  useLayoutEffect(() => {
    latest.current = {
      dashboards,
      activeDashboard,
      applyConnectionChanges,
      addToast,
      t,
      roster: { rosters, activeRosterId, groupsEnabled, groupsReady },
    };
  });

  // Hand actions: start a Run at the matching step, or move the Run there.
  useEffect(() => {
    if (!enabled) return;
    return onHandAction((widgetId, hand) => {
      // A copied board keeps its widget ids, so the board on screen wins.
      const active = latest.current.activeDashboard;
      const board = active?.widgets.some((w) => w.id === widgetId)
        ? active
        : latest.current.dashboards.find((d) =>
            d.widgets.some((w) => w.id === widgetId)
          );
      if (!board) return;
      const widgets = engineWidgets(board, latest.current.roster);
      if (!widgets) return;
      const now = Date.now();
      const patches: WidgetPatches = {};
      const updated = new Map<string, WidgetConnection>();
      for (const c of board.connections ?? []) {
        if (c.kind !== 'sequence') continue;
        const joined = joinRunByHand(
          c,
          widgets,
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

  // Start, Stop and Next from a step badge.
  useEffect(() => {
    if (!enabled) return;
    let retry: number | undefined;
    const handle = (
      boardId: string,
      connectionId: string,
      command: RunCommand,
      tries: number,
      savedConnections?: WidgetConnection[]
    ) => {
      const board = latest.current.dashboards.find((d) => d.id === boardId);
      const seq = board?.connections?.find(
        (c): c is SequenceConnection =>
          c.id === connectionId && c.kind === 'sequence'
      );
      // Save and start sends the command before the saved board reaches this copy.
      const stale =
        !!savedConnections &&
        !!board &&
        !sameConnections(board.connections ?? [], savedConnections);
      if ((!board || !seq || stale) && tries < 20) {
        retry = window.setTimeout(
          () =>
            handle(boardId, connectionId, command, tries + 1, savedConnections),
          100
        );
        return;
      }
      // After the retries, a step mismatch still starts the copy the board has.
      if (!board || !seq) return;
      if (command === 'stop') {
        write(
          latest.current.applyConnectionChanges,
          board,
          {},
          new Map([[seq.id, { ...seq, run: null }]])
        );
        return;
      }
      const widgets = engineWidgets(board, latest.current.roster);
      if (!widgets) {
        latest.current.addToast(
          latest.current.t('connections.classNotLoaded'),
          'info'
        );
        return;
      }
      if (command === 'next') {
        if (!seq.run) return;
        const moved = advanceRun(
          seq,
          widgets,
          Date.now(),
          CONNECTION_DEVICE_ID
        );
        write(
          latest.current.applyConnectionChanges,
          board,
          moved.patches,
          new Map([[seq.id, moved.sequence]])
        );
        if (moved.finished) {
          latest.current.addToast(
            latest.current.t('connections.runFinished'),
            'info'
          );
        }
        return;
      }
      const started = startRun(seq, widgets, Date.now(), CONNECTION_DEVICE_ID);
      if (!started) {
        latest.current.addToast(
          latest.current.t('connections.nothingToStart'),
          'info'
        );
        return;
      }
      write(
        latest.current.applyConnectionChanges,
        board,
        started.patches,
        new Map([[seq.id, started.sequence]])
      );
      if (started.finished) {
        latest.current.addToast(
          latest.current.t('connections.runFinished'),
          'info'
        );
      }
    };
    const off = onRunCommand((boardId, id, command, savedConnections) =>
      handle(boardId, id, command, 0, savedConnections)
    );
    return () => {
      off();
      window.clearTimeout(retry);
    };
  }, [enabled]);

  // Old nexus toggles become Connections, once per widget (the marker stops a repeat).
  const converting = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled) return;
    for (const board of dashboards) {
      if (board.linkedShareRole === 'viewer' && !board.linkedShareEnded) {
        continue;
      }
      const result = convertLegacyConnections(board);
      if (!result) continue;
      const key = `${board.id}:${Object.keys(result.markers).sort().join(',')}`;
      if (converting.current.has(key)) continue;
      converting.current.add(key);
      applyConnectionChanges?.(board.id, result.markers, [
        ...(board.connections ?? []),
        ...result.connections,
      ]);
    }
  }, [enabled, dashboards, applyConnectionChanges]);

  const anyRun = enabled && dashboards.some(hasRun);
  // Keyed by board too: a copied board keeps its Connection ids.
  const overdueSince = useRef(new Map<string, number>());
  const advancedAt = useRef(new Map<string, number>());
  const seenSteps = useRef(new Set<string>());

  useEffect(() => {
    if (!anyRun) return;
    const tick = () => {
      const now = Date.now();
      for (const board of latest.current.dashboards) {
        if (!hasRun(board)) continue;
        const patches: WidgetPatches = {};
        const updated = new Map<string, WidgetConnection>();
        let finishedAny = false;
        const widgets = engineWidgets(board, latest.current.roster);
        // Wait for the class to load rather than act on an empty list.
        if (!widgets) continue;
        for (const c of board.connections ?? []) {
          if (c.kind !== 'sequence' || !c.run) continue;
          const key = `${board.id}:${c.id}`;
          // The last write may not have reached this board copy yet.
          if (now - (advancedAt.current.get(key) ?? 0) < TICK_MS * 2) continue;
          const seq: SequenceConnection = c;
          const run = c.run;
          const stepKey = `${key}:${run.stepIndex}:${run.stepStartedAt}`;
          const firstLook = !seenSteps.current.has(stepKey);
          seenSteps.current.add(stepKey);
          const steps = liveSteps(seq, board.widgets);
          const step = steps[run.stepIndex];
          const done =
            !step || isStepFinished(step, widgets, run.stepStartedAt, now);
          if (!done) {
            overdueSince.current.delete(key);
            continue;
          }
          if (
            firstLook &&
            run.deviceId !== CONNECTION_DEVICE_ID &&
            now - run.stepStartedAt > STALE_RUN_MS
          ) {
            advancedAt.current.set(key, now);
            updated.set(c.id, { ...seq, run: null });
            continue;
          }
          if (run.deviceId !== CONNECTION_DEVICE_ID) {
            const since = overdueSince.current.get(key) ?? now;
            overdueSince.current.set(key, since);
            if (now - since < TAKEOVER_MS) continue;
          }
          overdueSince.current.delete(key);
          advancedAt.current.set(key, now);
          const r = advanceRun(seq, widgets, now, CONNECTION_DEVICE_ID);
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

  return enabled && needsRosterGroups(dashboards) ? (
    <RosterGroupsGateReader onChange={setGate} />
  ) : null;
};
