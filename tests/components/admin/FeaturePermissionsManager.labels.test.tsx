// Pins each tool's Enabled toggle to an accessible name.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: true }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'col'),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
  getDocs: vi.fn().mockResolvedValue({ forEach: vi.fn() }),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [],
}));

vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({ uploadWeatherImage: vi.fn() }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { email: 'admin@test.com' } }),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));

import { FeaturePermissionsManager } from '@/components/admin/FeaturePermissionsManager';

afterEach(cleanup);

describe('FeaturePermissionsManager — label associations', () => {
  it('names the Clock tool Enabled toggle', async () => {
    render(<FeaturePermissionsManager />);

    expect(
      await screen.findByRole('switch', { name: 'Clock enabled' })
    ).toBeInTheDocument();
  });

  // Toggle renders visible "ON"/"OFF" text inside the button, so a bare
  // toHaveAccessibleName() would pass via that text-content fallback even
  // with no aria-label at all — assert the attribute itself instead.
  it('leaves no switch without an aria-label ', async () => {
    render(<FeaturePermissionsManager />);

    // Wait for the tool list to settle, then check every rendered switch.
    const switches = await screen.findAllByRole('switch');
    expect(switches.length).toBeGreaterThan(0);
    for (const el of switches) {
      expect(el).toHaveAttribute('aria-label');
    }
  });

  it('names the switches a widget owns once its row is expanded', async () => {
    render(<FeaturePermissionsManager />);

    await screen.findAllByRole('switch');
    fireEvent.click(
      document.querySelector('[aria-controls="widget-row-poll"]') as Element
    );
    expect(
      screen.getByRole('switch', { name: 'Smart Polls enabled' })
    ).toBeInTheDocument();
  });
});
