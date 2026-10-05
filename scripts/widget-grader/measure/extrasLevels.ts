// Turns the S7 raw observations (extras.ts) into Measurement[] with the level each one implies.

import type { CriterionId, Level, Measurement } from '../types';
import type { Values } from './analyze';
import type {
  ClutterProxies,
  FaceState,
  TabStop,
  Theming,
} from './extrasCollect';

export interface AxeViolation {
  id: string;
  nodes: number;
}

export interface ExtrasRaw {
  controls: number;
  clutter: ClutterProxies;
  hoverOnly: string[];
  doubleClick: number;
  keyboard: {
    unreachable: string[];
    stops: TabStop[];
    axe: AxeViolation[] | null;
  };
  motion: {
    normal: { running: number; infinite: number };
    reduced: { running: number; infinite: number };
  };
  theming: Theming;
  settings: {
    hasPanel: boolean;
    /** Share of the card the open settings panel covers. */
    panelOverlap: number;
    tried: { label: string; kind: string; changed: boolean }[];
  };
  states: Record<string, FaceState>;
  destructive: { label: string; confirmed: boolean; changed: boolean }[];
  perf: {
    idleCommits: number;
    dragCommits: number | null;
    resizeCommits: number | null;
    fastIntervals: number[];
    /** The face changed on its own over the timer window. */
    animates: boolean;
    chunkBytes: number | null;
  };
  multi: {
    rendered: boolean;
    errors: number;
    secondChanged: boolean | null;
  };
}

// axe rules that mean a control has no accessible name.
export const UNNAMED_RULES = new Set([
  'button-name',
  'link-name',
  'label',
  'select-name',
  'input-button-name',
  'aria-command-name',
  'aria-input-field-name',
  'aria-toggle-field-name',
]);

// Raw error text that should never reach a teacher.
export const RAW_ERROR =
  /\b(TypeError|ReferenceError|FirebaseError|permission-denied|undefined|NaN)\b|\[object Object\]|^Error\b/;

// Commits allowed after a resize ends before the face counts as settled.
const RESIZE_SETTLE_COMMITS = 2;
const OPAQUE_LIMIT = 0.5;
const FONT_MATCH_MIN = 0.8;
// A tab stop more than this far above the previous one, and not to its right, is an inversion.
const ROW_JUMP_PX = 40;

interface Implied {
  level: Level | null;
  values: Values;
}

const list = (items: string[]): string => items.slice(0, 8).join('; ');

export function tabInversions(stops: TabStop[]): number {
  let n = 0;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (b.y < a.y - ROW_JUMP_PX && b.x <= a.x) n++;
  }
  return n;
}

const i3 = (r: ExtrasRaw): Implied => {
  if (r.controls === 0) return { level: null, values: { applicable: false } };
  return {
    level: r.hoverOnly.length === 0 && r.doubleClick === 0 ? 3 : null,
    values: {
      applicable: true,
      hoverOnly: r.hoverOnly.length,
      hoverOnlyControls: list(r.hoverOnly),
      doubleClickHandlers: r.doubleClick,
    },
  };
};

const i4 = (r: ExtrasRaw): Implied => {
  if (r.controls === 0) return { level: null, values: { applicable: false } };
  const axe = r.keyboard.axe ?? [];
  const unnamed = axe.filter((v) => UNNAMED_RULES.has(v.id));
  const other = axe.filter((v) => !UNNAMED_RULES.has(v.id));
  const invisible = r.keyboard.stops.filter((s) => !s.visibleFocus);
  const inversions = tabInversions(r.keyboard.stops);
  let level: Level;
  if (
    r.keyboard.unreachable.length > 0 ||
    unnamed.length > 0 ||
    r.keyboard.stops.length === 0
  )
    level = 1;
  else if (other.length > 0 || invisible.length > 0 || inversions > 0)
    level = 2;
  else level = 3;
  return {
    level: r.keyboard.axe === null ? null : level,
    values: {
      applicable: true,
      tabStops: r.keyboard.stops.length,
      unreachable: r.keyboard.unreachable.length,
      unreachableControls: list(r.keyboard.unreachable),
      axeRun: r.keyboard.axe !== null,
      axeViolations: list(axe.map((v) => `${v.id} x${v.nodes}`)),
      unnamed: unnamed.reduce((n, v) => n + v.nodes, 0),
      focusInvisible: invisible.length,
      focusInvisibleStops: list(invisible.map((s) => s.path)),
      tabOrderInversions: inversions,
    },
  };
};

const i5 = (r: ExtrasRaw): Implied => {
  if (r.motion.normal.running === 0)
    return { level: null, values: { applicable: false } };
  return {
    level: r.motion.reduced.infinite > 0 ? 1 : 3,
    values: {
      applicable: true,
      running: r.motion.normal.running,
      looping: r.motion.normal.infinite,
      runningReduced: r.motion.reduced.running,
      loopingReduced: r.motion.reduced.infinite,
    },
  };
};

// Thresholds come from the first full sweep (plan open items), so V2 only records counts.
const v2 = (r: ExtrasRaw): Implied => ({
  level: null,
  values: { ...r.clutter },
});

const v5 = (r: ExtrasRaw): Implied => {
  const t = r.theming;
  const misses = [
    t.opaqueFraction > OPAQUE_LIMIT,
    t.textElements > 0 && t.fontMatch < FONT_MATCH_MIN,
    t.radiusMismatches > 0,
  ].filter(Boolean).length;
  const level: Level = misses === 0 ? 3 : misses === 3 ? 1 : 2;
  return {
    level,
    values: {
      opaqueFraction: Math.round(t.opaqueFraction * 100) / 100,
      fontMatch: Math.round(t.fontMatch * 100) / 100,
      textElements: t.textElements,
      radiusMismatches: t.radiusMismatches,
    },
  };
};

const settingsValues = (r: ExtrasRaw): Values => {
  const dead = r.settings.tried.filter((t) => !t.changed);
  return {
    applicable: true,
    tried: r.settings.tried.length,
    changedFace: r.settings.tried.length - dead.length,
    noVisibleChange: list(dead.map((t) => `${t.kind} "${t.label}"`)),
    panelOverlap: Math.round(r.settings.panelOverlap * 100) / 100,
  };
};

const c4 = (r: ExtrasRaw): Implied => {
  if (!r.settings.hasPanel)
    return { level: null, values: { applicable: false } };
  const tried = r.settings.tried;
  const dead = tried.filter((t) => !t.changed);
  // A setting with no visible effect may still change behavior, so only the judge can give 0.
  return {
    level: tried.length > 0 && dead.length === 0 ? 3 : null,
    values: settingsValues(r),
  };
};

const c6 = (r: ExtrasRaw): Implied => {
  if (!r.settings.hasPanel)
    return { level: null, values: { applicable: false } };
  const tried = r.settings.tried;
  const allChanged = tried.length > 0 && tried.every((t) => t.changed);
  return {
    level: allChanged ? (r.settings.panelOverlap === 0 ? 4 : 3) : null,
    values: settingsValues(r),
  };
};

const r1 = (r: ExtrasRaw): Implied => {
  const bad: string[] = [];
  for (const [state, f] of Object.entries(r.states)) {
    if (!f.text && f.controls === 0 && f.media === 0 && !f.spinner)
      bad.push(`${state}: blank`);
    else if (RAW_ERROR.test(f.text)) bad.push(`${state}: raw error text`);
    else if (state !== 'loading' && f.spinner)
      bad.push(`${state}: endless spinner`);
  }
  return {
    level: bad.length ? 1 : null,
    values: {
      states: Object.keys(r.states).join(', '),
      problems: list(bad),
    },
  };
};

const r2 = (r: ExtrasRaw, g4Pass: boolean | null): Implied => {
  if (g4Pass === false)
    return { level: 0, values: { destructive: r.destructive.length } };
  if (r.destructive.length === 0)
    return { level: null, values: { destructive: 0 } };
  const instant = r.destructive.filter((d) => d.changed && !d.confirmed);
  return {
    level: instant.length ? 1 : g4Pass ? 3 : null,
    values: {
      destructive: r.destructive.length,
      instant: list(instant.map((d) => d.label)),
      confirmed: r.destructive.filter((d) => d.confirmed).length,
    },
  };
};

const r3 = (r: ExtrasRaw): Implied => {
  const p = r.perf;
  const budgets: [string, boolean | null][] = [
    ['neighborDrag', p.dragCommits === null ? null : p.dragCommits > 0],
    ['timers', p.fastIntervals.length > 0 && !p.animates],
    [
      'resize',
      p.resizeCommits === null ? null : p.resizeCommits > RESIZE_SETTLE_COMMITS,
    ],
  ];
  const measured = budgets.filter(([, miss]) => miss !== null);
  const missed = measured.filter(([, miss]) => miss).map(([name]) => name);
  // Listener counts and the chunk budget aren't scored until the first sweep sets the budgets.
  let level: Level | null = null;
  if (measured.length >= 2)
    level = missed.length >= 2 ? 1 : missed.length === 1 ? 2 : 3;
  return {
    level,
    values: {
      missed: missed.join(', '),
      idleCommits: p.idleCommits,
      neighborDragCommits: p.dragCommits ?? -1,
      resizeSettleCommits: p.resizeCommits ?? -1,
      fastIntervalsMs: p.fastIntervals.join(','),
      animates: p.animates,
      chunkBytes: p.chunkBytes ?? -1,
      listeners: 'not measured',
    },
  };
};

const r5 = (r: ExtrasRaw): Implied => {
  const m = r.multi;
  const broken = !m.rendered || m.errors > 0 || m.secondChanged === true;
  return {
    level: broken ? 1 : null,
    values: {
      secondRendered: m.rendered,
      errors: m.errors,
      secondChangedWithFirst: m.secondChanged ?? 'not checked',
    },
  };
};

export const EXTRA_CRITERIA: CriterionId[] = [
  'I3',
  'I4',
  'I5',
  'V2',
  'V5',
  'C4',
  'C6',
  'R1',
  'R2',
  'R3',
  'R5',
];

export function summarizeExtras(
  widgetType: string,
  raw: ExtrasRaw,
  g4Pass: boolean | null,
  partial?: string
): Measurement[] {
  const implied: [CriterionId, Implied][] = [
    ['I3', i3(raw)],
    ['I4', i4(raw)],
    ['I5', i5(raw)],
    ['V2', v2(raw)],
    ['V5', v5(raw)],
    ['C4', c4(raw)],
    ['C6', c6(raw)],
    ['R1', r1(raw)],
    ['R2', r2(raw, g4Pass)],
    ['R3', r3(raw)],
    ['R5', r5(raw)],
  ];
  return implied.map(([criterionId, { level, values }]) => ({
    widgetType,
    criterionId,
    size: null,
    fixture: null,
    values: { ...values, ...(partial ? { partial } : {}) },
    impliedLevel: level,
  }));
}
