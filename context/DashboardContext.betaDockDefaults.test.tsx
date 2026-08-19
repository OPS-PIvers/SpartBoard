// Regression coverage for getDefaultDockTools/resetDockToDefaults's beta-access check staying in sync with AuthContext.isBetaUser.
import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useToolVisibility } from './useToolVisibility';
import type { FeaturePermission, UserRolesConfig } from '@/types';

// ---------------------------------------------------------------------------
// Mocks (mirrors context/toolVisibility.test.tsx)
// ---------------------------------------------------------------------------

interface AuthMockShape {
  user: { uid: string; displayName: string; email: string };
  isAdmin: boolean;
  roleId: string | null;
  userRoles: UserRolesConfig | null;
  featurePermissions: FeaturePermission[];
  selectedBuildings: string[];
  savedWidgetConfigs: Record<string, unknown>;
  saveWidgetConfig: ReturnType<typeof vi.fn>;
  refreshGoogleToken: ReturnType<typeof vi.fn>;
  remoteControlEnabled: boolean;
  profileLoaded: boolean;
  setupCompleted: boolean;
}

function baseAuthMock(): AuthMockShape {
  return {
    user: {
      uid: 'test-user',
      displayName: 'Test User',
      email: 'test@example.com',
    },
    isAdmin: false,
    roleId: null,
    userRoles: null,
    featurePermissions: [],
    selectedBuildings: [],
    savedWidgetConfigs: {},
    saveWidgetConfig: vi.fn(),
    refreshGoogleToken: vi.fn(),
    remoteControlEnabled: true,
    profileLoaded: true,
    setupCompleted: true,
  };
}

let authMock: AuthMockShape = baseAuthMock();
const useAuthMock = vi.fn(() => authMock);
vi.mock('./useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({
    driveService: null,
    userDomain: 'example.com',
    isConnected: false,
  }),
}));

vi.mock('@/hooks/useFirestore', () => {
  const value = {
    saveDashboard: vi.fn().mockResolvedValue(Date.now()),
    saveDashboards: vi.fn().mockResolvedValue(undefined),
    deleteDashboard: vi.fn().mockResolvedValue(undefined),
    // This suite never needs a loaded dashboard — resetDockToDefaults only
    // reads featurePermissions/user, so the snapshot callback is unused.
    subscribeToDashboards: vi.fn(() => () => undefined),
    shareDashboard: vi.fn(),
    loadSharedDashboard: vi.fn().mockResolvedValue(null),
    rosters: [],
    addRoster: vi.fn(),
    updateRoster: vi.fn(),
    deleteRoster: vi.fn(),
    setActiveRoster: vi.fn(),
    activeRosterId: null,
  };
  return { useFirestore: () => value };
});

vi.mock('@/hooks/useRosters', () => {
  const value = {
    rosters: [],
    activeRosterId: null,
    addRoster: vi.fn(),
    updateRoster: vi.fn(),
    deleteRoster: vi.fn(),
    setActiveRoster: vi.fn(),
    setAbsentStudents: vi.fn(),
  };
  return { useRosters: () => value };
});

vi.mock('@/hooks/useCollections', () => {
  const value = {
    collections: [],
    loading: false,
    error: null,
    createCollection: vi.fn(),
    renameCollection: vi.fn(),
    moveCollection: vi.fn(),
    deleteCollection: vi.fn(),
    reorderSiblings: vi.fn(),
    setCollectionMetadata: vi.fn(),
    setCollectionDefaultBoard: vi.fn(),
  };
  return { useCollections: () => value };
});

vi.mock('@/hooks/useSharedCollection', () => {
  const value = {
    shareCollection: vi.fn().mockResolvedValue('mock-collection-share-id'),
    shareSubstituteCollection: vi
      .fn()
      .mockResolvedValue('mock-collection-sub-share-id'),
    loadSharedCollection: vi
      .fn()
      .mockResolvedValue({ ok: false, reason: 'not-found' }),
    loadSharedCollectionBoards: vi.fn().mockResolvedValue([]),
  };
  return { useSharedCollection: () => value };
});

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({
      __path: segments.join('/'),
    })),
    getDoc: vi.fn().mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    }),
    setDoc: vi.fn().mockResolvedValue(undefined),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    writeBatch: vi.fn(() => ({
      update: vi.fn(),
      delete: vi.fn(),
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    })),
    onSnapshot: vi.fn(() => () => undefined),
    serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  };
});

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const captured: { toolVis: ReturnType<typeof useToolVisibility> | null } = {
  toolVis: null,
};

const CaptureProbe: React.FC = () => {
  const toolVis = useToolVisibility();
  useEffect(() => {
    captured.toolVis = toolVis;
  });
  return null;
};

function getToolVis(): ReturnType<typeof useToolVisibility> {
  if (!captured.toolVis)
    throw new Error('Tool-visibility context not captured');
  return captured.toolVis;
}

function betaPermission(
  overrides: Partial<FeaturePermission> = {}
): FeaturePermission {
  return {
    widgetType: 'clock',
    enabled: true,
    accessLevel: 'beta',
    betaUsers: [],
    ...overrides,
  } as FeaturePermission;
}

function setup(): void {
  render(
    <DashboardProvider>
      <CaptureProbe />
    </DashboardProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  captured.toolVis = null;
  authMock = baseAuthMock();
  useAuthMock.mockImplementation(() => authMock);
});

describe('DashboardContext getDefaultDockTools beta-access parity', () => {
  it('includes a beta widget whose betaUsers entry is lowercase but the sign-in email is mixed-case', () => {
    // Mirrors real post-#2375 data: the admin panel normalizes betaUsers to
    // lowercase on write, but Firebase Auth / Google Workspace does not
    // guarantee a lowercase `user.email` on sign-in.
    authMock.user.email = 'Teacher@School.org';
    authMock.featurePermissions = [
      betaPermission({ betaUsers: ['teacher@school.org'] }),
    ];

    setup();

    act(() => {
      getToolVis().resetDockToDefaults();
    });

    expect(getToolVis().visibleTools).toContain('clock');
  });

  it('includes a beta widget granted via userRoles.betaTeachers rather than the permission betaUsers list', () => {
    authMock.user.email = 'roster-beta@school.org';
    authMock.userRoles = {
      students: [],
      teachers: [],
      betaTeachers: ['roster-beta@school.org'],
      admins: [],
      superAdmins: [],
    };
    authMock.featurePermissions = [betaPermission({ betaUsers: [] })];

    setup();

    act(() => {
      getToolVis().resetDockToDefaults();
    });

    expect(getToolVis().visibleTools).toContain('clock');
  });

  it('still excludes a beta widget for a user who is not a beta user by any source', () => {
    authMock.user.email = 'not-a-beta-user@school.org';
    authMock.featurePermissions = [
      betaPermission({ betaUsers: ['teacher@school.org'] }),
    ];

    setup();

    act(() => {
      getToolVis().resetDockToDefaults();
    });

    expect(getToolVis().visibleTools).not.toContain('clock');
  });
});
