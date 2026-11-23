import React, { useCallback, useMemo, useState } from 'react';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import { DashboardContext } from '@/context/DashboardContextValue';
import { ToastContainer } from '@/components/common/ToastContainer';
import { LiveTourRunner } from '@/components/tours/LiveTourRunner';
import { buildReadOnlyDashboardValue } from '@/components/subs/readOnlyDashboardValue';
import type { Dashboard, Toast } from '@/types';
import { StudentHelpButton } from './StudentHelpButton';
import { useStudentHelpTours } from './useStudentHelpTours';
import type { StudentTourIdentity } from './useStudentTourIdentity';

// One fixed board for every student page, so moving between pages never ends a tour.
const STUDENT_BOARD: Dashboard = {
  id: 'student-pages',
  name: '',
  background: '',
  widgets: [],
  createdAt: 0,
};

const NOOP = () => {
  /* noop */
};
const NO = () => false;

// Student pages mount no AuthProvider; the runner gets a student with no flags or widgets.
// user stays null, so no run log is written (students can't write tour runs).
const studentAuth = (orgId: string | null): AuthContextType =>
  ({
    user: null,
    loading: false,
    isAdmin: false,
    canAccessFeature: NO,
    canAccessWidget: NO,
    featurePermissions: [],
    featurePermissionsLoaded: true,
    globalPermissionsLoaded: true,
    orgId,
    roleId: 'student',
    dockPosition: 'bottom',
    selectedBuildings: [],
    orgBuildings: [],
    orgBuildingsLoaded: true,
    offlineGrantPresent: false,
    isExternalUser: false,
  }) as unknown as AuthContextType;

/** The tour player and Help button over student pages. */
const StudentTourLayer: React.FC<{ identity: StudentTourIdentity }> = ({
  identity,
}) => {
  const items = useStudentHelpTours(identity.orgId);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const addToast = useCallback(
    (message: string, type: Toast['type'] = 'info') => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => removeToast(id), 5000);
    },
    [removeToast]
  );
  const authValue = useMemo(
    () => studentAuth(identity.orgId),
    [identity.orgId]
  );
  const dashboard = useMemo(
    () =>
      buildReadOnlyDashboardValue({
        activeDashboard: STUDENT_BOARD,
        isActiveBoardReadOnly: false,
        updateWidget: NOOP,
        bringToFront: NOOP,
        rosters: [],
        activeRosterId: null,
        setActiveRoster: NOOP,
        toasts,
        addToast,
        removeToast,
      }),
    [toasts, addToast, removeToast]
  );

  return (
    <AuthContext.Provider value={authValue}>
      <DashboardContext.Provider value={dashboard}>
        <LiveTourRunner />
        <StudentHelpButton items={items} />
        <ToastContainer />
      </DashboardContext.Provider>
    </AuthContext.Provider>
  );
};

export default StudentTourLayer;
