import {
  DEFAULT_GRADEBOOK_CATEGORIES,
  DEFAULT_GRADEBOOK_SETTINGS,
  type GradebookCategory,
  type GradebookConfigRef,
  type GradebookFlagDef,
  type GradebookSettingsBody,
} from './gradebookCore';
import { FLAG_COLOR_PALETTE } from './flagColors';

export type GradebookConfigSource = 'builtin' | 'personal' | 'plc' | 'district';

/** One configuration as the settings modal lists it (D16). */
export interface GradebookConfigEntry {
  /** `builtin`, or `{source}:{id}`; also the select option value. */
  key: string;
  ref: GradebookConfigRef | null;
  source: GradebookConfigSource;
  name: string;
  body: GradebookSettingsBody;
  readOnly: boolean;
  /** District configuration marked as its buildings' default. */
  isDefault?: boolean;
}

export interface GradebookClassOption {
  id: string;
  name: string;
}

export const BUILTIN_CONFIG_KEY = 'builtin';

export function configRefKey(ref: GradebookConfigRef | null): string {
  if (!ref) return BUILTIN_CONFIG_KEY;
  return ref.source === 'plc'
    ? `plc:${ref.plcId}`
    : `${ref.source}:${ref.configId}`;
}

export function cloneSettingsBody(
  body: GradebookSettingsBody
): GradebookSettingsBody {
  return JSON.parse(JSON.stringify(body)) as GradebookSettingsBody;
}

export function defaultSettingsBody(name: string): GradebookSettingsBody {
  return { ...cloneSettingsBody(DEFAULT_GRADEBOOK_SETTINGS), name };
}

export const BUILTIN_CONFIG_ENTRY: GradebookConfigEntry = {
  key: BUILTIN_CONFIG_KEY,
  ref: null,
  source: 'builtin',
  name: 'Default settings',
  body: defaultSettingsBody('Default settings'),
  readOnly: true,
};

/**
 * D16: a class with a state doc uses its `configRef` (null = built-in defaults); a class with
 * no doc yet starts on the single published PLC set, then the district default, then built-in.
 */
export function resolveClassConfig(
  rosterId: string,
  classRefs: ReadonlyMap<string, GradebookConfigRef | null>,
  entries: readonly GradebookConfigEntry[]
): GradebookConfigEntry {
  if (classRefs.has(rosterId)) {
    const key = configRefKey(classRefs.get(rosterId) ?? null);
    return entries.find((e) => e.key === key) ?? BUILTIN_CONFIG_ENTRY;
  }
  const plcSets = entries.filter((e) => e.source === 'plc');
  if (plcSets.length === 1) return plcSets[0];
  return (
    entries.find((e) => e.source === 'district' && e.isDefault) ??
    BUILTIN_CONFIG_ENTRY
  );
}

const PREFERRED_NEW_KEYS = 'NRBTDGHJKQSUVWYZCEFO';

export function nextFreeFlagKey(
  flags: readonly GradebookFlagDef[]
): string | null {
  const used = new Set(flags.map((f) => f.key));
  const pool = PREFERRED_NEW_KEYS + 'ABCDEFGHIJKLMNOQRSTUVWXYZ';
  return pool.split('').find((c) => !used.has(c)) ?? null;
}

export type FlagKeyCheck =
  | { ok: true; key: string }
  | { ok: false; message: string };

/** D14: one letter, not P, unused by another flag. */
export function checkFlagKey(
  raw: string,
  flags: readonly GradebookFlagDef[],
  flagId: string
): FlagKeyCheck {
  const key = raw.trim().toUpperCase();
  if (!/^[A-Z]$/.test(key))
    return { ok: false, message: 'A key is one letter.' };
  if (key === 'P') return { ok: false, message: 'P is the privacy shortcut.' };
  const clash = flags.find((f) => f.id !== flagId && f.key === key);
  if (clash)
    return { ok: false, message: `${clash.name} already uses ${key}.` };
  return { ok: true, key };
}

export function newFlag(
  flags: readonly GradebookFlagDef[],
  id: string
): GradebookFlagDef | null {
  const key = nextFreeFlagKey(flags);
  if (!key) return null;
  return {
    id,
    name: 'New flag',
    key,
    color: FLAG_COLOR_PALETTE[flags.length % FLAG_COLOR_PALETTE.length],
    value: null,
    visibility: 'teacher',
    builtIn: false,
  };
}

export function newCategory(
  categories: readonly GradebookCategory[],
  id: string
): GradebookCategory {
  let n = categories.length + 1;
  while (categories.some((c) => c.name === `Category ${n}`)) n++;
  return { id, name: `Category ${n}`, weight: 0 };
}

/** Restores the two defaults, reusing the first two ids so their columns stay put (D13). */
export function restoreDefaultCategories(
  categories: readonly GradebookCategory[]
): GradebookCategory[] {
  return DEFAULT_GRADEBOOK_CATEGORIES.map((d, i) => ({
    ...d,
    id: categories[i]?.id ?? d.id,
  }));
}

export function categoryTotal(
  categories: readonly GradebookCategory[]
): number {
  return categories.reduce((n, c) => n + (Number(c.weight) || 0), 0);
}

export function duplicateName(entry: GradebookConfigEntry): string {
  return entry.source === 'personal' || entry.source === 'builtin'
    ? `${entry.name} copy`.slice(0, 80)
    : entry.name;
}

/** D16 toast after checking or unchecking a class in Applies to. */
export function applyToastText(
  className: string,
  target: GradebookConfigEntry,
  previous: GradebookConfigEntry,
  checked: boolean
): string {
  if (!checked) return `${className} now uses the default settings`;
  if (previous.source === 'builtin')
    return `${className} now uses ${target.name}`;
  return `Moved ${className} from ${previous.name} to ${target.name}`;
}

export function clampPct(v: number, min = 0, max = 100): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.round(v)));
}
