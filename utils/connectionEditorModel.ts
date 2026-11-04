import type {
  ConnectionStep,
  SequenceConnection,
  TimeToolConfig,
  WidgetData,
} from '@/types';
import { actionDefFor, connectionDefFor } from '@/config/widgetConnections';
import { getTitle } from '@/utils/widgetHelpers';
import { TOOLS } from '@/config/tools';

/** A widget's name in connection UI: the teacher's title, else the admin name, else the Dock label. */
export const connectionWidgetTitle = (
  w: WidgetData,
  adminName?: string
): string => {
  if (w.customTitle) return w.customTitle;
  const title = getTitle(w);
  const admin = adminName?.trim();
  if (admin) {
    // Keep a config-derived name (a quiz or guide title) so two such widgets stay apart.
    const generic = getTitle({ ...w, config: {} });
    if (title === generic) return admin;
    return title.startsWith(`${generic}: `)
      ? `${admin}${title.slice(generic.length)}`
      : title;
  }
  const raw = w.type.charAt(0).toUpperCase() + w.type.slice(1);
  if (title !== raw) return title;
  return TOOLS.find((tool) => tool.type === w.type)?.label ?? title;
};

/** One numbered card in the editor: a step, plus the pause its arrow adds after it. */
export interface EditorCard {
  step: ConnectionStep;
  pauseSeconds?: number;
}

export type AdvanceChoice = 'finish' | 'now' | 'next' | 'pause';

export const DEFAULT_PAUSE_SECONDS = 10;

const isPause = (s: ConnectionStep) =>
  s.actions.length === 0 && (s.waitSeconds ?? 0) > 0;

export interface EditorCards {
  cards: EditorCard[];
  /** A wait before step 1, kept from older Sequences; the editor has no arrow for it. */
  leadingPause: ConnectionStep[];
}

/** Saved steps as cards; a pause step becomes the arrow setting of the card before it. */
export const toCards = (steps: ConnectionStep[]): EditorCards => {
  const cards: EditorCard[] = [];
  const leadingPause: ConnectionStep[] = [];
  for (const s of steps) {
    const last = cards[cards.length - 1];
    if (isPause(s)) {
      if (last) {
        last.pauseSeconds = (last.pauseSeconds ?? 0) + (s.waitSeconds ?? 0);
      } else {
        leadingPause.push(s);
      }
      continue;
    }
    cards.push({ step: s });
  }
  return { cards, leadingPause };
};

/** Cards back to saved steps, a pause step after each card whose arrow waits a few seconds. */
export const fromCards = (
  { cards, leadingPause }: EditorCards,
  newId: () => string
): ConnectionStep[] => [
  ...leadingPause,
  ...cards.flatMap(({ step, pauseSeconds }) =>
    pauseSeconds
      ? [step, { id: newId(), actions: [], waitSeconds: pauseSeconds }]
      : [step]
  ),
];

export type StepWait =
  { kind: 'ends'; widgetIds: string[] } | { kind: 'next-block' } | null;

/** What a step waits for on its own (a timer ending, the next block), or null when it's instant. */
export const stepWait = (
  step: ConnectionStep,
  widgets: WidgetData[]
): StepWait => {
  const types = new Map(widgets.map((w) => [w.id, w.type]));
  const waits = step.actions.flatMap((a) => {
    const type = types.get(a.widgetId);
    const waitsFor = type && actionDefFor(type, a.action)?.waitsFor;
    return waitsFor ? [{ id: a.widgetId, waitsFor }] : [];
  });
  if (waits.some((w) => w.waitsFor === 'next-block')) {
    return { kind: 'next-block' };
  }
  return waits.length > 0
    ? { kind: 'ends', widgetIds: waits.map((w) => w.id) }
    : null;
};

export const advanceChoice = (card: EditorCard): AdvanceChoice =>
  card.pauseSeconds ? 'pause' : (card.step.advance ?? 'finish');

export const withAdvance = (
  card: EditorCard,
  choice: AdvanceChoice
): EditorCard => {
  const step: ConnectionStep = { ...card.step };
  delete step.advance;
  if (choice === 'now' || choice === 'next') {
    return { step: { ...step, advance: choice } };
  }
  if (choice === 'pause') {
    return {
      step,
      pauseSeconds: card.pauseSeconds ?? DEFAULT_PAUSE_SECONDS,
    };
  }
  return { step };
};

/** What runs out to end a loop ("names", "items"), or null when only Stop ends it. */
export const loopRunsOut = (
  seq: Pick<SequenceConnection, 'steps'>,
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

const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Names a teacher can tell apart: Timers by their set time, others by title, numbered on a clash. */
export const widgetNames = (
  widgets: WidgetData[],
  timerName: (time: string, name: string) => string,
  titleOf: (w: WidgetData) => string = (w) => connectionWidgetTitle(w)
): Map<string, string> => {
  const base = (w: WidgetData) =>
    w.type === 'time-tool' &&
    (w.config as TimeToolConfig).mode === 'timer' &&
    typeof (w.config as TimeToolConfig).duration === 'number'
      ? timerName(
          clock((w.config as TimeToolConfig).duration),
          titleOf({ ...w, customTitle: undefined })
        )
      : titleOf(w);
  const counts = new Map<string, number>();
  for (const w of widgets) counts.set(base(w), (counts.get(base(w)) ?? 0) + 1);
  const seen = new Map<string, number>();
  const names = new Map<string, string>();
  for (const w of widgets) {
    const b = base(w);
    const n = (seen.get(b) ?? 0) + 1;
    seen.set(b, n);
    names.set(w.id, (counts.get(b) ?? 0) > 1 ? `${b} (${n})` : b);
  }
  return names;
};

/** How a widget joins a step from its "+" button: plays along with the step's widget, or acts at the same moment. */
export const sideJoinKind = (
  widget: WidgetData,
  mainType: WidgetData['type'] | undefined
): 'follow' | 'action' | null => {
  const def = connectionDefFor(widget.type);
  if (!def) return null;
  // Beside a step widget, a widget with its own step (Randomizer by Stations) joins as a step.
  const mainIsStep = !!(mainType && connectionDefFor(mainType)?.defaultAction);
  if (
    mainType &&
    def.follows?.includes(mainType) &&
    !(def.defaultAction && mainIsStep)
  ) {
    return 'follow';
  }
  return def.actions.length > 0 ? 'action' : null;
};
