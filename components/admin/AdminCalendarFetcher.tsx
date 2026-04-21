import React, { useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { CalendarGlobalConfig } from '@/types';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';

export const AdminCalendarFetcher: React.FC = () => {
  const { isAdmin, featurePermissions } = useAuth();
  const { calendarService, isConnected } = useGoogleCalendar();
  const BUILDINGS = useAdminBuildings();

  const calendarPermission = featurePermissions.find(
    (p) => p.widgetType === 'calendar'
  );
  const config = calendarPermission?.config as CalendarGlobalConfig | undefined;

  useEffect(() => {
    // Only run for admins who are connected to Google
    if (!isAdmin || !calendarService || !isConnected || !config) return;

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
  }, [isAdmin, calendarService, isConnected, config, BUILDINGS]);

  return null; // Headless
};
