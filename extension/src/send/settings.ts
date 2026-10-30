// The teacher's own Send button choices (IMPORT D15), kept in this Chrome profile.

export const SEND_SETTINGS_KEY = 'sendButtonSettings';
const MAX_HIDDEN_HOSTS = 500;

export interface SendSettings {
  /** The global "Show Send button on pages" switch. */
  showOnPages: boolean;
  /** Sites where the teacher chose "Hide on this site". */
  hiddenHosts: string[];
}

export const DEFAULT_SEND_SETTINGS: SendSettings = {
  showOnPages: true,
  hiddenHosts: [],
};

export function parseSendSettings(raw: unknown): SendSettings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SEND_SETTINGS;
  const r = raw as { showOnPages?: unknown; hiddenHosts?: unknown };
  return {
    showOnPages: r.showOnPages !== false,
    hiddenHosts: Array.isArray(r.hiddenHosts)
      ? r.hiddenHosts
          .filter((h): h is string => typeof h === 'string' && h.length > 0)
          .slice(0, MAX_HIDDEN_HOSTS)
      : [],
  };
}

/** The host a "Hide on this site" choice is saved under; null for pages that have none. */
export function siteOf(url: string | undefined): string | null {
  try {
    const parsed = new URL(url ?? '');
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.hostname.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

export function withHidden(
  settings: SendSettings,
  host: string,
  hidden: boolean
): SendSettings {
  const rest = settings.hiddenHosts.filter((h) => h !== host);
  return {
    ...settings,
    hiddenHosts: hidden ? [...rest, host].slice(-MAX_HIDDEN_HOSTS) : rest,
  };
}

/** Whether the edge tab shows on `url`; the toolbar and right-click Send work either way. */
export const buttonShown = (settings: SendSettings, url: string): boolean => {
  const host = siteOf(url);
  return (
    settings.showOnPages &&
    host !== null &&
    !settings.hiddenHosts.includes(host)
  );
};
