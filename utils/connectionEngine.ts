// Pure Sequence/Follow logic for widget Connections (docs/adr/0002); the runner component does the I/O.
import type {
  ConnectionStep,
  SequenceConnection,
  WidgetConnection,
  WidgetData,
  WidgetType,
} from '@/types';
import {
  actionDefFor,
  connectionDefFor,
  type ConnectionHandAction,
} from '@/config/widgetConnections';

type Config = Record<string, unknown>;
export type WidgetPatches = Record<string, Config>;

const byId = (widgets: WidgetData[]) => new Map(widgets.map((w) => [w.id, w]));

const newId = () => crypto.randomUUID();

// Steps with their missing widgets left out; a widget closed then restored by undo comes back.
export const liveSteps = (
  seq: SequenceConnection,
  widgets: WidgetData[]
): ConnectionStep[] => {
  const ids = new Set(widgets.map((w) => w.id));
  return seq.steps
    .map((s) => ({
      ...s,
      actions: s.actions.filter((a) => ids.has(a.widgetId)),
    }))
    .filter((s) => s.actions.length > 0 || (s.waitSeconds ?? 0) > 0);
};

/** Distinct widgets a Connection still reaches on the board. */
export const connectionWidgetIds = (
  c: WidgetConnection,
  widgets: WidgetData[]
): string[] => {
  const ids = new Set(widgets.map((w) => w.id));
  const all =
    c.kind === 'follow'
      ? [c.leaderId, c.followerId]
      : c.steps.flatMap((s) => s.actions.map((a) => a.widgetId));
  return [...new Set(all)].filter((id) => ids.has(id));
};

/** A Connection that lost all but one of its widgets is treated as gone. */
export const isConnectionLive = (
  c: WidgetConnection,
  widgets: WidgetData[]
): boolean => connectionWidgetIds(c, widgets).length >= 2;

export const liveConnections = (
  connections: WidgetConnection[] | undefined,
  widgets: WidgetData[]
): WidgetConnection[] =>
  (connections ?? []).filter((c) => isConnectionLive(c, widgets));

export interface StepApplyResult {
  patches: WidgetPatches;
  /** A widget had nothing to do, so the Sequence stops before this step. */
  blocked: boolean;
  /** The Sequence stops after this step. */
  ends: boolean;
}

export const applyStep = (
  step: ConnectionStep,
  widgets: WidgetData[],
  now: number,
  skipWidgetId?: string
): StepApplyResult => {
  const map = byId(widgets);
  const patches: WidgetPatches = {};
  let ends = false;
  for (const a of step.actions) {
    if (a.widgetId === skipWidgetId) continue;
    const w = map.get(a.widgetId);
    if (!w) continue;
    const def = actionDefFor(w.type, a.action);
    if (!def) continue;
    const config = { ...(w.config as Config), ...(patches[w.id] ?? {}) };
    const result = def.apply(config, now);
    if (!result) return { patches: {}, blocked: true, ends: false };
    patches[w.id] = { ...(patches[w.id] ?? {}), ...result.patch };
    if (result.ends) ends = true;
  }
  return { patches, blocked: false, ends };
};

export const isStepFinished = (
  step: ConnectionStep,
  widgets: WidgetData[],
  stepStartedAt: number,
  now: number
): boolean => {
  if ((step.waitSeconds ?? 0) > 0 && step.actions.length === 0) {
    return now >= stepStartedAt + (step.waitSeconds ?? 0) * 1000;
  }
  const map = byId(widgets);
  return step.actions.every((a) => {
    const w = map.get(a.widgetId);
    if (!w) return true;
    const def = actionDefFor(w.type, a.action);
    return !def?.isFinished || def.isFinished(w.config as Config, now);
  });
};

export interface AdvanceResult {
  sequence: SequenceConnection;
  patches: WidgetPatches;
  /** Set when the Run ended on this advance. */
  finished: boolean;
}

// Moves a Run from its finished step to the next one, wrapping and stopping per `repeat`.
export const advanceRun = (
  seq: SequenceConnection,
  widgets: WidgetData[],
  now: number,
  deviceId: string
): AdvanceResult => {
  const run = seq.run;
  const steps = liveSteps(seq, widgets);
  const stop = (patches: WidgetPatches = {}): AdvanceResult => ({
    sequence: { ...seq, run: null },
    patches,
    finished: true,
  });
  if (!run || steps.length === 0) return stop();
  let next = run.stepIndex + 1;
  let loops = run.loops;
  if (next >= steps.length) {
    loops += 1;
    if (seq.repeat === 'once') return stop();
    if (seq.repeat === 'count' && loops >= Math.max(1, seq.repeatCount ?? 1)) {
      return stop();
    }
    next = 0;
  }
  const applied = applyStep(steps[next], widgets, now);
  if (applied.blocked) return stop();
  if (applied.ends) return stop(applied.patches);
  return {
    sequence: {
      ...seq,
      run: { deviceId, stepIndex: next, stepStartedAt: now, loops },
    },
    patches: applied.patches,
    finished: false,
  };
};

export interface JoinResult {
  sequence: SequenceConnection;
  patches: WidgetPatches;
}

// A hand action on a step's widget starts a Run there (or moves the Run to it); null when it isn't a step.
export const joinRunByHand = (
  seq: SequenceConnection,
  widgets: WidgetData[],
  widgetId: string,
  hand: ConnectionHandAction,
  now: number,
  deviceId: string
): JoinResult | null => {
  const widget = widgets.find((w) => w.id === widgetId);
  if (!widget) return null;
  const steps = liveSteps(seq, widgets);
  const matches = (s: ConnectionStep) =>
    s.actions.some(
      (a) =>
        a.widgetId === widgetId &&
        actionDefFor(widget.type, a.action)?.hand === hand
    );
  const current = seq.run?.stepIndex ?? -1;
  // Prefer the step after the current one, so a widget used twice moves forward.
  const order = steps.map((_, i) => (current + 1 + i) % steps.length);
  const index = order.find((i) => matches(steps[i]));
  if (index === undefined) return null;
  const applied = applyStep(steps[index], widgets, now, widgetId);
  return {
    sequence: {
      ...seq,
      run: {
        deviceId,
        stepIndex: index,
        stepStartedAt: now,
        loops: seq.run?.loops ?? 0,
      },
    },
    patches: applied.blocked ? {} : applied.patches,
  };
};

export interface PickedWidget {
  id: string;
  type: WidgetType;
}

export interface ConnectionDraft {
  sequence: SequenceConnection | null;
  follows: WidgetConnection[];
}

const followPair = (
  a: PickedWidget,
  b: PickedWidget
): { leaderId: string; followerId: string } | null => {
  if (connectionDefFor(b.type)?.follows?.includes(a.type)) {
    return { leaderId: a.id, followerId: b.id };
  }
  if (connectionDefFor(a.type)?.follows?.includes(b.type)) {
    return { leaderId: b.id, followerId: a.id };
  }
  return null;
};

// Turns Connect-mode picks into a Sequence plus Follows; picking the first widget again makes it repeat.
export const draftFromPicks = (
  picks: PickedWidget[],
  { minSteps = 2 }: { minSteps?: number } = {}
): ConnectionDraft => {
  const closesLoop =
    picks.length > 2 && picks[picks.length - 1].id === picks[0].id;
  const ordered = closesLoop ? picks.slice(0, -1) : picks;
  const follows: WidgetConnection[] = [];
  const followerIds = new Set<string>();
  for (let i = 1; i < picks.length; i++) {
    const pair = followPair(picks[i - 1], picks[i]);
    if (pair && !followerIds.has(pair.followerId)) {
      followerIds.add(pair.followerId);
      follows.push({ id: newId(), kind: 'follow', ...pair });
    }
  }
  const steps: ConnectionStep[] = ordered
    .filter((p) => !followerIds.has(p.id))
    .flatMap((p) => {
      const def = connectionDefFor(p.type);
      if (!def?.defaultAction) return [];
      return [
        {
          id: newId(),
          actions: [{ widgetId: p.id, action: def.defaultAction }],
        },
      ];
    });
  const sequence: SequenceConnection | null =
    steps.length >= minSteps
      ? {
          id: newId(),
          kind: 'sequence',
          steps,
          repeat: closesLoop ? 'until-done' : 'once',
        }
      : null;
  return { sequence, follows };
};

/** The widget `followerId` Follows on this board, if any. */
export const followLeaderId = (
  connections: WidgetConnection[] | undefined,
  widgets: WidgetData[],
  followerId: string
): string | undefined => {
  for (const c of liveConnections(connections, widgets)) {
    if (c.kind === 'follow' && c.followerId === followerId) return c.leaderId;
  }
  return undefined;
};

/** Widgets that Follow `leaderId` on this board. */
export const followerIds = (
  connections: WidgetConnection[] | undefined,
  widgets: WidgetData[],
  leaderId: string
): string[] =>
  liveConnections(connections, widgets).flatMap((c) =>
    c.kind === 'follow' && c.leaderId === leaderId ? [c.followerId] : []
  );
