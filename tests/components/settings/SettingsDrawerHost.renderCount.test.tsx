import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { SettingsDrawerHost } from '@/components/settings/SettingsDrawerHost';
import { makeBoard, makeWidget, renderWithCanvas } from './settingsHostHarness';

const renders = { count: 0 };
const bump = () => {
  renders.count += 1;
};

vi.mock('@/components/settings/SettingsDrawer', () => ({
  SettingsDrawer: React.memo(function MockDrawer() {
    bump();
    return <div data-testid="mock-drawer" />;
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: () => true,
    featurePermissions: [],
    selectedBuildings: [],
    savedWidgetConfigs: {},
    saveWidgetDefault: vi.fn(),
    dockPosition: 'bottom',
    settingsDrawerWidth: 400,
    updateUserPreference: vi.fn(),
    isAdmin: false,
  }),
}));

afterEach(() => {
  cleanup();
});

describe('SettingsDrawerHost render isolation (§4.8)', () => {
  it('dragging a non-edited widget produces zero SettingsDrawer renders', () => {
    const edited = makeWidget({ id: 'edited', flipped: true });
    const other = makeWidget({ id: 'other' });
    const harness = renderWithCanvas(
      <SettingsDrawerHost />,
      makeBoard([edited, other])
    );
    expect(renders.count).toBeGreaterThan(0);
    renders.count = 0;

    for (let i = 1; i <= 20; i += 1) {
      harness.setState({
        activeDashboard: makeBoard([edited, { ...other, x: i * 5, y: i }]),
      });
    }

    expect(renders.count).toBe(0);
  });
});
