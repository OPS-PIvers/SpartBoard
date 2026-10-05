import type { User } from 'firebase/auth';
import type { AuthContextType } from '@/context/AuthContextValue';
import type { DashboardContextValue } from '@/context/DashboardContextValue';
import { HARNESS_UID, type HarnessAuthOverrides } from './fixtures/types';
import { mockAuth, mockDashboard } from '@/components/student/studentMocks';
import { FEATURE_DEFAULTS } from '@/config/featureDefaults';
import { resolveAuthBypassFeatureOverride } from '@/utils/authBypassFeatureOverrides';
import type {
  ClassRoster,
  Dashboard,
  GlobalFeature,
  WidgetData,
} from '@/types';

const HARNESS_USER = {
  uid: HARNESS_UID,
  email: 'teacher@example.com',
  displayName: 'Harness Teacher',
  emailVerified: true,
  isAnonymous: false,
  photoURL: null,
  providerData: [],
  getIdToken: () => Promise.resolve('harness-token'),
} as unknown as User;

// What a teacher sees with no permission docs saved; localStorage overrides still apply.
const teacherCanAccessFeature = (featureId: GlobalFeature): boolean =>
  resolveAuthBypassFeatureOverride(featureId, undefined, window.localStorage) ??
  FEATURE_DEFAULTS[featureId]?.missingDocPublic === true;

export const buildHarnessAuth = (
  overrides: HarnessAuthOverrides = {}
): AuthContextType => ({
  ...mockAuth,
  user: HARNESS_USER,
  isAdmin: false,
  canAccessFeature: teacherCanAccessFeature,
  hasOrg: true,
  userTier: 'org',
  ...overrides,
});

export interface HarnessDashboardInput {
  dashboard: Dashboard;
  rosters: ClassRoster[];
  loading: boolean;
  selectedWidgetId: string | null;
  setSelectedWidgetId: (id: string | null) => void;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
  removeWidget: (id: string) => void;
  bringToFront: (id: string) => void;
}

export const buildHarnessDashboard = (
  input: HarnessDashboardInput
): DashboardContextValue => ({
  ...mockDashboard,
  dashboards: [input.dashboard],
  activeDashboard: input.dashboard,
  loading: input.loading,
  rosters: input.rosters,
  activeRosterId: input.rosters[0]?.id ?? null,
  selectedWidgetId: input.selectedWidgetId,
  setSelectedWidgetId: input.setSelectedWidgetId,
  updateWidget: input.updateWidget,
  removeWidget: input.removeWidget,
  bringToFront: input.bringToFront,
  isActiveBoardReadOnly: false,
});
