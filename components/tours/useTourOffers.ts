import {
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { WidgetType } from '@/types';
import type { HelpResourceItem } from '@/types/helpCenter';
import { AuthContext } from '@/context/AuthContextValue';
import { useDashboard } from '@/context/useDashboard';
import { useSharedHelpItems } from '@/hooks/useHelpResources';
import { TOOLS } from '@/config/tools';
import { isTourRunning, requestStartTour } from './tourState';
import { tourStepsOf } from './tourSession';
import {
  getToursVersion,
  isTourRunnable,
  loadRunnableTour,
  watchTours,
} from './publishedTours';

/** Reads the published snapshot fresh each time, so a newly published tour is offered without a reload. */
export const checkLiveTour = (setId: string): Promise<boolean> =>
  loadRunnableTour(setId)
    .then((set) => !!set && tourStepsOf(set).length > 0)
    .catch(() => false);

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
export const useLiveTourSet = (
  items: readonly HelpResourceItem[]
): string | null => useFirstLiveSet(guideSetIds(items));

/** Whether this building set has a live tour, once known; false without the flag. */
export const useHasLiveTour = (setId: string | undefined): boolean =>
  useFirstLiveSet(setId ? [setId] : []) !== null;

/** The first of these building sets with a runnable published tour, once known; null while disabled. */
export function useFirstRunnableTour(
  ids: readonly string[],
  enabled: boolean
): string | null {
  const idsKey = enabled ? ids.join(',') : '';
  const subscribe = useCallback(
    (onChange: () => void) =>
      idsKey ? watchTours(idsKey.split(','), onChange) : () => undefined,
    [idsKey]
  );
  useSyncExternalStore(subscribe, getToursVersion, getToursVersion);
  if (!idsKey) return null;
  return ids.find((id) => isTourRunnable(id) === true) ?? null;
}

function useFirstLiveSet(ids: readonly string[]): string | null {
  return useFirstRunnableTour(ids, useLiveToursEnabled());
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
