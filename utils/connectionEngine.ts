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
  now: number
): StepApplyResult => {
  const map = byId(widgets);
  const patches: WidgetPatches = {};
  let ends = false;
  for (const a of step.actions) {
    const w = map.get(a.widgetId);
    if (!w) continue;
    const def = actionDefFor(w.type, a.action);
    if (!def) continue;
    const config = { ...(w.config as Config), ...(patches[w.id] ?? {}) };
    const result = def.apply(config, now, a.params);
    if (!result) return { patches: {}, blocked: true, ends: false };
    patches[w.id] = { ...(patches[w.id] ?? {}), ...result.patch };
    // Once a list runs out, the rest of the step doesn't happen.
    if (result.ends) {
      ends = true;
      break;
    }
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
  if (step.advance === 'now') return true;
  if (step.advance === 'next') return false;
  const map = byId(widgets);
  return step.actions.every((a) => {
    const w = map.get(a.widgetId);
    if (!w) return true;
    const def = actionDefFor(w.type, a.action);
    return (
      !def?.isFinished || def.isFinished(w.config as Config, now, stepStartedAt)
    );
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
  // The press counts as everything in the step up to it; only what comes after still happens.
  const pressedAt = steps[index].actions.findIndex(
    (a) => a.widgetId === widgetId
  );
  const rest = {
    ...steps[index],
    actions: steps[index].actions.slice(pressedAt + 1),
  };
  const applied = applyStep(rest, widgets, now);
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

// Starts a Run at step 1 from the step badge, applying that step; null when it has nothing to do.
export const startRun = (
  seq: SequenceConnection,
  widgets: WidgetData[],
  now: number,
  deviceId: string
): (JoinResult & { finished: boolean }) | null => {
  const steps = liveSteps(seq, widgets);
  if (steps.length === 0) return null;
  const applied = applyStep(steps[0], widgets, now);
  if (applied.blocked) return null;
  // Step 1 can already be the last thing to do, e.g. the Checklist's last item.
  if (applied.ends) {
    return {
      sequence: { ...seq, run: null },
      patches: applied.patches,
      finished: true,
    };
  }
  return {
    finished: false,
    sequence: {
      ...seq,
      run: { deviceId, stepIndex: 0, stepStartedAt: now, loops: 0 },
    },
    patches: applied.patches,
  };
};

export interface PickedWidget {
  id: string;
  type: WidgetType;
  /** Fills the step's own choice from the widget, e.g. the Work Symbol it shows now. */
  config?: Record<string, unknown>;
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
// A list that can run out (names, checklist items) makes a draft loop until it does.
const canRunOut = (steps: ConnectionStep[], picks: PickedWidget[]) => {
  const byId = new Map(picks.map((p) => [p.id, p]));
  return steps.some((s) =>
    s.actions.some((a) => {
      const p = byId.get(a.widgetId);
      return !!p && !!actionDefFor(p.type, a.action)?.runsOut?.(p.config ?? {});
    })
  );
};

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
      const params = def.actions
        .find((a) => a.id === def.defaultAction)
        ?.defaultParams?.(p.config ?? {});
      return [
        {
          id: newId(),
          actions: [
            {
              widgetId: p.id,
              action: def.defaultAction,
              ...(params && { params }),
            },
          ],
        },
      ];
    });
  const sequence: SequenceConnection | null =
    steps.length >= minSteps
      ? {
          id: newId(),
          kind: 'sequence',
          steps,
          repeat: closesLoop || canRunOut(steps, picks) ? 'until-done' : 'once',
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
