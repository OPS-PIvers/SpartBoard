/** Admin-curated `admin_settings/import_conversion`: what each kind of import offers, and AI per widget (docs/plans/IMPORT.md D28). */
import type { ImportTarget } from '@/utils/import/contract';

export { MAX_AI_CONVERSIONS_PER_IMPORT } from '@/utils/import/contract';

export const IMPORT_CONVERSION_SETTINGS_DOC = 'import_conversion';

/** Preview flag: a dropped Source with one widget checked skips the Add to board list. */
export const IMPORT_STRAIGHT_TO_BOARD_FEATURE = 'import-straight-to-board';

/** The kinds of thing a teacher can import, in the order the admin list shows them. */
export const IMPORT_SOURCE_KINDS = [
  'web',
  'youtube',
  'spreadsheet',
  'document',
  'picture',
  'form',
  'slides',
  'webPageFile',
  'course',
  'notebook',
  'text',
] as const;
export type ImportSourceKind = (typeof IMPORT_SOURCE_KINDS)[number];

/** Widgets that can be written by AI from a source's text; each has its own switch and daily limit. */
export const IMPORT_AI_TARGETS = [
  'flashcards',
  'activityWall',
  'board',
] as const;
export type ImportAiTarget = (typeof IMPORT_AI_TARGETS)[number];

export const isImportAiTarget = (t: ImportTarget): t is ImportAiTarget =>
  (IMPORT_AI_TARGETS as readonly string[]).includes(t);

/** Every widget each kind can become; the admin checklist lists these. */
export const IMPORT_SOURCE_TARGETS: Record<ImportSourceKind, ImportTarget[]> = {
  web: ['embed', 'links', 'flashcards', 'activityWall', 'board'],
  youtube: ['videoActivity', 'embed', 'flashcards', 'activityWall', 'board'],
  spreadsheet: ['quiz', 'questionBank', 'flashcards'],
  document: [
    'quiz',
    'pdf',
    'notebook',
    'guidedLearning',
    'flashcards',
    'activityWall',
    'board',
  ],
  picture: ['sticker'],
  form: ['quiz', 'poll'],
  slides: [
    'notebook',
    'guidedLearning',
    'embed',
    'flashcards',
    'activityWall',
    'board',
  ],
  webPageFile: ['miniApp'],
  course: [
    'quiz',
    'questionBank',
    'pdf',
    'links',
    'flashcards',
    'activityWall',
  ],
  notebook: ['notebook'],
  text: ['flashcards', 'activityWall', 'board'],
};

export const DEFAULT_IMPORT_AI_DAILY_LIMIT = 20;
export const IMPORT_AI_DAILY_LIMIT_MAX = 1000;

export interface ImportSourceSetting {
  enabled: boolean;
  /** Widgets the admin unchecked; stored this way so a widget added later starts checked. */
  off: ImportTarget[];
}

export interface ImportAiSetting {
  /** Unset follows the old single switch (`enabled`). */
  enabled?: boolean;
  /** Unset follows the old Import anything daily limit. */
  dailyLimit?: number;
}

export interface ImportConversionSettings {
  /** The old single AI switch; still the fallback for a widget with no AI setting of its own. */
  enabled: boolean;
  sources: Record<ImportSourceKind, ImportSourceSetting>;
  ai: Record<ImportAiTarget, ImportAiSetting>;
}

const ON: ImportSourceSetting = { enabled: true, off: [] };

const allSources = (): Record<ImportSourceKind, ImportSourceSetting> =>
  Object.fromEntries(IMPORT_SOURCE_KINDS.map((k) => [k, ON])) as Record<
    ImportSourceKind,
    ImportSourceSetting
  >;

const noAi = (): Record<ImportAiTarget, ImportAiSetting> => ({
  flashcards: {},
  activityWall: {},
  board: {},
});

export const DEFAULT_IMPORT_CONVERSION_SETTINGS: ImportConversionSettings = {
  enabled: false,
  sources: allSources(),
  ai: noAi(),
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const validLimit = (v: unknown): number | undefined =>
  typeof v === 'number' &&
  Number.isInteger(v) &&
  v >= 1 &&
  v <= IMPORT_AI_DAILY_LIMIT_MAX
    ? v
    : undefined;

/** Fills a partial or malformed settings doc with the defaults; a missing source is on with every widget. */
export function normalizeImportConversionSettings(
  raw: unknown
): ImportConversionSettings {
  if (!isObject(raw)) return DEFAULT_IMPORT_CONVERSION_SETTINGS;
  const rawSources = isObject(raw.sources) ? raw.sources : {};
  const rawAi = isObject(raw.ai) ? raw.ai : {};
  const sources = allSources();
  for (const kind of IMPORT_SOURCE_KINDS) {
    const s = rawSources[kind];
    if (!isObject(s)) continue;
    sources[kind] = {
      enabled: s.enabled !== false,
      off: Array.isArray(s.off)
        ? IMPORT_SOURCE_TARGETS[kind].filter((t) =>
            (s.off as unknown[]).includes(t)
          )
        : [],
    };
  }
  const ai = noAi();
  for (const target of IMPORT_AI_TARGETS) {
    const a = rawAi[target];
    if (!isObject(a)) continue;
    const limit = validLimit(a.dailyLimit);
    ai[target] = {
      ...(typeof a.enabled === 'boolean' ? { enabled: a.enabled } : {}),
      ...(limit !== undefined ? { dailyLimit: limit } : {}),
    };
  }
  return { enabled: raw.enabled === true, sources, ai };
}

/** True when this kind is on and this widget is checked under it. */
export const importSourceOffers = (
  settings: ImportConversionSettings,
  kind: ImportSourceKind,
  target: ImportTarget
): boolean => {
  const s = settings.sources[kind];
  return (
    s.enabled &&
    IMPORT_SOURCE_TARGETS[kind].includes(target) &&
    !s.off.includes(target)
  );
};

/** The widgets a kind offers, in checklist order. */
export const importSourceChecked = (
  settings: ImportConversionSettings,
  kind: ImportSourceKind
): ImportTarget[] =>
  IMPORT_SOURCE_TARGETS[kind].filter(
    (t) => !settings.sources[kind].off.includes(t)
  );

/** AI is on for this widget: its own switch, or the old single switch when it has none. */
export const importAiOn = (
  settings: ImportConversionSettings,
  target: ImportTarget
): boolean =>
  isImportAiTarget(target) && (settings.ai[target].enabled ?? settings.enabled);

/** A widget's AI daily limit, falling back to the old Import anything limit. */
export const importAiDailyLimit = (
  settings: ImportConversionSettings,
  target: ImportAiTarget,
  legacyLimit: unknown
): number =>
  settings.ai[target].dailyLimit ??
  validLimit(legacyLimit) ??
  DEFAULT_IMPORT_AI_DAILY_LIMIT;

/** Mirrors the per-widget switches into the old single switch, so a tab on the previous build follows them. */
export const legacyAiSwitch = (settings: ImportConversionSettings): boolean =>
  IMPORT_AI_TARGETS.some((t) => importAiOn(settings, t));
