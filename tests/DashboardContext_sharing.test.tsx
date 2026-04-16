import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardProvider } from '../context/DashboardContext';
import { Dashboard } from '../types';

// Mock dependencies
const mockUser = {
  uid: 'test-user',
  displayName: 'Test User',
  email: 'test@example.com',
};

vi.mock('../context/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    isAdmin: false,
    featurePermissions: [],
    selectedBuildings: [],
    savedWidgetConfigs: {},
    saveWidgetConfig: vi.fn(),
    refreshGoogleToken: vi.fn().mockResolvedValue('mock-token'),
  }),
}));

const mockLoadSharedDashboard = vi.fn();
const mockSaveDashboard = vi.fn().mockResolvedValue(undefined);

type SubscribeCallback = (
  dashboards: Dashboard[],
  hasPendingWrites: boolean
) => void;

const mockSubscribeToDashboards = vi.fn((cb: SubscribeCallback) => {
  // Immediate callback with empty list to simulate loaded state
  cb([], false);
  return () => {
    // no-op
  };
});

vi.mock('../hooks/useFirestore', () => ({
  useFirestore: () => ({
    saveDashboard: mockSaveDashboard,
    saveDashboards: vi.fn().mockResolvedValue(undefined),
    deleteDashboard: vi.fn().mockResolvedValue(undefined),
    subscribeToDashboards: mockSubscribeToDashboards,
    shareDashboard: vi.fn(),
    loadSharedDashboard: mockLoadSharedDashboard,
    rosters: [],
    addRoster: vi.fn(),
    updateRoster: vi.fn(),
    deleteRoster: vi.fn(),
    setActiveRoster: vi.fn(),
    activeRosterId: null,
  }),
}));

vi.mock('../hooks/useRosters', () => ({
  useRosters: () => ({
    rosters: [],
    activeRosterId: null,
    addRoster: vi.fn(),
    updateRoster: vi.fn(),
    deleteRoster: vi.fn(),
    setActiveRoster: vi.fn(),
    setAbsentStudents: vi.fn(),
  }),
}));

describe('DashboardContext Sharing Logic', () => {
  const originalPathname = window.location.pathname;
  let replaceStateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Simulate visiting the share URL by updating the history state
    window.history.pushState({}, '', '/share/test-share-id');

    // Mock history.replaceState
    replaceStateMock = vi.fn();
    window.history.replaceState =
      replaceStateMock as typeof window.history.replaceState;
  });

  afterEach(() => {
    // Restore original pathname after each test
    window.history.pushState({}, '', originalPathname);
  });

  it('should load shared dashboard and duplicate it when visiting share URL', async () => {
    const sharedDashboard: Dashboard = {
      id: 'original-id',
      name: 'Shared Board',
      background: 'bg-slate-900',
      widgets: [],
      createdAt: 1234567890,
    };

    mockLoadSharedDashboard.mockResolvedValue(sharedDashboard);

    render(
      <DashboardProvider>
        <div>Test App</div>
      </DashboardProvider>
    );

    // Verify loadSharedDashboard is called
    await waitFor(
      () => {
        expect(mockLoadSharedDashboard).toHaveBeenCalledWith('test-share-id');
      },
      { timeout: 2000 }
    );

    // Verify saveDashboard is called (duplication)
    await waitFor(() => {
      expect(mockSaveDashboard).toHaveBeenCalled();
      // We might have multiple calls to saveDashboard (one for default dashboard, one for shared)
      // We need to find the one that corresponds to the shared dashboard
      const calls = mockSaveDashboard.mock.calls as Array<[Dashboard]>;
      const sharedSave = calls.find(
        (call) => call[0].name === 'Shared Board (Copy)'
      );
      expect(sharedSave).toBeDefined();
      if (sharedSave) {
        expect(sharedSave[0].id).not.toBe('original-id');
      }
    });

    // Verify URL cleanup
    await waitFor(() => {
      expect(replaceStateMock).toHaveBeenCalledWith(null, '', '/');
    });
  });
});
