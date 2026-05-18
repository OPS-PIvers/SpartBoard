import { useEffect, useState } from 'react';

declare const __APP_VERSION__: string;

interface VersionInfo {
  version: string;
  buildDate: string;
}

type Listener = (updateAvailable: boolean) => void;

// Module-level singleton: one polling timer is shared across all hook
// instances so the Sidebar and UpdateNotification don't independently hit
// /version.json every minute. The first caller's interval wins.
const listeners = new Set<Listener>();
let detectedUpdate = false;
let activeTimeout: ReturnType<typeof setTimeout> | null = null;
let pollingInitialized = false;
let pollIntervalMs = 60000;

const fetchVersion = async (): Promise<string | null> => {
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
  if (activeTimeout) clearTimeout(activeTimeout);
  activeTimeout = setTimeout(async () => {
    const latestVersion = await fetchVersion();
    if (latestVersion && latestVersion !== __APP_VERSION__) {
      detectedUpdate = true;
      listeners.forEach((l) => l(true));
      // Stop polling once an update is detected.
      activeTimeout = null;
    } else {
      schedulePoll();
    }
  }, pollIntervalMs);
};

const initPolling = (interval: number) => {
  if (pollingInitialized) return;
  if (typeof __APP_VERSION__ === 'undefined' || __APP_VERSION__ === 'dev') {
    return;
  }
  pollingInitialized = true;
  pollIntervalMs = interval;
  schedulePoll();
};

/**
 * React hook that exposes whether a newer version of the app has been
 * detected. Internally backed by a single shared polling loop so multiple
 * consumers (e.g. the update toast and the sidebar) don't duplicate fetches.
 */
export const useAppVersion = (checkIntervalMs = 60000) => {
  // Initialize from the singleton — late subscribers (mounted after an
  // update was already detected) start with the correct state immediately,
  // so no in-effect setState is needed.
  const [updateAvailable, setUpdateAvailable] = useState(() => detectedUpdate);

  useEffect(() => {
    initPolling(checkIntervalMs);
    listeners.add(setUpdateAvailable);
    return () => {
      listeners.delete(setUpdateAvailable);
    };
  }, [checkIntervalMs]);

  const reloadApp = () => {
    window.location.reload();
  };

  return { updateAvailable, reloadApp };
};

// Test-only: resets the singleton so each test gets a fresh polling loop.
// Production code should never need this.
export const __resetAppVersionForTests = (): void => {
  if (activeTimeout) clearTimeout(activeTimeout);
  activeTimeout = null;
  listeners.clear();
  detectedUpdate = false;
  pollingInitialized = false;
  pollIntervalMs = 60000;
};
