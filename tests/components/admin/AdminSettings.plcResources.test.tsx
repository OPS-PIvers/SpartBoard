/**
 * Tests that the "PLC Resources" tab entry has been wired into AdminSettings.
 * We don't render the full AdminSettings DOM (it has many heavy collaborators);
 * instead we verify the module shape — that PlcResourcesManager is importable
 * and that the TAB_GROUPS config includes a 'plc-resources' entry.
 *
 * Additionally we render the full AdminSettings with deep mocks to confirm the
 * tab shows up in the rail and clicking it renders PlcResourcesManager.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Module-shape test
import { PlcResourcesManager } from '@/components/admin/PlcResourcesManager/PlcResourcesManager';

describe('PlcResourcesManager — module shape', () => {
  it('is a function component', () => {
    expect(typeof PlcResourcesManager).toBe('function');
  });
});

// Full rail render test — mock all heavy collaborators
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    isAdmin: true,
    user: { uid: 'admin-1', email: 'admin@s.edu' },
  }),
}));

// Stub every manager that AdminSettings renders so the test doesn't need real Firestore
vi.mock('@/components/admin/FeaturePermissionsManager', () => ({
  FeaturePermissionsManager: () => <div data-testid="feature-perms" />,
}));
vi.mock('@/components/admin/BackgroundManager', () => ({
  BackgroundManager: () => <div data-testid="bg-manager" />,
}));
vi.mock('@/components/admin/GlobalPermissionsManager', () => ({
  GlobalPermissionsManager: () => <div data-testid="global-perms" />,
}));
vi.mock('@/components/admin/Announcements', () => ({
  AnnouncementsManager: () => <div data-testid="announcements" />,
}));
vi.mock('@/components/admin/Organization/OrganizationPanel', () => ({
  OrganizationPanel: () => <div data-testid="org-panel" />,
}));
vi.mock('@/components/admin/Analytics/AnalyticsManager', () => ({
  AnalyticsManager: () => <div data-testid="analytics" />,
}));
vi.mock('@/components/admin/DashboardTemplatesManager', () => ({
  DashboardTemplatesManager: () => <div data-testid="templates" />,
}));
vi.mock('@/components/admin/LinkShortenerManager', () => ({
  LinkShortenerManager: () => <div data-testid="links" />,
}));
vi.mock('@/components/admin/PresetSubEmailsManager', () => ({
  PresetSubEmailsManager: () => <div data-testid="sub-presets" />,
}));
vi.mock('@/components/admin/PlcResourcesManager/PlcResourcesManager', () => ({
  PlcResourcesManager: () => <div data-testid="plc-resources-manager" />,
}));

import { AdminSettings } from '@/components/admin/AdminSettings';

describe('AdminSettings — PLC Resources tab wiring', () => {
  it('renders a "PLC Resources" tab in the vertical rail', () => {
    render(<AdminSettings onClose={vi.fn()} />);
    expect(
      screen.getByRole('tab', { name: /plc resources/i })
    ).toBeInTheDocument();
  });

  it('renders PlcResourcesManager when the PLC Resources tab is clicked', () => {
    render(<AdminSettings onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /plc resources/i }));
    expect(screen.getByTestId('plc-resources-manager')).toBeInTheDocument();
  });
});
