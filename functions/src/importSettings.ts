// Mirrors config/importConversion.ts for the server: AI per widget and what each import offers.
export type ImportAiTarget = 'flashcards' | 'activityWall' | 'board';

/** The import kinds whose admin checklist lists each AI widget (IMPORT_SOURCE_TARGETS on the client). */
export const IMPORT_AI_TARGET_SOURCES: Record<ImportAiTarget, string[]> = {
  flashcards: [
    'web',
    'youtube',
    'spreadsheet',
    'document',
    'slides',
    'course',
    'text',
  ],
  activityWall: ['web', 'youtube', 'document', 'slides', 'course', 'text'],
  board: ['web', 'youtube', 'document', 'slides', 'text'],
};

export const IMPORT_AI_USAGE_KEYS: Record<ImportAiTarget, string> = {
  flashcards: 'import-ai-flashcards',
  activityWall: 'import-ai-activity-wall',
  board: 'import-ai-board',
};

const LABELS: Record<ImportAiTarget, string> = {
  flashcards: 'Flashcards',
  activityWall: 'Activity Wall',
  board: 'New board',
};

export const DEFAULT_IMPORT_AI_DAILY_LIMIT = 20;
const MAX_LIMIT = 1000;

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const validLimit = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_LIMIT
    ? v
    : undefined;

export interface ImportAiAccess {
  on: boolean;
  limit: number;
  usageKey: string;
  limitMessage: string;
}

/** The widget's own AI switch (or the old single one), only while some import that offers it is on and checked. */
export function importAiAccess(
  settings: unknown,
  target: ImportAiTarget,
  legacyLimit: unknown
): ImportAiAccess {
  const doc = isObject(settings) ? settings : {};
  const ai = isObject(doc.ai) && isObject(doc.ai[target]) ? doc.ai[target] : {};
  const sources = isObject(doc.sources) ? doc.sources : {};
  const switchOn =
    typeof ai.enabled === 'boolean' ? ai.enabled : doc.enabled === true;
  const offered = IMPORT_AI_TARGET_SOURCES[target].some((kind) => {
    const s = sources[kind];
    if (!isObject(s)) return true;
    return (
      s.enabled !== false && !(Array.isArray(s.off) && s.off.includes(target))
    );
  });
  const limit =
    validLimit(ai.dailyLimit) ??
    validLimit(legacyLimit) ??
    DEFAULT_IMPORT_AI_DAILY_LIMIT;
  return {
    on: switchOn && offered,
    limit,
    usageKey: IMPORT_AI_USAGE_KEYS[target],
    limitMessage: `${LABELS[target]} with AI limit reached (${limit} per day). Try again tomorrow.`,
  };
}
