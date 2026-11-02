// What each widget can do inside a Connection (docs/adr/0002). A widget type absent here can't be connected.
import type { RandomConfig, TimeToolConfig, WidgetType } from '@/types';
import {
  clockStateOf,
  secondsAt,
  timeToolClockPatch,
} from '@/utils/timeToolClock';
import { currentShuffleName } from '@/utils/randomCurrentName';
import { VOLUME_OPTIONS } from '@/config/expectationsData';

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
  apply: (config: Config, now: number) => ConnectionActionResult | null;
  /** Present when the step waits for this widget: true once it has finished. */
  isFinished?: (config: Config, now: number) => boolean;
  /** The hand action, reported by the widget, that counts as doing this step. */
  hand?: ConnectionHandAction;
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
  ...(waits && { isFinished: timerFinished }),
  ...(event === 'restart' || event === 'start' ? { hand: 'start' } : {}),
});

const randomNext: ConnectionActionDef = {
  id: 'next',
  label: 'Next name',
  hand: 'next',
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

export const WIDGET_CONNECTIONS: Partial<
  Record<WidgetType, WidgetConnectionDef>
> = {
  'time-tool': {
    defaultAction: 'restart',
    actions: [
      timerAction('restart', 'Start from the top', 'restart', true),
      timerAction('start', 'Start or resume', 'start', true),
      timerAction('pause', 'Pause', 'pause', false),
      timerAction('reset', 'Reset', 'reset', false),
    ],
  },
  random: { defaultAction: 'next', actions: [randomNext] },
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
      setField(`voice-${o.id}`, `Voice: ${o.label}`, { voiceLevel: o.id })
    ),
  },
  nextUp: {
    defaultAction: 'next',
    actions: [bump('next', 'Next student', 'externalTrigger', 'next')],
  },
  stations: {
    defaultAction: 'rotate',
    actions: [bump('rotate', 'Rotate stations', 'rotationTrigger', 'next')],
  },
  sound: { defaultAction: '', actions: [], follows: ['expectations'] },
  qr: { defaultAction: '', actions: [], follows: ['text'] },
  recessGear: { defaultAction: '', actions: [], follows: ['weather'] },
  text: { defaultAction: '', actions: [] },
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
