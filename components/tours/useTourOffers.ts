import {
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { GuidedLearningSet, WidgetType } from '@/types';
import type { HelpResourceItem } from '@/types/helpCenter';
import { AuthContext } from '@/context/AuthContextValue';
import { useDashboard } from '@/context/useDashboard';
import { loadBuildingSet } from '@/hooks/useGuidedLearning';
import { useSharedHelpItems } from '@/hooks/useHelpResources';
import { TOOLS } from '@/config/tools';
import { isTourRunning, requestStartTour } from './tourState';
import { tourStepsOf } from './tourSession';

/** Sets saved before the stamp existed fall back to their steps. */
export const setHasLiveTour = (set: GuidedLearningSet): boolean =>
  set.hasLiveTour ?? tourStepsOf(set).length > 0;

const checks = new Map<string, Promise<boolean>>();
const known = new Map<string, boolean>();
const listeners = new Set<() => void>();
let version = 0;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getVersion = () => version;

/** Loads a building set once per page and caches whether it has a live tour. */
export const checkLiveTour = (setId: string): Promise<boolean> => {
  const pending = checks.get(setId);
  if (pending) return pending;
  const check = loadBuildingSet(setId)
    .then((set) => !!set && setHasLiveTour(set))
    .catch(() => false)
    .then((has) => {
      known.set(setId, has);
      version++;
      listeners.forEach((l) => l());
      return has;
    });
  checks.set(setId, check);
  return check;
};

export const __resetLiveTourCacheForTests = () => {
  checks.clear();
  known.clear();
  version = 0;
};

/** Building-set ids behind a widget type's Guided Learning help items. */
export const guideSetIds = (
  items: readonly HelpResourceItem[],
  widgetType?: WidgetType
): string[] =>
  items.flatMap((item) =>
    item.kind === 'guided-learning' &&
    item.setId &&
    (!widgetType || item.widgetTypes.includes(widgetType))
      ? [item.setId]
      : []
  );

/** The gate, read without useAuth so settings surfaces still render outside AuthProvider. */
export const useLiveToursEnabled = (): boolean =>
  useContext(AuthContext)?.canAccessFeature('gl-live-tours') ?? false;

/** The first of these help items whose set has a live tour, once known. */
export function useLiveTourSet(
  items: readonly HelpResourceItem[]
): string | null {
  const enabled = useLiveToursEnabled();
  const ids = guideSetIds(items);
  const idsKey = ids.join(',');
  useSyncExternalStore(subscribe, getVersion);

  useEffect(() => {
    if (!enabled || !idsKey) return;
    idsKey.split(',').forEach((id) => void checkLiveTour(id));
  }, [enabled, idsKey]);

  if (!enabled) return null;
  return ids.find((id) => known.get(id) === true) ?? null;
}

const offeredKey = (type: WidgetType) => `spart_tour_offered_${type}`;

const wasOffered = (type: WidgetType): boolean => {
  try {
    return localStorage.getItem(offeredKey(type)) !== null;
  } catch {
    return true;
  }
};

const markOffered = (type: WidgetType) => {
  try {
    localStorage.setItem(offeredKey(type), '1');
  } catch {
    // Storage blocked: the offer may repeat next session, which is harmless.
  }
};

const widgetLabel = (type: WidgetType): string =>
  TOOLS.find((tool) => tool.type === type)?.label ?? type;

/** Offers a widget type's live tour the first time it lands on the board. */
export function useFirstUseTourOffers(): void {
  const { t } = useTranslation();
  const { activeDashboard, addToast } = useDashboard();
  const items = useSharedHelpItems();

  const offer = useEffectEvent((type: WidgetType) => {
    if (isTourRunning() || wasOffered(type)) return;
    const ids = guideSetIds(items, type);
    if (ids.length === 0) return;
    void (async () => {
      for (const setId of ids) {
        if (!(await checkLiveTour(setId))) continue;
        if (isTourRunning() || wasOffered(type)) return;
        markOffered(type);
        addToast(t('tours.offer', { widget: widgetLabel(type) }), 'info', {
          label: t('tours.offerStart'),
          onClick: () => requestStartTour({ setId }),
        });
        return;
      }
    })();
  });

  const boardId = activeDashboard?.id;
  const typesKey = [
    ...new Set((activeDashboard?.widgets ?? []).map((w) => w.type)),
  ]
    .sort()
    .join(',');
  const seen = useRef<{ boardId?: string; types: Set<string> } | null>(null);

  // Diffing the board's widget types: switching boards resets the baseline instead of offering.
  useEffect(() => {
    const types = new Set(typesKey ? typesKey.split(',') : []);
    const prev = seen.current;
    seen.current = { boardId, types };
    if (!prev || prev.boardId !== boardId) return;
    for (const type of types) {
      if (!prev.types.has(type)) offer(type as WidgetType);
    }
  }, [boardId, typesKey]);
}

/** Mount point for the first-use offer; renders nothing. */
export const TourOfferWatcher = (): null => {
  useFirstUseTourOffers();
  return null;
};
