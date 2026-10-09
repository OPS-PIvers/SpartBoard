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
import { isLiveTourSet } from '@/components/widgets/GuidedLearning/utils/liveTour';
import { isTourRunning } from '@/components/tours/tourState';
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
  const allowed = isAdmin === true && canAccessFeature('gl-live-tours');
  const opening = useRef(false);

  const onEdit = useEffectEvent((e: Event) => {
    const req = (e as CustomEvent<TourEditRequest>).detail;
    if (!req?.setId || !allowed || opening.current) return;
    if (getTourEdit() || isTourRunning()) return;
    opening.current = true;
    void loadBuildingSet(req.setId)
      .then((set) => {
        if (!set || !isLiveTourSet(set)) {
          addToast(t('tours.unavailable'), 'error');
          return;
        }
        const at = req.stepId
          ? set.steps.findIndex((s) => s.id === req.stepId)
          : 0;
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
  if (!target || !allowed || typeof document === 'undefined') return null;
  return createPortal(
    <Suspense fallback={null}>
      <TourEditorSessionView key={target.set.id} />
    </Suspense>,
    document.body
  );
};
