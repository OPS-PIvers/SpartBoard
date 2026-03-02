import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { LunchCountConfig, LunchMenuDay, WidgetData } from '../../../types';

interface UseNutrisliceProps {
  widgetId: string;
  config: LunchCountConfig;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
  addToast: (message: string, type?: 'info' | 'success' | 'error') => void;
}

interface NutrisliceFood {
  name?: string;
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

  // NOTE: Using third-party CORS proxy services introduces security and reliability concerns.
  // These proxies can inspect all data passing through them, and their availability is not guaranteed.
  // TODO: Implement a backend proxy endpoint under our control or work with Nutrislice API
  // to get proper CORS headers configured for a production-ready solution.
  const fetchWithFallback = async (url: string) => {
    const proxies = [
      (u: string) =>
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
      (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
      (u: string) =>
        `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    ];

    let lastError: Error | null = null;

    for (const getProxyUrl of proxies) {
      try {
        const response = await fetch(getProxyUrl(url));
        if (!response.ok) throw new Error(`Proxy status: ${response.status}`);

        const text = await response.text();
        const trimmedText = text.trim();

        // Improved HTML/Empty detection (case-insensitive and more robust)
        if (
          !trimmedText ||
          trimmedText.startsWith('<') ||
          trimmedText.toLowerCase().startsWith('<!doctype') ||
          trimmedText.toLowerCase().startsWith('<html')
        ) {
          throw new Error(
            'Proxy returned HTML or empty response instead of JSON'
          );
        }

        const jsonContent = JSON.parse(trimmedText) as NutrisliceWeek;

        console.warn('[LunchCountWidget] Fetched Nutrislice Data successfully');

        if (jsonContent && jsonContent.days) return jsonContent;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));

        // Use console.warn as required by lint rules

        console.warn(
          `[LunchCountWidget] Proxy attempt failed: ${lastError.message}`
        );
      }
    }
    throw lastError ?? new Error('All proxies failed');
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
      const schoolSite = configRef.current.schoolSite || 'schumann-elementary';

      const apiUrl = `https://orono.api.nutrislice.com/menu/api/weeks/school/${schoolSite}/menu-type/lunch/${year}/${month}/${day}/`;
      const data = await fetchWithFallback(apiUrl);

      let hotLunch = t('widgets.lunchCount.noHotLunch');
      let bentoBox = t('widgets.lunchCount.noBentoBox');

      if (data && data.days) {
        const todayStr = now.toISOString().split('T')[0];
        const dayData = data.days.find((d) => d.date === todayStr);

        if (dayData && dayData.menu_items) {
          const items = dayData.menu_items;

          // Hot Lunch: Map to the first item in the "Entrees" section
          const entree = items.find(
            (i) =>
              !i.is_section_title &&
              (i.section_name?.toLowerCase().includes('entree') ??
                i.section_name?.toLowerCase().includes('main'))
          );
          if (entree) hotLunch = entree.food?.name ?? entree.text ?? hotLunch;

          // Bento Box: Map to any item in Entrees or Sides that contains "Bento"
          const bento = items.find(
            (i) =>
              (i.food?.name?.toLowerCase().includes('bento') ??
                i.text?.toLowerCase().includes('bento')) &&
              !i.is_section_title
          );
          if (bento) bentoBox = bento.food?.name ?? bento.text ?? bentoBox;

          // Fallback for Hot Lunch if no section matched
          if (hotLunch === 'No Hot Lunch Listed' && items.length > 0) {
            const firstFood = items.find(
              (i) => !i.is_section_title && (i.food?.name ?? i.text)
            );
            if (firstFood)
              hotLunch = firstFood.food?.name ?? firstFood.text ?? hotLunch;
          }
        }
      }

      const newMenu: LunchMenuDay = {
        hotLunch,
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
      console.error('Nutrislice Sync Error:', err);
      updateWidget(widgetId, {
        config: {
          ...configRef.current,
          syncError: 'E-SYNC-404',
          // Mark this as a sync attempt so we don't loop endlessly
          lastSyncDate: new Date().toISOString(),
        },
      });
      addToast(t('widgets.lunchCount.syncError'), 'error');
    } finally {
      setIsSyncing(false);
    }
  }, [widgetId, updateWidget, addToast, isSyncing, t]);

  useEffect(() => {
    if (isSyncing) return;

    const lastSyncDate = config.lastSyncDate
      ? new Date(config.lastSyncDate)
      : null;
    const today = new Date();

    const isSyncedToday =
      lastSyncDate && lastSyncDate.toDateString() === today.toDateString();

    // Only try to sync if we haven't already synced (or attempted to) today
    if (!isSyncedToday) {
      void fetchNutrislice();
    }
  }, [fetchNutrislice, config.lastSyncDate, isSyncing]);

  return { isSyncing, fetchNutrislice };
};
