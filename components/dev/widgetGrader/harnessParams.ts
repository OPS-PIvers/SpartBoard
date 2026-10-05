import type { WidgetType } from '@/types';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import { FIXTURE_NAMES, type FixtureName } from './fixtures/types';

export const HARNESS_STATES = [
  'loading',
  'error',
  'offline',
  'noRoster',
] as const;
export type HarnessState = (typeof HARNESS_STATES)[number];

export const HARNESS_STYLES = ['alt'] as const;
export type HarnessStyle = (typeof HARNESS_STYLES)[number];

export interface HarnessParams {
  type: WidgetType;
  w: number;
  h: number;
  fixture: FixtureName;
  maximized: boolean;
  count: 1 | 2;
  state: HarnessState | null;
  selected: boolean;
  settingsOpen: boolean;
  /** `alt` swaps in a non-default global style for the V5 theming check. */
  style: HarnessStyle | null;
}

export type HarnessParamsResult =
  | { ok: true; params: HarnessParams }
  | { ok: false; error: string };

const isWidgetType = (value: string): value is WidgetType =>
  value in WIDGET_DEFAULTS;

const readSize = (raw: string | null, fallback: number): number => {
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
};

export function parseHarnessParams(search: string): HarnessParamsResult {
  const q = new URLSearchParams(search);
  const type = q.get('type') ?? '';
  if (!isWidgetType(type))
    return { ok: false, error: `Unknown widget type "${type}"` };
  const fixture = q.get('fixture') ?? 'typical';
  if (!(FIXTURE_NAMES as readonly string[]).includes(fixture)) {
    return { ok: false, error: `Unknown fixture "${fixture}"` };
  }
  const state = q.get('state');
  if (
    state !== null &&
    !(HARNESS_STATES as readonly string[]).includes(state)
  ) {
    return { ok: false, error: `Unknown state "${state}"` };
  }
  const style = q.get('style');
  if (
    style !== null &&
    !(HARNESS_STYLES as readonly string[]).includes(style)
  ) {
    return { ok: false, error: `Unknown style "${style}"` };
  }
  const defaults = WIDGET_DEFAULTS[type];
  return {
    ok: true,
    params: {
      type,
      w: readSize(q.get('w'), defaults.w ?? 300),
      h: readSize(q.get('h'), defaults.h ?? 300),
      fixture: fixture as FixtureName,
      maximized: q.get('maximized') === '1',
      count: q.get('count') === '2' ? 2 : 1,
      state: state as HarnessState | null,
      selected: q.get('selected') === '1',
      settingsOpen: q.get('settings') === 'open',
      style: style as HarnessStyle | null,
    },
  };
}
