
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { DashboardProvider } from '../context/DashboardContext';
import { DashboardContext } from '../context/DashboardContextValue';
import { WidgetType, GridPosition } from '../types';

// Mock the dependencies of DashboardContext
vi.mock('../context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'test-user', email: 'test@test.com' },
    isAdmin: false,
    refreshGoogleToken: vi.fn(),
    featurePermissions: [],
    selectedBuildings: [],
    savedWidgetConfigs: {},
    saveWidgetConfig: vi.fn(),
  }),
}));

vi.mock('../hooks/useFirestore', () => ({
  useFirestore: () => ({
    saveDashboard: vi.fn(),
    saveDashboards: vi.fn(),
    deleteDashboard: vi.fn(),
    subscribeToDashboards: vi.fn((cb) => {
        // Mock a snapshot update with a default dashboard
        cb([{
            id: 'test-db',
            name: 'Test',
            widgets: [],
            isDefault: true,
            background: 'bg-slate-900',
            createdAt: Date.now()
        }], false);
        return () => {};
    }),
    shareDashboard: vi.fn(),
    loadSharedDashboard: vi.fn(),
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
  }),
}));

vi.mock('../hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({
    driveService: null,
    userDomain: 'test.com',
  }),
}));

describe('DashboardContext AI Layout Security', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <DashboardProvider>{children}</DashboardProvider>
  );

  it('sanitizes malicious AI config (miniApp XSS)', async () => {
    const { result } = renderHook(() => React.useContext(DashboardContext), { wrapper });

    // Wait for initial load
    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    const maliciousWidgets = [
      {
        type: 'miniApp' as WidgetType,
        config: {
          html: '<script>alert("XSS")</script>',
          activeApp: { html: '<script>alert("XSS")</script>' }
        } as any
      }
    ];

    result.current.addWidgets(maliciousWidgets);

    const activeDb = result.current.activeDashboard;
    expect(activeDb?.widgets[0].config).not.toHaveProperty('html');
    expect(activeDb?.widgets[0].config).not.toHaveProperty('activeApp');
  });

  it('validates and clamps malicious gridConfig', async () => {
    const { result } = renderHook(() => React.useContext(DashboardContext), { wrapper });

    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    const maliciousWidgets = [
      {
        type: 'clock' as WidgetType,
        gridConfig: {
          col: -5,
          row: 50,
          colSpan: 20,
          rowSpan: 100
        } as GridPosition
      }
    ];

    result.current.addWidgets(maliciousWidgets);

    const activeDb = result.current.activeDashboard;
    const widget = activeDb?.widgets[0];

    // Grid system translates 0-11 to pixels.
    // -5 should clamp to 0. 50 should clamp to 11.
    // colSpan 20 should clamp to max available (12-0 = 12).
    // rowSpan 100 should clamp to max available (12-11 = 1).

    const BOARD_W = 1600;
    const BOARD_H = 900;
    const COL_W = BOARD_W / 12;
    const ROW_H = BOARD_H / 12;
    const OFFSET_X = 60;
    const OFFSET_Y = 80;
    const GRID_GAP = 16;

    expect(widget?.x).toBe(0 * COL_W + OFFSET_X);
    expect(widget?.y).toBe(11 * ROW_H + OFFSET_Y);
    expect(widget?.w).toBe(12 * COL_W - GRID_GAP);
    expect(widget?.h).toBe(1 * ROW_H - GRID_GAP);
  });

  it('handles non-numeric gridConfig values by falling back to legacy layout', async () => {
    const { result } = renderHook(() => React.useContext(DashboardContext), { wrapper });

    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    const maliciousWidgets = [
      {
        type: 'clock' as WidgetType,
        gridConfig: {
          col: 'invalid',
          row: { object: 'fail' },
          colSpan: NaN,
          rowSpan: undefined
        } as any
      }
    ];

    result.current.addWidgets(maliciousWidgets);

    const activeDb = result.current.activeDashboard;
    const widget = activeDb?.widgets[0];

    // Should use legacy fallback (index % 3 ...)
    expect(widget?.x).toBe(50); // START_X for first widget
    expect(widget?.y).toBe(80); // START_Y for first widget
  });
});
