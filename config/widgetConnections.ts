// What each widget can do inside a Connection (docs/adr/0002). A widget type absent here can't be connected.
import type {
  ChecklistConfig,
  RandomConfig,
  ScheduleConfig,
  TimeToolConfig,
  WidgetType,
} from '@/types';
import {
  clockStateOf,
  secondsAt,
  timeToolClockPatch,
} from '@/utils/timeToolClock';
import { currentShuffleName } from '@/utils/randomCurrentName';
import { VOLUME_OPTIONS } from '@/config/expectationsData';
import { checkOffCurrent } from '@/utils/checklistCurrent';
import {
  computeEffectiveTimes,
  resolveActiveSchedule,
} from '@/components/widgets/Schedule/utils';

type Config = Record<string, unknown>;

export interface ConnectionActionResult {
  patch: Config;
  /** The Sequence stops after this step (e.g. the last name was crossed off). */
  ends?: boolean;
}

export interface ConnectionActionDef {
  id: string;
  label: string;
  /** The change to make, or null when the widget has nothing to do (the Sequence stops). */
  apply: (
    config: Config,
    now: number,
    params?: Record<string, unknown>
  ) => ConnectionActionResult | null;
  /** Present when the step waits for this widget: true once it has finished. */
  isFinished?: (config: Config, now: number, stepStartedAt: number) => boolean;
  /** The step's own choice, prefilled from the widget when it's picked. */
  defaultParams?: (config: Config) => Record<string, unknown>;
  /** The hand action, reported by the widget, that counts as doing this step. */
  hand?: ConnectionHandAction;
  /** What the next step waits for, worded in the editor ("When Timer ends"). */
  waitsFor?: 'end' | 'next-block';
  /** What runs out to end a looping Sequence ("until every name is used"), if anything. */
  runsOut?: (config: Config) => 'names' | 'items' | undefined;
}

export type ConnectionHandAction = 'start' | 'next';

export interface WidgetConnectionDef {
  actions: ConnectionActionDef[];
  defaultAction: string;
  /** Widget types this one can Follow (it keeps matching the leader). */
  follows?: WidgetType[];
}

const asTimer = (c: Config) => c as unknown as TimeToolConfig;

const timerFinished = (c: Config, now: number): boolean => {
  const t = asTimer(c);
  if (t.mode !== 'timer') return true;
  const phase = clockStateOf(t).phase;
  if (phase === 'expired') return true;
  return phase === 'running' && secondsAt(t, now) <= 0;
};

const timerAction = (
  id: string,
  label: string,
  event: 'restart' | 'start' | 'pause' | 'reset',
  waits: boolean
): ConnectionActionDef => ({
  id,
  label,
  apply: (c, now) => {
    const t = asTimer(c);
    const patch =
      event === 'start' && clockStateOf(t).phase === 'expired'
        ? timeToolClockPatch(t, { type: 'restart', now })
        : event === 'reset'
          ? timeToolClockPatch(t, { type: 'reset' })
          : timeToolClockPatch(t, { type: event, now });
    return { patch: patch ?? {} };
  },
  ...(waits && { isFinished: timerFinished, waitsFor: 'end' as const }),
  ...(event === 'restart' || event === 'start' ? { hand: 'start' } : {}),
});

const randomNext: ConnectionActionDef = {
  id: 'next',
  label: 'Pick next name',
  hand: 'next',
  runsOut: (c) => (c.mode === 'shuffle' ? 'names' : undefined),
  apply: (c, now) => {
    const r = c as unknown as RandomConfig;
    if (r.mode !== 'shuffle') return { patch: { externalTrigger: now } };
    const current = currentShuffleName(r);
    if (!current) return null;
    const doneNames = [...(r.doneNames ?? []), current];
    const after = { ...r, doneNames };
    return { patch: { doneNames }, ends: !currentShuffleName(after) };
  },
};

const setField = (
  id: string,
  label: string,
  patch: Config
): ConnectionActionDef => ({ id, label, apply: () => ({ patch }) });

const bump = (
  id: string,
  label: string,
  field: string,
  hand?: ConnectionHandAction
): ConnectionActionDef => ({
  id,
  label,
  ...(hand && { hand }),
  apply: (_c, now) => ({ patch: { [field]: now } }),
});

const checklistNext: ConnectionActionDef = {
  id: 'next',
  label: 'Check next item',
  hand: 'next',
  runsOut: () => 'items',
  apply: (c) => {
    const result = checkOffCurrent(c as unknown as ChecklistConfig);
    return result ? { patch: result.patch, ends: result.ends } : null;
  },
};

const secondsOfDay = (t: number) => {
  const d = new Date(t);
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
};

// Done once a block that starts after the step began has started; a new day counts as done.
const nextBlockStarted = (c: Config, now: number, startedAt: number) => {
  if (new Date(now).toDateString() !== new Date(startedAt).toDateString()) {
    return true;
  }
  const sc = c as unknown as ScheduleConfig;
  const active = resolveActiveSchedule(
    sc.schedules ?? [],
    sc.items ?? [],
    new Date(now).getDay()
  );
  if (!active) return false;
  const from = secondsOfDay(startedAt);
  const d = new Date(now);
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Same rows the widget shows: a one-off block only counts on its own day.
  const items = active.schedule.items.filter(
    (i) => !i.oneOffDate || i.oneOffDate === today
  );
  const starts = computeEffectiveTimes(items)
    .filter((t) => !t.isIdle && t.startSec > from)
    .map((t) => t.startSec);
  if (starts.length === 0) return false;
  return secondsOfDay(now) >= Math.min(...starts);
};

export const WIDGET_CONNECTIONS: Partial<
  Record<WidgetType, WidgetConnectionDef>
> = {
  'time-tool': {
    defaultAction: 'restart',
    actions: [
      timerAction('restart', 'Start', 'restart', true),
      timerAction('start', 'Resume', 'start', true),
      timerAction('pause', 'Pause', 'pause', false),
      timerAction('reset', 'Reset', 'reset', false),
    ],
  },
  random: {
    defaultAction: 'next',
    actions: [randomNext],
    follows: ['stations'],
  },
  music: { defaultAction: '', actions: [], follows: ['time-tool'] },
  traffic: {
    defaultAction: 'red',
    actions: [
      setField('red', 'Turn red', { active: 'red' }),
      setField('yellow', 'Turn yellow', { active: 'yellow' }),
      setField('green', 'Turn green', { active: 'green' }),
      setField('off', 'Turn off', { active: 'none' }),
    ],
    follows: ['sound'],
  },
  expectations: {
    defaultAction: 'voice-0',
    actions: VOLUME_OPTIONS.map((o) =>
      setField(`voice-${o.id}`, o.label, {
        voiceLevel: o.id,
      })
    ),
  },
  nextUp: {
    defaultAction: 'next',
    actions: [bump('next', 'Next student', 'externalTrigger', 'next')],
  },
  stations: {
    defaultAction: 'rotate',
    actions: [bump('rotate', 'Rotate', 'rotationTrigger', 'next')],
  },
  sound: { defaultAction: '', actions: [], follows: ['expectations'] },
  qr: {
    defaultAction: '',
    actions: [],
    follows: ['text', 'activity-wall', 'miniApp'],
  },
  recessGear: { defaultAction: '', actions: [], follows: ['weather'] },
  checklist: { defaultAction: 'next', actions: [checklistNext] },
  schedule: {
    defaultAction: 'next-block',
    actions: [
      {
        id: 'next-block',
        label: 'Wait for next block',
        apply: () => ({ patch: {} }),
        isFinished: nextBlockStarted,
        waitsFor: 'next-block',
      },
    ],
  },
  'work-symbols': {
    defaultAction: 'show',
    actions: [
      {
        id: 'show',
        label: 'Show',
        apply: (_c, _now, params) =>
          typeof params?.symbolId === 'string'
            ? { patch: { selectedSymbolId: params.symbolId } }
            : { patch: {} },
        defaultParams: (c) => ({ symbolId: c.selectedSymbolId ?? null }),
      },
    ],
  },
  materials: {
    defaultAction: 'show',
    actions: [
      {
        id: 'show',
        label: 'Show',
        apply: (c, _now, params) => {
          // Only materials the widget still offers, so a removed one can't come back.
          const offered = new Set(
            Array.isArray(c.selectedItems) ? (c.selectedItems as unknown[]) : []
          );
          const items = Array.isArray(params?.items) ? params.items : [];
          return {
            patch: { activeItems: items.filter((id) => offered.has(id)) },
          };
        },
        defaultParams: (c) => ({
          items: Array.isArray(c.activeItems) ? c.activeItems : [],
        }),
      },
    ],
  },
  scoreboard: { defaultAction: '', actions: [], follows: ['random'] },
  text: { defaultAction: '', actions: [] },
  'activity-wall': { defaultAction: '', actions: [] },
  miniApp: { defaultAction: '', actions: [] },
  weather: { defaultAction: '', actions: [] },
};

export const connectionDefFor = (
  type: WidgetType
): WidgetConnectionDef | undefined => WIDGET_CONNECTIONS[type];

export const isConnectable = (type: WidgetType): boolean =>
  !!WIDGET_CONNECTIONS[type];

export const actionDefFor = (
  type: WidgetType,
  actionId: string
): ConnectionActionDef | undefined =>
  WIDGET_CONNECTIONS[type]?.actions.find((a) => a.id === actionId);
