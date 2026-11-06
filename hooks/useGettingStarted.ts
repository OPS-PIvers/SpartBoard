import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, isConfigured } from '@/config/firebase';
import {
  DEFAULT_GETTING_STARTED_SETTINGS,
  GETTING_STARTED_SETTINGS_DOC,
  normalizeGettingStartedSettings,
  type GettingStartedEntry,
  type GettingStartedSettings,
} from '@/config/gettingStarted';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useSharedHelpState } from '@/hooks/useHelpResources';
import {
  useCanUseWidget,
  useRunnableTourIds,
} from '@/components/tours/useTourOffers';
import { isTourRunnable } from '@/components/tours/publishedTours';
import type { HelpResourceItem } from '@/types/helpCenter';
import {
  EMPTY_GETTING_STARTED_PROGRESS,
  gettingStartedProgressRef,
  normalizeGettingStartedProgress,
  type GettingStartedProgress,
} from '@/utils/gettingStartedProgress';
import { logError } from '@/utils/logError';

export interface GettingStartedTour extends GettingStartedEntry {
  item: HelpResourceItem;
  setId: string;
  done: boolean;
}

interface GettingStartedFacts {
  finished: Readonly<Record<string, number>>;
  hasBuilding: boolean;
  hasDriveGrant: boolean;
  hasClass: boolean;
  isExternalUser: boolean;
}

const itemSetId = (item: HelpResourceItem | undefined): string | null =>
  item?.kind === 'guided-learning' && item.setId ? item.setId : null;

/** The curated tours this teacher can take, in order; a pulled, broken or inapplicable tour drops out (D12, D17). */
export function resolveGettingStartedTours(
  entries: readonly GettingStartedEntry[],
  items: readonly HelpResourceItem[],
  runnable: ReadonlySet<string>,
  facts: GettingStartedFacts
): GettingStartedTour[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return entries.flatMap((entry) => {
    const item = byId.get(entry.itemId);
    const setId = itemSetId(item);
    if (!item || !setId || !runnable.has(setId)) return [];
    if (entry.doneWhen === 'drive' && facts.isExternalUser) return [];
    const done =
      entry.doneWhen === 'building'
        ? facts.hasBuilding
        : entry.doneWhen === 'drive'
          ? facts.hasDriveGrant
          : entry.doneWhen === 'classes'
            ? facts.hasClass
            : facts.finished[setId] !== undefined;
    return [{ ...entry, item, setId, done }];
  });
}

/** Live view of the admin's curated list and sidebar switch. */
export function useGettingStartedSettings(): GettingStartedSettings & {
  loading: boolean;
} {
  const [state, setState] = useState({
    settings: DEFAULT_GETTING_STARTED_SETTINGS,
    loading: isConfigured,
  });
  useEffect(() => {
    if (!isConfigured) return;
    return onSnapshot(
      doc(db, 'admin_settings', GETTING_STARTED_SETTINGS_DOC),
      (snap) =>
        setState({
          settings: normalizeGettingStartedSettings(snap.data()),
          loading: false,
        }),
      (err) => {
        logError('useGettingStartedSettings', err);
        setState((s) => ({ ...s, loading: false }));
      }
    );
  }, []);
  return { ...state.settings, loading: state.loading };
}

function useGettingStartedProgress(uid: string | undefined): {
  progress: GettingStartedProgress;
  loading: boolean;
} {
  const [state, setState] = useState<{
    uid: string | undefined;
    progress: GettingStartedProgress;
  } | null>(null);
  useEffect(() => {
    if (!uid || !isConfigured) return;
    return onSnapshot(
      gettingStartedProgressRef(uid),
      (snap) =>
        setState({
          uid,
          progress: normalizeGettingStartedProgress(snap.data()),
        }),
      (err) => {
        logError('useGettingStartedProgress', err);
        setState({ uid, progress: EMPTY_GETTING_STARTED_PROGRESS });
      }
    );
  }, [uid]);
  const current = state?.uid === uid ? state : null;
  return {
    progress: current?.progress ?? EMPTY_GETTING_STARTED_PROGRESS,
    loading: !!uid && isConfigured && !current,
  };
}

export interface GettingStartedState {
  loading: boolean;
  showInSidebar: boolean;
  essentials: GettingStartedTour[];
  nextSteps: GettingStartedTour[];
  essentialsDone: number;
  /** The Essentials tour Resume runs; null once they're all done. */
  nextEssential: GettingStartedTour | null;
}

/** Everything the sidebar item and the page show; mount only while one of them is on screen. */
export function useGettingStarted(): GettingStartedState {
  const { user, selectedBuildings, offlineGrantPresent, isExternalUser } =
    useAuth();
  const { rosters } = useDashboard();
  const settings = useGettingStartedSettings();
  const { progress, loading: progressLoading } = useGettingStartedProgress(
    user?.uid
  );
  const help = useSharedHelpState();
  const canUse = useCanUseWidget();
  const byId = new Map(help.items.map((item) => [item.id, item]));
  const setIds = settings.tours.flatMap((entry) => {
    const setId = itemSetId(byId.get(entry.itemId));
    return setId ? [setId] : [];
  });
  const runnable = useRunnableTourIds(setIds);
  const toursLoading = setIds.some(
    (id) => isTourRunnable(id, canUse) === undefined
  );
  const tours = resolveGettingStartedTours(
    settings.tours,
    help.items,
    runnable,
    {
      finished: progress.finished,
      hasBuilding: selectedBuildings.length > 0,
      hasDriveGrant: offlineGrantPresent,
      hasClass: rosters.length > 0,
      isExternalUser,
    }
  );
  const essentials = tours.filter((tour) => tour.tier === 'essentials');
  return {
    loading:
      settings.loading ||
      progressLoading ||
      (settings.tours.length > 0 && help.loading) ||
      toursLoading,
    showInSidebar: settings.showInSidebar,
    essentials,
    nextSteps: tours.filter((tour) => tour.tier === 'next'),
    essentialsDone: essentials.filter((tour) => tour.done).length,
    nextEssential: essentials.find((tour) => !tour.done) ?? null,
  };
}
