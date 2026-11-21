import { useMemo, useState } from 'react';
import { useDashboard } from '@/context/useDashboard';
import type { LunchCountConfig } from '@/types';
import { logError } from '@/utils/logError';
import {
  classLacksSentDetails,
  lacksSentDetails,
  mergeSentDetails,
  sentDetailsEntries,
  type SentDetails,
} from './redesign/lunchCountFormat';

const READ_TIMEOUT_MS = 5000;
// A read that failed or timed out isn't tried again for this long.
const FAILED_READ_MS = 5 * 60_000;

type Loaded = Record<string, SentDetails>;

// Module-wide, so repeated clicks and remounts share one Drive read per board and widget.
const inFlightReads = new Map<string, Promise<Loaded | null>>();
const failedReads = new Map<string, number>();

/** Test hook: forgets shared reads between tests. */
export function resetSentDetailsReads(): void {
  inFlightReads.clear();
  failedReads.clear();
}

// Notes sent today from another device live only in Drive; this loads them in the background for a resend.
export function useSentDetails(widgetId: string, config: LunchCountConfig) {
  const { readWidgetPii, activeDashboard } = useDashboard();
  const boardId = activeDashboard?.id;
  const readKey = boardId ? `${boardId}|${widgetId}` : undefined;
  const [loaded, setLoaded] = useState<{ key: string; details: Loaded }>();
  const [loadingKey, setLoadingKey] = useState<string>();
  // Notes read for another board never apply here, even when a copied board shares the widget id.
  const details = loaded && loaded.key === readKey ? loaded.details : undefined;
  const merged = useMemo<LunchCountConfig>(
    () =>
      details
        ? {
            ...config,
            lastSubmittedDetails: mergeSentDetails(
              config.lastSubmittedDetails,
              details,
              config.lastSubmittedSends
            ),
          }
        : config,
    [config, details]
  );

  const loadSentDetails = () => {
    if (!readWidgetPii || !boardId || !readKey) return;
    if (!lacksSentDetails(merged, widgetId)) return;
    const failed = failedReads.get(readKey);
    if (failed !== undefined && Date.now() - failed < FAILED_READ_MS) return;
    let read = inFlightReads.get(readKey);
    if (!read) {
      read = readWidgetPii(widgetId, boardId)
        .then((entry) =>
          entry
            ? Object.fromEntries(sentDetailsEntries(entry.lastSubmittedDetails))
            : null
        )
        .catch((err: unknown) => {
          logError('LunchCountWidget.loadSentDetails', err, { widgetId });
          return null;
        })
        .finally(() => inFlightReads.delete(readKey));
      inFlightReads.set(readKey, read);
    }
    setLoadingKey(readKey);
    let settled = false;
    const done = () => {
      settled = true;
      setLoadingKey((prev) => (prev === readKey ? undefined : prev));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      failedReads.set(readKey, Date.now());
      done();
    }, READ_TIMEOUT_MS);
    void read.then((result) => {
      clearTimeout(timer);
      if (result) {
        // A read that answers after the timeout still fills the notes in.
        failedReads.delete(readKey);
        setLoaded((prev) => ({
          key: readKey,
          details:
            prev?.key === readKey ? { ...prev.details, ...result } : result,
        }));
      } else if (!settled) {
        failedReads.set(readKey, Date.now());
      }
      if (!settled) done();
    });
  };

  return {
    config: merged,
    loadSentDetails,
    isLoadingSentDetails: (classKey: string) =>
      loadingKey !== undefined &&
      loadingKey === readKey &&
      classLacksSentDetails(merged, widgetId, classKey),
  };
}
