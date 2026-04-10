import { useState, useEffect, useRef } from 'react';

interface VersionInfo {
  version: string;
  buildDate: string;
}

/**
 * React hook that polls the app's `/version.json` endpoint to detect when
 * a newer version of the application is available.
 *
 * Behavior:
 * - On mount, it performs an initial fetch to capture the current version.
 * - After the initial version is known, it polls `/version.json`
 *   every `checkIntervalMs` milliseconds.
 * - If the fetched version string differs from the initial version, the
 *   `updateAvailable` flag is set to `true`.
 *
 * @param checkIntervalMs - Polling interval in milliseconds (default: 60000ms).
 * @returns An object containing `updateAvailable` boolean and `reloadApp` function.
 */
export const useAppVersion = (checkIntervalMs = 60000) => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    // Function to fetch the version
    const fetchVersion = async (signal?: AbortSignal) => {
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, {
          signal,
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

        if (
          latestVersion &&
          currentVersion &&
          latestVersion !== currentVersion
        ) {
          setUpdateAvailable(true);
          // Stop polling once an update is detected to avoid redundant network
          // requests. The user should refresh to get the latest version.
        } else {
          if (!latestVersion || latestVersion === currentVersion) {
            schedulePoll();
          }
        }
      }, checkIntervalMs);
    };

    if (!currentVersion) {
      // Initial check to set current version
      const abortController = new AbortController();

      void (async () => {
        const version = await fetchVersion(abortController.signal);
        if (isMountedRef.current && version) {
          setCurrentVersion(version);
        }
      })();

      return () => {
        isMountedRef.current = false;
        abortController.abort();
      };
    }

    // Start polling loop
    schedulePoll();

    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [currentVersion, checkIntervalMs]);

  const reloadApp = () => {
    window.location.reload();
  };

  return { updateAvailable, reloadApp };
};
