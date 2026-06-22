import React, { useEffect, useState } from 'react';
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
      if (!cancelled) setCalendarToken(token);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, config, ensureGoogleScope]);

  useEffect(() => {
    // Only run for admins who have a SILENTLY-available calendar token.
    if (!isAdmin || !calendarToken || !config) return;

    const calendarService = new GoogleCalendarService(calendarToken);

    const fetchAll = async () => {
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
  }, [isAdmin, calendarToken, config, BUILDINGS]);

  return null; // Headless
};
