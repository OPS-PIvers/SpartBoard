// Under 1 so a tab ticking just after another tab's write still refreshes next tick.
export const WEATHER_FRESHNESS_RATIO = 0.9;

export interface StoredWeatherMeta {
  updatedAt?: unknown;
  temp?: unknown;
  source?: unknown;
  city?: unknown;
}

// Every admin tab runs AdminWeatherFetcher; true when another tab already refreshed.
export const isStoredWeatherFresh = (
  stored: StoredWeatherMeta | undefined,
  opts: {
    source: string;
    cityKey: string;
    frequencyMinutes: number;
    now: number;
    checkedAt?: unknown;
  }
): boolean => {
  if (!stored || typeof stored.updatedAt !== 'number') return false;
  // An older client may have stored a blank temperature; replace it right away.
  if (typeof stored.temp !== 'number' || !Number.isFinite(stored.temp)) {
    return false;
  }
  if (stored.source !== opts.source) return false;
  if (opts.source === 'openweather' && (stored.city ?? '') !== opts.cityKey) {
    return false;
  }
  // An unchanged check stamps lastCheckedAt instead of rewriting the doc.
  const lastTouch =
    typeof opts.checkedAt === 'number' && opts.checkedAt > stored.updatedAt
      ? opts.checkedAt
      : stored.updatedAt;
  const age = opts.now - lastTouch;
  const maxAge = opts.frequencyMinutes * 60 * 1000 * WEATHER_FRESHNESS_RATIO;
  return age >= 0 && age < maxAge;
};

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : 1))
        )
      : v
  );

const COMPARED_KEYS = [
  'temp',
  'feelsLike',
  'condition',
  'locationName',
  'source',
  'city',
  'details',
] as const;

// True when a new reading matches the stored one, so the write can be skipped.
export const isWeatherUnchanged = (
  stored: Record<string, unknown> | undefined,
  next: Record<string, unknown>
): boolean =>
  !!stored &&
  COMPARED_KEYS.every(
    (key) => canonical(stored[key] ?? null) === canonical(next[key] ?? null)
  );
