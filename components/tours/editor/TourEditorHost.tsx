import React, {
  lazy,
  Suspense,
  useEffect,
  useEffectEvent,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/useAuth';
import { useDashboardActions } from '@/context/dashboardCanvasStore';
import { loadBuildingSet } from '@/hooks/useGuidedLearning';
import {
  isLiveTourSet,
  isWebTourSet,
} from '@/components/widgets/GuidedLearning/utils/liveTour';
import { isTourRunning, type TourOrigin } from '@/components/tours/tourState';
import {
  endTourSession,
  openInHelpCenterAction,
} from '@/components/tours/helpCenterReturn';
import {
  TOUR_EDIT_EVENT,
  clearTourEdit,
  getTourEdit,
  setTourEdit,
  useTourEditTarget,
  type TourEditRequest,
} from './tourEditStore';

const TourEditorSessionView = lazy(() => import('./TourEditorSessionView'));

/** Opens the board editor on TOUR_EDIT_EVENT; the runner plays the draft beside it. */
export const TourEditorHost: React.FC = () => {
  const { t } = useTranslation();
  const { isAdmin, canAccessFeature } = useAuth();
  const { addToast } = useDashboardActions();
  const allowed = isAdmin === true;
  const opening = useRef(false);
  // The open session's tour and where it started, for the round trip on Done (H13).
  const session = useRef<{ setId: string; origin?: TourOrigin } | null>(null);

  const finish = (origin: TourOrigin | undefined, setId: string) =>
    endTourSession(origin, setId, (itemId) =>
      addToast(
        t('tours.savedToHelpCenter', {
          defaultValue: 'Saved to the Help Center as Hidden.',
        }),
        'success',
        openInHelpCenterAction(
          itemId,
          t('tours.openInHelpCenter', { defaultValue: 'Open in Help Center' })
        )
      )
    );

  const onEdit = useEffectEvent((e: Event) => {
    const req = (e as CustomEvent<TourEditRequest>).detail;
    if (!req?.setId || !allowed || opening.current) return;
    if (getTourEdit() || isTourRunning()) return;
    opening.current = true;
    void loadBuildingSet(req.setId)
      .then((set) => {
        if (!set || !isLiveTourSet(set) || isWebTourSet(set)) {
          addToast(t('tours.unavailable'), 'error');
          finish(req.origin, req.setId);
          return;
        }
        const at = req.stepId
          ? set.steps.findIndex((s) => s.id === req.stepId)
          : 0;
        session.current = { setId: set.id, origin: req.origin };
        setTourEdit({
          set,
          selected: Math.max(at, 0),
          replay: 0,
          readAloud: false,
          v2: canAccessFeature('live-tour-editing-v2'),
        });
      })
      .catch((err: unknown) => {
        console.error('Tour editor: could not load tour', err);
        addToast(t('tours.unavailable'), 'error');
        finish(req.origin, req.setId);
      })
      .finally(() => {
        opening.current = false;
      });
  });

  useEffect(() => {
    const listener = (e: Event) => onEdit(e);
    window.addEventListener(TOUR_EDIT_EVENT, listener);
    return () => window.removeEventListener(TOUR_EDIT_EVENT, listener);
  }, []);

  // Losing access mid-edit closes the editor.
  useEffect(() => {
    if (!allowed) clearTourEdit();
  }, [allowed]);
  useEffect(() => () => clearTourEdit(), []);

  const target = useTourEditTarget();
  const editing = target !== null;
  const onEnded = useEffectEvent(() => {
    const ended = session.current;
    session.current = null;
    if (ended && allowed) finish(ended.origin, ended.setId);
  });
  // The editor's Done clears the shared edit store; that ends the session.
  useEffect(() => {
    if (!editing) onEnded();
  }, [editing]);

  if (!target || !allowed || typeof document === 'undefined') return null;
  return createPortal(
    <Suspense fallback={null}>
      <TourEditorSessionView key={target.set.id} />
    </Suspense>,
    document.body
  );
};
