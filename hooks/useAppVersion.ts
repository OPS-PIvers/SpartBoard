import { useState, useEffect, useRef } from 'react';

declare const __APP_VERSION__: string;

interface VersionInfo {
  version: string;
  buildDate: string;
}

/**
 * React hook that polls the app's `/version.json` endpoint to detect when
 * a newer version of the application is available.
 *
 * The "current" version is baked into the JS bundle at build time via Vite's
 * `define` (see vite.config.ts), so no initial network fetch is needed — the
 * hook starts polling immediately and compares against the embedded version.
 *
 * @param checkIntervalMs - Polling interval in milliseconds (default: 60000ms).
 * @returns An object containing `updateAvailable` boolean and `reloadApp` function.
 */
export const useAppVersion = (checkIntervalMs = 60000) => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const buildVersion = __APP_VERSION__;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Don't poll in development – the version is the static string 'dev'
    if (buildVersion === 'dev') return;

    isMountedRef.current = true;

    const fetchVersion = async () => {
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!response.ok) return null;
        const data = (await response.json()) as VersionInfo;
        return data.version;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return null;
        }
        console.error('Failed to check version', error);
        return null;
      }
    };

    const schedulePoll = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(async () => {
        if (!isMountedRef.current) return;

        const latestVersion = await fetchVersion();
        if (!isMountedRef.current) return;

        if (latestVersion && latestVersion !== buildVersion) {
          setUpdateAvailable(true);
          // Stop polling once an update is detected.
        } else {
          schedulePoll();
        }
      }, checkIntervalMs);
    };

    schedulePoll();

    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [buildVersion, checkIntervalMs]);

  const reloadApp = () => {
    window.location.reload();
  };

  return { updateAvailable, reloadApp };
};
