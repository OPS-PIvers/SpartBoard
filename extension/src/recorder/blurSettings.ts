/** What the recorder blurs on the page before each picture (C5). */
export interface BlurSettings {
  emails: boolean;
  ids: boolean;
  lastFirst: boolean;
  fields: boolean;
  tableRows: boolean;
  images: boolean;
}

export type BlurCategory = keyof BlurSettings;

/** chrome.storage.local key the side panel writes and the worker reads. */
export const BLUR_SETTINGS_KEY = 'recorder.blur';

// Table rows and images often hold what the tour teaches, so they start off.
export const BLUR_DEFAULTS: BlurSettings = {
  emails: true,
  ids: true,
  lastFirst: true,
  fields: true,
  tableRows: false,
  images: false,
};

export const BLUR_CATEGORIES: { key: BlurCategory; label: string }[] = [
  { key: 'emails', label: 'Emails' },
  { key: 'ids', label: 'ID and phone numbers' },
  { key: 'lastFirst', label: 'Names written Last, First' },
  { key: 'fields', label: 'Typed in fields' },
  { key: 'tableRows', label: 'Table rows' },
  { key: 'images', label: 'Images' },
];

/** Stored settings with anything missing or malformed set to its default. */
export function toBlurSettings(raw: unknown): BlurSettings {
  const got =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = { ...BLUR_DEFAULTS };
  for (const key of Object.keys(BLUR_DEFAULTS) as BlurCategory[]) {
    const v = got[key];
    if (typeof v === 'boolean') out[key] = v;
  }
  return out;
}

export const isBlurSettings = (v: unknown): v is BlurSettings =>
  !!v &&
  typeof v === 'object' &&
  (Object.keys(BLUR_DEFAULTS) as BlurCategory[]).every(
    (k) => typeof (v as Record<string, unknown>)[k] === 'boolean'
  );

export async function readBlurSettings(): Promise<BlurSettings> {
  const got = await chrome.storage.local
    .get(BLUR_SETTINGS_KEY)
    .catch(() => ({}));
  return toBlurSettings((got as Record<string, unknown>)[BLUR_SETTINGS_KEY]);
}

/** Most elements one page remembers from Click to blur. */
export const MAX_PICKS_PER_PAGE = 50;
export const MAX_PICK_SELECTOR = 500;
