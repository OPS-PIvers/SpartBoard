import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LunchCountConfig,
  LunchMenuDay,
  LunchMenuItem,
  WidgetData,
} from '@/types';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { toLunchCountSchoolSite } from '@/config/buildings';
import { logError } from '@/utils/logError';

interface UseNutrisliceProps {
  widgetId: string;
  config: LunchCountConfig;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
  addToast: (message: string, type?: 'info' | 'success' | 'error') => void;
}

interface NutrisliceFood {
  name?: string;
  image_url?: string;
}

interface NutrisliceMenuItem {
  is_section_title?: boolean;
  section_name?: string;
  food?: NutrisliceFood;
  text?: string;
}

interface NutrisliceDay {
  date: string;
  menu_items?: NutrisliceMenuItem[];
}

interface NutrisliceWeek {
  days?: NutrisliceDay[];
}

const ALT_MEAL_SECTION_PATTERNS = [
  'bento',
  'alternative',
  'alt',
  'pb-jammin',
  'pb jammin',
];

const isAltMealSectionName = (name: string | undefined): boolean => {
  if (!name) return false;
  const lower = name.toLowerCase();
  return ALT_MEAL_SECTION_PATTERNS.some((p) => lower.includes(p));
};

const itemDisplayName = (item: NutrisliceMenuItem): string =>
  (item.food?.name ?? item.text ?? '').trim();

const toMenuItem = (
  item: NutrisliceMenuItem,
  fallbackName: string
): LunchMenuItem => ({
  name: itemDisplayName(item) || fallbackName,
  imageUrl: item.food?.image_url,
});

/**
 * Returns true if a previously cached menu uses the legacy string shape
 * (pre-sides/images). Such configs need to be re-fetched once so the new
 * fields are populated. Checks both hotLunch and bentoBox so partially
 * migrated records also get caught.
 */
const isLegacyCachedMenu = (
  cachedMenu: LunchCountConfig['cachedMenu']
): boolean => {
  if (!cachedMenu) return false;
  const legacy = cachedMenu as unknown as {
    hotLunch?: unknown;
    bentoBox?: unknown;
  };
  return (
    typeof legacy.hotLunch === 'string' || typeof legacy.bentoBox === 'string'
  );
};

const buildEmptyMenu = (
  noHotLunch: string,
  noBentoBox: string,
  isoDate: string
): LunchMenuDay => ({
  hotLunch: { name: noHotLunch },
  hotLunchSides: [],
  bentoBox: { name: noBentoBox },
  date: isoDate,
});

export const useNutrislice = ({
  widgetId,
  config,
  updateWidget,
  addToast,
}: UseNutrisliceProps) => {
  const { t } = useTranslation();
  const [isSyncing, setIsSyncing] = useState(false);
  const configRef = useRef(config);

  // Keep ref in sync
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const fetchWithFallback = async (url: string) => {
    const fetchProxy = httpsCallable<{ url: string }, NutrisliceWeek>(
      functions,
      'fetchExternalProxy'
    );
    try {
      const result = await fetchProxy({ url });
      console.warn(
        '[LunchCountWidget] Fetched Nutrislice Data successfully via Cloud Proxy'
      );
      return result.data;
    } catch (error) {
      logError('useNutrislice.fetchProxy', error);
      throw error;
    }
  };

  const fetchNutrislice = useCallback(async () => {
    if (configRef.current.isManualMode || isSyncing) return;
    setIsSyncing(true);
    updateWidget(widgetId, {
      config: { ...configRef.current, syncError: null },
    });

    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const schoolSite =
        toLunchCountSchoolSite(configRef.current.schoolSite ?? '') ??
        'schumann-elementary';

      const apiUrl = `https://orono.api.nutrislice.com/menu/api/weeks/school/${schoolSite}/menu-type/lunch/${year}/${month}/${day}/`;
      const data = await fetchWithFallback(apiUrl);

      const noHotLunch = t('widgets.lunchCount.noHotLunch');
      const noBentoBox = t('widgets.lunchCount.noBentoBox');

      let hotLunch: LunchMenuItem = { name: noHotLunch };
      const hotLunchSides: LunchMenuItem[] = [];
      let bentoBox: LunchMenuItem = { name: noBentoBox };

      if (data && data.days) {
        // Match against the same local-time date used to build the request
        // URL. toISOString() is UTC, which can be a day ahead of the local
        // date in the evening and would miss the menu entry.
        const todayStr = `${year}-${month}-${day}`;
        const dayData = data.days.find((d) => d.date === todayStr);

        if (dayData && dayData.menu_items) {
          const items = dayData.menu_items;

          // Walk items in menu order, tracking the running section name from
          // is_section_title rows. This lets us classify each food item by its
          // current section without trusting only its own section_name field.
          let currentSection: string | undefined;
          let entreeIndex = -1;
          let bentoIndexBySection = -1;
          let bentoIndexByName = -1;
          let sawAltMealSection = false;
          const sectionForIndex: (string | undefined)[] = [];

          items.forEach((item, idx) => {
            if (item.is_section_title) {
              currentSection = item.section_name ?? item.text ?? currentSection;
              sectionForIndex[idx] = currentSection;
              if (isAltMealSectionName(currentSection)) {
                sawAltMealSection = true;
              }
              return;
            }
            sectionForIndex[idx] = item.section_name ?? currentSection;

            const sectionName = sectionForIndex[idx]?.toLowerCase() ?? '';
            const itemName = itemDisplayName(item).toLowerCase();

            if (
              entreeIndex === -1 &&
              (sectionName.includes('entree') || sectionName.includes('main'))
            ) {
              entreeIndex = idx;
            }

            if (
              bentoIndexBySection === -1 &&
              isAltMealSectionName(sectionForIndex[idx])
            ) {
              bentoIndexBySection = idx;
            }

            if (bentoIndexByName === -1 && itemName.includes('bento')) {
              bentoIndexByName = idx;
            }
          });

          // Prefer section-based bento detection. Only fall back to a name
          // substring match when no alt-meal section was ever observed —
          // otherwise a side like "Bento-style Sushi Cup" in a regular Sides
          // section would be misclassified as the alt meal.
          const bentoIndex =
            bentoIndexBySection >= 0
              ? bentoIndexBySection
              : sawAltMealSection
                ? -1
                : bentoIndexByName;

          // Fallback: if no entree section matched, use the first non-title
          // food item that has a non-empty display name.
          if (entreeIndex === -1) {
            entreeIndex = items.findIndex(
              (i) => !i.is_section_title && itemDisplayName(i)
            );
          }

          if (entreeIndex >= 0) {
            hotLunch = toMenuItem(items[entreeIndex], noHotLunch);

            // Sides: every non-title item after the entree, in menu order,
            // until we hit (a) the bento item or (b) an alt-meal section.
            for (let idx = entreeIndex + 1; idx < items.length; idx++) {
              const item = items[idx];
              if (item.is_section_title) {
                if (isAltMealSectionName(item.section_name ?? item.text)) {
                  break;
                }
                continue;
              }
              if (idx === bentoIndex) break;
              if (isAltMealSectionName(sectionForIndex[idx])) break;
              const name = itemDisplayName(item);
              if (!name) continue;
              hotLunchSides.push(toMenuItem(item, name));
            }
          }

          if (bentoIndex >= 0) {
            bentoBox = toMenuItem(items[bentoIndex], noBentoBox);
          }
        }
      }

      const newMenu: LunchMenuDay = {
        hotLunch,
        hotLunchSides,
        bentoBox,
        date: now.toISOString(),
      };

      updateWidget(widgetId, {
        config: {
          ...configRef.current,
          cachedMenu: newMenu,
          lastSyncDate: now.toISOString(),
          syncError: null,
        },
      });
      addToast(t('widgets.lunchCount.syncSuccess'), 'success');
    } catch (err) {
      logError('useNutrislice.fetchNutrislice', err, { widgetId });

      // If we were trying to migrate a legacy-shape cache and the fetch
      // failed, install a non-legacy stub so the migration check flips to
      // false. Otherwise hasLegacyShape stays true and the effect would
      // re-fire fetchNutrislice on the next render — pegging the proxy
      // until the network recovers.
      const wasLegacy = isLegacyCachedMenu(configRef.current.cachedMenu);
      const stamp = new Date().toISOString();
      updateWidget(widgetId, {
        config: {
          ...configRef.current,
          ...(wasLegacy
            ? {
                cachedMenu: buildEmptyMenu(
                  t('widgets.lunchCount.noHotLunch'),
                  t('widgets.lunchCount.noBentoBox'),
                  stamp
                ),
              }
            : {}),
          syncError: 'E-SYNC-404',
          // Mark this as a sync attempt so we don't loop endlessly.
          lastSyncDate: stamp,
        },
      });
      addToast(t('widgets.lunchCount.syncError'), 'error');
    } finally {
      setIsSyncing(false);
    }
  }, [widgetId, updateWidget, addToast, isSyncing, t]);

  const hasLegacyShape = isLegacyCachedMenu(config.cachedMenu);

  useEffect(() => {
    if (isSyncing) return;

    const lastSyncDate = config.lastSyncDate
      ? new Date(config.lastSyncDate)
      : null;
    const today = new Date();

    const isSyncedToday =
      lastSyncDate && lastSyncDate.toDateString() === today.toDateString();

    // Re-fetch if either we haven't synced today, or the cached payload still
    // uses the pre-images legacy string shape.
    if (!isSyncedToday || hasLegacyShape) {
      void fetchNutrislice();
    }
  }, [fetchNutrislice, config.lastSyncDate, isSyncing, hasLegacyShape]);

  return { isSyncing, fetchNutrislice };
};
