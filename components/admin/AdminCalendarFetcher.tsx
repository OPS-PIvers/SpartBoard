import React, { useEffect, useRef, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { CalendarGlobalConfig } from '@/types';
import { GoogleCalendarService } from '@/utils/googleCalendarService';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';

export const AdminCalendarFetcher: React.FC = () => {
  const { isAdmin, featurePermissions, ensureGoogleScope } = useAuth();
  const BUILDINGS = useAdminBuildings();
  // Path B: the central background sync needs the `calendar.readonly` scope,
  // which is NOT requested at login. We acquire it SILENTLY here (this is a
  // background effect with no user gesture — a popup would be blocked and is
  // never appropriate). Admins who already granted it (e.g. via "Sync All Now")
  // sync exactly as before; admins who haven't granted it resolve to null and
  // the background sync simply stays idle until they seed consent from the
  // gesture-driven "Sync All Now" button in CalendarConfigurationModal.
  const [calendarToken, setCalendarToken] = useState<string | null>(null);

  // `ensureGoogleScope` is a useCallback whose identity changes on EVERY token
  // refresh (its deps include `googleAccessToken`, which the proactive ~50-min
  // refresh loop rewrites). If the hourly interval effect below listed it as a
  // dependency, that identity churn would tear down + recreate the effect
  // (clearInterval) and reset the 1-hour timer before it ever fired — so the
  // central calendar sync would NEVER run. Hold the latest callback in a ref
  // and read it inside `fetchAll` so the interval can be set up exactly once
  // and stay stable across token refreshes. The ref always sees the freshest
  // `ensureGoogleScope` (and thus the freshest token) at call time.
  const ensureGoogleScopeRef = useRef(ensureGoogleScope);
  // eslint-disable-next-line react-hooks/refs
  ensureGoogleScopeRef.current = ensureGoogleScope;

  const calendarPermission = featurePermissions.find(
    (p) => p.widgetType === 'calendar'
  );
  const config = calendarPermission?.config as CalendarGlobalConfig | undefined;

  // Silently probe for a calendar token whenever an admin with calendar config
  // is present. Non-interactive: never opens a popup from this headless effect.
  // All setState happens asynchronously (inside the awaited IIFE / null-reset
  // branch is also async), never synchronously in the effect body.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token =
        isAdmin && config ? await ensureGoogleScope('calendar.readonly') : null;
      if (!cancelled) {
        // Flip only on a null<->non-null change. A same-presence token-VALUE
        // refresh (the proactive ~50-min loop re-mints the token) keeps the same
        // calendarToken, so the hourly sync interval below (which deps on
        // calendarToken) isn't torn down and reset before it can fire. fetchAll
        // re-acquires a fresh token per cycle via ensureGoogleScopeRef, so a
        // stale value here is harmless — calendarToken is only a "connected" gate.
        setCalendarToken((prev) => (!!prev === !!token ? prev : token));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, config, ensureGoogleScope]);

  useEffect(() => {
    // Only run for admins who have a SILENTLY-available calendar token.
    if (!isAdmin || !calendarToken || !config) return;

    const fetchAll = async () => {
      // Re-acquire the token each sync cycle so an expired GIS token (~1h TTL —
      // exactly this effect's interval) never reaches the Calendar API. Silent
      // only (background effect, no gesture); null → not connected, stay idle.
      // Read through the ref so the interval effect stays stable across token
      // refreshes (see the ref declaration above) yet still calls the freshest
      // `ensureGoogleScope`.
      const freshToken =
        await ensureGoogleScopeRef.current('calendar.readonly');
      if (!freshToken) return;
      const calendarService = new GoogleCalendarService(freshToken);

      console.warn('[AdminCalendarFetcher] Starting background sync...');
      try {
        const now = new Date();
        const timeMin = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        const timeMax = new Date(now.setDate(now.getDate() + 30)).toISOString();

        const buildingDefaults = { ...config.buildingDefaults };
        let hasChanges = false;

        for (const building of BUILDINGS) {
          const bConfig = buildingDefaults[building.id];
          const ids = bConfig?.googleCalendarIds ?? [];

          if (ids.length === 0) continue;

          // Check if it's time to update (based on updateFrequencyHours)
          const lastSync = bConfig?.lastProxySync ?? 0;
          const frequencyMs =
            (config.updateFrequencyHours ?? 4) * 60 * 60 * 1000;

          if (Date.now() - lastSync < frequencyMs) {
            continue;
          }

          try {
            const allPromises = ids.map((id) =>
              calendarService.getEvents(id, timeMin, timeMax)
            );
            const results = await Promise.all(allPromises);
            const merged = results
              .flat()
              .sort((a, b) => a.date.localeCompare(b.date));

            buildingDefaults[building.id] = {
              ...bConfig,
              cachedEvents: merged,
              lastProxySync: Date.now(),
            };
            hasChanges = true;
          } catch (err) {
            console.error(
              `[AdminCalendarFetcher] Failed building ${building.id}:`,
              err
            );
          }
        }

        if (hasChanges) {
          const docRef = doc(db, 'feature_permissions', 'calendar');
          await setDoc(
            docRef,
            {
              config: {
                ...config,
                buildingDefaults,
              },
              updatedAt: Date.now(),
            },
            { merge: true }
          );
          console.warn('[AdminCalendarFetcher] Background sync complete.');
        }
      } catch (err) {
        console.error('[AdminCalendarFetcher] Global sync failed:', err);
      }
    };

    // Initial check
    void fetchAll();

    // Re-check every hour (check if any building is "stale")
    const intervalId = setInterval(
      () => {
        void fetchAll();
      },
      60 * 60 * 1000
    );

    return () => clearInterval(intervalId);
    // `ensureGoogleScope` is intentionally NOT a dependency: it's read through
    // `ensureGoogleScopeRef` inside `fetchAll`, so the interval is created once
    // and survives token refreshes (listing it here would reset the 1-hour
    // timer on every refresh and the sync would never fire).
  }, [isAdmin, calendarToken, config, BUILDINGS]);

  return null; // Headless
};
