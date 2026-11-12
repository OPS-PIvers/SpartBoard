import { useEffect } from 'react';

type AdminSettingsModule = typeof import('@/components/admin/AdminSettings');
let pending: Promise<AdminSettingsModule> | null = null;

// One shared download for the preload and the panel; a failed one is forgotten so the next attempt refetches.
export const loadAdminSettings = (): Promise<AdminSettingsModule> => {
  pending ??= import('@/components/admin/AdminSettings').catch(
    (err: unknown) => {
      pending = null;
      throw err;
    }
  );
  return pending;
};

// Starts the download early (idle time or gear hover) so the first click opens at once.
export function preloadAdminSettings(): void {
  loadAdminSettings().catch(() => undefined);
}

export function usePreloadAdminSettings(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preloadAdminSettings, {
        timeout: 10_000,
      });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(preloadAdminSettings, 3000);
    return () => window.clearTimeout(id);
  }, [enabled]);
}
