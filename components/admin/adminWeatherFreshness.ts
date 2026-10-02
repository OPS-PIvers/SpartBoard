// Under 1 so a tab ticking just after another tab's write still refreshes next tick.
export const WEATHER_FRESHNESS_RATIO = 0.9;

export interface StoredWeatherMeta {
  updatedAt?: unknown;
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
  }
): boolean => {
  if (!stored || typeof stored.updatedAt !== 'number') return false;
  if (stored.source !== opts.source) return false;
  if (opts.source === 'openweather' && (stored.city ?? '') !== opts.cityKey) {
    return false;
  }
  const age = opts.now - stored.updatedAt;
  const maxAge = opts.frequencyMinutes * 60 * 1000 * WEATHER_FRESHNESS_RATIO;
  return age >= 0 && age < maxAge;
};
