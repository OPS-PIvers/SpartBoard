import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DashboardContext } from '@/context/DashboardContextValue';
import { ToastContainer } from '@/components/common/ToastContainer';
import { useAuth } from '@/context/useAuth';
import { LiveTourRunner } from '@/components/tours/LiveTourRunner';
import { TourEditorHost } from '@/components/tours/editor/TourEditorHost';
import { requestEditTour } from '@/components/tours/editor/tourEditStore';
import { requestRecordTour } from '@/components/tours/tourState';
import { TourRecordingHost } from '@/components/widgets/GuidedLearning/components/recorder/TourRecordingHost';
import type { Dashboard, Toast } from '@/types';
import { buildReadOnlyDashboardValue } from '../readOnlyDashboardValue';
import { useSubsTourRosters } from './subsTourRosters';
import {
  parseSubsTourIntent,
  stripSubsTourParams,
  type SubsTourIntent,
} from './subsTourLinks';

// One fixed board for the whole portal, so moving between screens never ends a tour.
const PORTAL_BOARD: Dashboard = {
  id: 'subs-portal',
  name: '',
  background: '',
  widgets: [],
  createdAt: 0,
};

const NOOP = () => {
  /* noop */
};

/** The tour player, and for admins the recorder and editor, over every /subs screen. */
const SubsTourLayer: React.FC = () => {
  const { isAdmin } = useAuth();
  const rosters = useSubsTourRosters();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const addToast = useCallback(
    (
      message: string,
      type: Toast['type'] = 'info',
      action?: Toast['action']
    ) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, type, action }]);
      setTimeout(() => removeToast(id), action ? 10000 : 5000);
    },
    [removeToast]
  );

  const value = useMemo(
    () =>
      buildReadOnlyDashboardValue({
        activeDashboard: PORTAL_BOARD,
        isActiveBoardReadOnly: false,
        updateWidget: NOOP,
        bringToFront: NOOP,
        rosters,
        activeRosterId: null,
        setActiveRoster: NOOP,
        toasts,
        addToast,
        removeToast,
      }),
    [rosters, toasts, addToast, removeToast]
  );

  // An Edit or Record link from Admin Settings > Help Center opens here once.
  const [intent] = useState<SubsTourIntent>(() =>
    typeof window === 'undefined'
      ? null
      : parseSubsTourIntent(window.location.search)
  );
  const handled = useRef(false);
  useEffect(() => {
    if (!intent || handled.current || isAdmin === null) return;
    handled.current = true;
    window.history.replaceState(
      window.history.state,
      '',
      stripSubsTourParams(window.location.href)
    );
    if (isAdmin !== true) return;
    if (intent.kind === 'edit')
      requestEditTour({ setId: intent.setId, origin: 'subs' });
    else requestRecordTour('subs');
  }, [intent, isAdmin]);

  return (
    <DashboardContext.Provider value={value}>
      <LiveTourRunner />
      {isAdmin === true && <TourRecordingHost />}
      {isAdmin === true && <TourEditorHost />}
      <ToastContainer />
    </DashboardContext.Provider>
  );
};

export default SubsTourLayer;
