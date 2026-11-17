import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import type { DashboardContextValue } from '@/context/DashboardContextValue';
import type {
  ChecklistConfig,
  ConnectionStep,
  Dashboard,
  FeaturePermission,
  ScheduleConfig,
  SequenceConnection,
  SpecialistScheduleConfig,
  SpecialistScheduleGlobalConfig,
  WidgetConnection,
  WidgetData,
} from '@/types';
import {
  findDueWarning,
  markWarningFired,
  type DueWarning,
} from '@/components/widgets/Schedule/blockWarning';
import { findDueSpecialistWarning } from '@/components/widgets/SpecialistSchedule/blockWarning';
import { resolveBuildingConfig } from '@/components/widgets/SpecialistSchedule/utils';
import { resolveWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { useRosterGroupsIntegrationSettingsState } from '@/hooks/useRosterGroupsIntegrationSettings';
import { checklistUsesClassRoster } from '@/utils/checklistCurrent';
import { engineView } from '@/utils/connectionRosterView';
import {
  advanceRun,
  isStepFinished,
  runOutlivedBlock,
  startRun,
  joinRunByHand,
  liveSteps,
  nextStepIndex,
  warningScheduleOf,
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
// The longest a page waits before starting a block warning, so one of several open pages starts it.
const WARN_JITTER_MS = 1500;
// A remote Timer start: the page carrying the Run joins at once; others wait long enough to see its write first.
const JOIN_JITTER_MS = 1500;
const HIDDEN_JOIN_DELAY_MS = 3000;
const OTHER_PAGE_JOIN_DELAY_MS = 4000;
// A legacy conversion whose write hasn't shown up on the board after this long is tried again.
const CONVERT_RETRY_MS = 10000;

// Runs move on their own, so they're left out of the comparison.
const sameConnections = (a: WidgetConnection[], b: WidgetConnection[]) => {
  const strip = (cs: WidgetConnection[]) =>
    JSON.stringify(
      cs.map((c) => (c.kind === 'sequence' ? { ...c, run: null } : c))
    );
  return strip(a) === strip(b);
};

// A step that acts on a class-roster Checklist whose class is still loading has to wait for it.
const touches = (step: ConnectionStep | undefined, waiting: Set<string>) =>
  !!step && step.actions.some((a) => waiting.has(a.widgetId));

// True when a press on this widget could run a step that waits on a loading class.
const pressWaits = (
  seq: SequenceConnection,
  widgets: WidgetData[],
  widgetId: string,
  waiting: Set<string>
) =>
  waiting.size > 0 &&
  liveSteps(seq, widgets).some(
    (s) => s.actions.some((a) => a.widgetId === widgetId) && touches(s, waiting)
  );

const hasRun = (d: Dashboard) =>
  (d.connections ?? []).some((c) => c.kind === 'sequence' && !!c.run);

// Widgets a press or a Run just changed; the timer-start watcher leaves them to that handler.
const recentlyHandled = new Map<string, number>();
const HANDLED_MS = 1500;
const markHandled = (ids: string[]) => {
  const now = Date.now();
  ids.forEach((id) => recentlyHandled.set(id, now));
};

const write = (
  apply: ApplyChanges | undefined,
  board: Dashboard,
  patches: WidgetPatches,
  updated: Map<string, WidgetConnection>
) => {
  markHandled(Object.keys(patches));
  const connections = (board.connections ?? []).map(
    (c) => updated.get(c.id) ?? c
  );
  apply?.(board.id, patches, connections);
};

// A Daily Schedule's block times come from its building's rotation, so that config is read here too.
const dueWarningFor = (
  w: WidgetData,
  now: number,
  permissions: FeaturePermission[],
  selectedBuildings: string[]
): DueWarning | null => {
  if (w.type !== 'specialist-schedule') {
    return findDueWarning(w.config as unknown as ScheduleConfig, now);
  }
  const global = permissions.find((p) => p.widgetType === w.type)?.config as
    SpecialistScheduleGlobalConfig | undefined;
  const building = resolveBuildingConfig(
    global,
    resolveWidgetBuildingId(w, selectedBuildings)
  );
  return findDueSpecialistWarning(
    w.config as unknown as SpecialistScheduleConfig,
    building,
    now
  );
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
  const { featurePermissions, selectedBuildings } = useAuth();
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
    featurePermissions,
    selectedBuildings,
  });
  useLayoutEffect(() => {
    latest.current = {
      dashboards,
      activeDashboard,
      applyConnectionChanges,
      addToast,
      t,
      roster: { rosters, activeRosterId, groupsEnabled, groupsReady },
      featurePermissions,
      selectedBuildings,
    };
  });

  // Hand actions: start a Run at the matching step, or move the Run there.
  useEffect(() => {
    return onHandAction((widgetId, hand) => {
      markHandled([widgetId]);
      // A copied board keeps its widget ids, so the board on screen wins.
      const active = latest.current.activeDashboard;
      const board = active?.widgets.some((w) => w.id === widgetId)
        ? active
        : latest.current.dashboards.find((d) =>
            d.widgets.some((w) => w.id === widgetId)
          );
      if (!board) return;
      const { widgets, waiting } = engineView(board, latest.current.roster);
      const now = Date.now();
      const patches: WidgetPatches = {};
      const updated = new Map<string, WidgetConnection>();
      let finished = false;
      let held = false;
      for (const c of board.connections ?? []) {
        if (c.kind !== 'sequence') continue;
        if (pressWaits(c, widgets, widgetId, waiting)) {
          held = true;
          continue;
        }
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
        if (joined.finished) finished = true;
      }
      if (updated.size > 0)
        write(latest.current.applyConnectionChanges, board, patches, updated);
      if (finished) {
        latest.current.addToast(
          latest.current.t('connections.runFinished'),
          'info'
        );
      }
      if (held) {
        latest.current.addToast(
          latest.current.t('connections.classNotLoaded'),
          'info'
        );
      }
    });
  }, []);

  // A Timer started from the phone remote, a routine or a linked widget joins the Run like a hand press.
  const wasRunning = useRef(new Map<string, boolean>());
  const joinWaits = useRef(new Set<number>());
  useEffect(() => {
    const waits = joinWaits.current;
    return () => {
      waits.forEach((id) => window.clearTimeout(id));
      waits.clear();
    };
  }, []);
  useEffect(() => {
    const board = activeDashboard;
    if (!board) return;
    // Record every Timer first, so a start seen while the watcher was idle never counts later.
    const started: string[] = [];
    const now = Date.now();
    for (const w of board.widgets) {
      if (w.type !== 'time-tool') continue;
      const key = `${board.id}:${w.id}`;
      const running = !!(w.config as { isRunning?: boolean }).isRunning;
      const before = wasRunning.current.get(key);
      wasRunning.current.set(key, running);
      const handled = now - (recentlyHandled.get(w.id) ?? 0) < HANDLED_MS;
      if (before === false && running && !handled) started.push(w.id);
    }
    if (started.length === 0 || !board.connections?.length) return;
    if (board.linkedShareRole === 'viewer' && !board.linkedShareEnded) return;
    // Every open page sees the start, so only one should join: the Run's own page first, then whichever page is first to wait it out.
    const runDevices = board.connections.flatMap((c) =>
      c.kind === 'sequence' && c.run ? [c.run.deviceId] : []
    );
    const delay = runDevices.includes(CONNECTION_DEVICE_ID)
      ? 0
      : (runDevices.length > 0 ? OTHER_PAGE_JOIN_DELAY_MS : 0) +
        Math.random() * JOIN_JITTER_MS +
        (document.visibilityState === 'hidden' ? HIDDEN_JOIN_DELAY_MS : 0);
    const wait = window.setTimeout(() => {
      joinWaits.current.delete(wait);
      const current = latest.current.activeDashboard;
      if (current?.id !== board.id || !current.connections?.length) return;
      // A Timer stopped again before the wait ended doesn't join.
      const stillRunning = started.filter((id) =>
        current.widgets.some(
          (w) =>
            w.id === id && !!(w.config as { isRunning?: boolean }).isRunning
        )
      );
      if (stillRunning.length === 0) return;
      const { widgets, waiting } = engineView(current, latest.current.roster);
      const at = Date.now();
      const patches: WidgetPatches = {};
      const updated = new Map<string, WidgetConnection>();
      for (const c of current.connections) {
        if (c.kind !== 'sequence') continue;
        let seq: SequenceConnection = c;
        for (const id of stillRunning) {
          if (pressWaits(seq, widgets, id, waiting)) continue;
          const joined = joinRunByHand(
            seq,
            widgets,
            id,
            'start',
            at,
            CONNECTION_DEVICE_ID
          );
          if (!joined) continue;
          seq = joined.sequence;
          updated.set(c.id, seq);
          Object.assign(patches, joined.patches);
        }
      }
      if (updated.size > 0)
        write(latest.current.applyConnectionChanges, current, patches, updated);
    }, delay);
    joinWaits.current.add(wait);
  }, [activeDashboard]);

  // Start, Stop and Next from a step badge.
  useEffect(() => {
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
      const { widgets, waiting } = engineView(board, latest.current.roster);
      const steps = liveSteps(seq, widgets);
      const nextIndex =
        command === 'next' ? nextStepIndex(seq, steps, widgets) : 0;
      if (nextIndex !== null && touches(steps[nextIndex], waiting)) {
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
  }, []);

  // Old nexus toggles become Connections, once per widget (the marker stops a repeat).
  const converting = useRef(new Map<string, number>());
  useEffect(() => {
    const now = Date.now();
    for (const board of dashboards) {
      if (board.linkedShareRole === 'viewer' && !board.linkedShareEnded) {
        continue;
      }
      const result = convertLegacyConnections(board);
      if (!result) continue;
      const key = `${board.id}:${Object.keys(result.markers).sort().join(',')}`;
      // A write that never landed (refused or overwritten) leaves the board unmarked, so it is tried again later.
      const triedAt = converting.current.get(key);
      if (triedAt !== undefined && now - triedAt < CONVERT_RETRY_MS) continue;
      converting.current.set(key, now);
      applyConnectionChanges?.(board.id, result.markers, [
        ...(board.connections ?? []),
        ...result.connections,
      ]);
    }
  }, [dashboards, applyConnectionChanges]);

  const anyRun = dashboards.some(hasRun);
  // Keyed by board too: a copied board keeps its Connection ids.
  const overdueSince = useRef(new Map<string, number>());
  const advancedAt = useRef(new Map<string, number>());
  const seenSteps = useRef(new Set<string>());
  const warnEligibleAt = useRef(new Map<string, number>());
  const staleSteps = useRef(new Set<string>());
  const heldToasts = useRef(new Set<string>());

  useEffect(() => {
    if (!anyRun) return;
    const tick = () => {
      const now = Date.now();
      for (const board of latest.current.dashboards) {
        if (!hasRun(board)) continue;
        // A view-only board can't save a Run's writes, so it doesn't carry one out.
        if (board.linkedShareRole === 'viewer' && !board.linkedShareEnded) {
          continue;
        }
        const patches: WidgetPatches = {};
        const updated = new Map<string, WidgetConnection>();
        let finishedAny = false;
        const { widgets, waiting } = engineView(board, latest.current.roster);
        for (const c of board.connections ?? []) {
          if (c.kind !== 'sequence' || !c.run) continue;
          const key = `${board.id}:${c.id}`;
          // The last write may not have reached this board copy yet.
          if (now - (advancedAt.current.get(key) ?? 0) < TICK_MS * 2) continue;
          const seq: SequenceConnection = c;
          const run = c.run;
          if (runOutlivedBlock(run, now)) {
            advancedAt.current.set(key, now);
            updated.set(c.id, { ...seq, run: null });
            continue;
          }
          const stepKey = `${key}:${run.stepIndex}:${run.stepStartedAt}`;
          // Counted as seen only once the step isn't held, so a held stale step is still caught later.
          const firstLook = !seenSteps.current.has(stepKey);
          const steps = liveSteps(seq, board.widgets);
          const step = steps[run.stepIndex];
          // Wait for the class to load rather than act on an empty list; the steps around it keep going.
          const held = () => {
            if (heldToasts.current.has(stepKey)) return;
            heldToasts.current.add(stepKey);
            latest.current.addToast(
              latest.current.t('connections.classNotLoaded'),
              'info'
            );
          };
          if (touches(step, waiting)) {
            held();
            continue;
          }
          const done =
            !step || isStepFinished(step, widgets, run.stepStartedAt, now);
          if (!done) {
            seenSteps.current.add(stepKey);
            overdueSince.current.delete(key);
            continue;
          }
          const next = nextStepIndex(seq, steps, widgets);
          if (next !== null && touches(steps[next], waiting)) {
            held();
            continue;
          }
          seenSteps.current.add(stepKey);
          if (
            firstLook &&
            run.deviceId !== CONNECTION_DEVICE_ID &&
            now - run.stepStartedAt > STALE_RUN_MS
          ) {
            staleSteps.current.add(stepKey);
          }
          if (run.deviceId !== CONNECTION_DEVICE_ID) {
            const since = overdueSince.current.get(key) ?? now;
            overdueSince.current.set(key, since);
            if (now - since < TAKEOVER_MS) continue;
          }
          overdueSince.current.delete(key);
          advancedAt.current.set(key, now);
          // Still unmoved after the grace: its page is gone, so stop rather than start the next step.
          if (staleSteps.current.has(stepKey)) {
            updated.set(c.id, { ...seq, run: null });
            continue;
          }
          const r = advanceRun(seq, widgets, now, CONNECTION_DEVICE_ID);
          updated.set(c.id, r.sequence);
          Object.assign(patches, r.patches);
          if (r.finished && !run.block) finishedAny = true;
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

  // A Sequence that starts with Schedule's block warning begins itself when a block is about to end.
  const watchWarnings = !!activeDashboard?.connections?.some(
      (c) =>
        c.kind === 'sequence' && !!warningScheduleOf(c, activeDashboard.widgets)
    );

  useEffect(() => {
    if (!watchWarnings) return;
    const tick = () => {
      const board = latest.current.activeDashboard;
      if (!board) return;
      if (board.linkedShareRole === 'viewer' && !board.linkedShareEnded) return;
      const { widgets, waiting } = engineView(board, latest.current.roster);
      const now = Date.now();
      const patches: WidgetPatches = {};
      const updated = new Map<string, WidgetConnection>();
      const due = new Map<string, DueWarning | null>();
      const fired = new Set<string>();
      for (const c of board.connections ?? []) {
        if (c.kind !== 'sequence' || c.run) continue;
        const schedule = warningScheduleOf(c, widgets);
        if (!schedule) continue;
        // A Sequence whose first step needs a loading class waits for it and starts on a later check.
        if (touches(liveSteps(c, widgets)[0], waiting)) continue;
        if (!due.has(schedule.id)) {
          due.set(
            schedule.id,
            dueWarningFor(
              schedule,
              now,
              latest.current.featurePermissions,
              latest.current.selectedBuildings
            )
          );
        }
        const warning = due.get(schedule.id);
        if (!warning) continue;
        // Every open page sees a warning come due at once, so each waits a random moment and re-checks the synced board first.
        const waitKey = `${board.id}:${c.id}:${warning.key}:${new Date(now).toDateString()}`;
        const eligibleAt = warnEligibleAt.current.get(waitKey);
        if (eligibleAt === undefined) {
          warnEligibleAt.current.set(
            waitKey,
            now + Math.random() * WARN_JITTER_MS
          );
          continue;
        }
        if (now < eligibleAt) continue;
        const started = startRun(
          c,
          widgets,
          now,
          CONNECTION_DEVICE_ID,
          warning.block
        );
        // A warning that can't start today isn't retried every moment; the day in the key lets it try again tomorrow.
        warnEligibleAt.current.set(waitKey, Infinity);
        if (!started) continue;
        updated.set(c.id, started.sequence);
        for (const [id, p] of Object.entries(started.patches)) {
          patches[id] = { ...(patches[id] ?? {}), ...p };
        }
        fired.add(schedule.id);
      }
      if (updated.size === 0) return;
      for (const id of fired) {
        const schedule = widgets.find((w) => w.id === id);
        const warning = due.get(id);
        if (!schedule || !warning) continue;
        patches[id] = {
          ...(patches[id] ?? {}),
          warningsFired: markWarningFired(
            schedule.config as unknown as ScheduleConfig,
            warning.key,
            now
          ),
        };
      }
      write(latest.current.applyConnectionChanges, board, patches, updated);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [watchWarnings]);

  return needsRosterGroups(dashboards) ? (
    <RosterGroupsGateReader onChange={setGate} />
  ) : null;
};
