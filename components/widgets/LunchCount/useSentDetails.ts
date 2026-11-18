import { useMemo, useRef, useState } from 'react';
import { useDashboard } from '@/context/useDashboard';
import type { LunchCountConfig } from '@/types';
import { logError } from '@/utils/logError';
import {
  lacksSentDetails,
  mergeSentDetails,
  type SentDetails,
} from './redesign/lunchCountFormat';

const READ_TIMEOUT_MS = 5000;

const withDetails = (
  config: LunchCountConfig,
  loaded: Record<string, SentDetails> | undefined
): LunchCountConfig =>
  loaded
    ? {
        ...config,
        lastSubmittedDetails: mergeSentDetails(
          config.lastSubmittedDetails,
          loaded
        ),
      }
    : config;

// Notes sent today from another device live only in Drive; this pulls them in before a send or resend.
export function useSentDetails(widgetId: string, config: LunchCountConfig) {
  const { readWidgetPii } = useDashboard();
  const [loaded, setLoaded] = useState<Record<string, SentDetails>>();
  const loadedRef = useRef<Record<string, SentDetails> | undefined>(undefined);
  const merged = useMemo(() => withDetails(config, loaded), [config, loaded]);

  const ensureSentDetails = async (): Promise<LunchCountConfig> => {
    const current = withDetails(config, loadedRef.current);
    if (!readWidgetPii || !lacksSentDetails(current, widgetId)) return current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const entry = await Promise.race([
        readWidgetPii(widgetId),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS);
        }),
      ]);
      const next = mergeSentDetails(
        loadedRef.current,
        entry?.lastSubmittedDetails
      );
      if (!next) return current;
      loadedRef.current = next;
      setLoaded(next);
      return withDetails(config, next);
    } catch (err) {
      logError('LunchCountWidget.ensureSentDetails', err, { widgetId });
      return current;
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    config: merged,
    needsSentDetails: !!readWidgetPii && lacksSentDetails(merged, widgetId),
    ensureSentDetails,
  };
}
