// Pins each feature's "Enabled"/"Daily limit" Toggles to an accessible
// name in both the compact list view and the expanded grid view; without a
// label prop these switches share the same unnamed role="switch".

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/config/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'col'),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
  getDocs: vi.fn().mockResolvedValue({ forEach: vi.fn() }),
  addDoc: vi.fn().mockResolvedValue(undefined),
  serverTimestamp: vi.fn(() => 0),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { email: 'admin@example.com' },
    appSettings: {},
    updateAppSettings: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    uploadAdminLogo: vi.fn(),
    deleteAdminLogo: vi.fn(),
    uploading: false,
  }),
}));

import { GlobalPermissionsManager } from '@/components/admin/GlobalPermissionsManager';

afterEach(cleanup);

describe('GlobalPermissionsManager — label associations', () => {
  // Toggle renders visible "ON"/"OFF" text inside the button, so a bare
  // toHaveAccessibleName() would pass via that text-content fallback even
  // with no aria-label at all — assert the attribute itself instead.
  it('leaves no switch without an aria-label (list view)', async () => {
    render(<GlobalPermissionsManager />);

    const switches = await screen.findAllByRole('switch');
    expect(switches.length).toBeGreaterThan(0);
    for (const el of switches) {
      expect(el).toHaveAttribute('aria-label');
    }
  });

  it('leaves no switch without an aria-label (grid view)', async () => {
    render(<GlobalPermissionsManager />);

    await screen.findAllByRole('switch');
    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));

    const switches = await screen.findAllByRole('switch');
    expect(switches.length).toBeGreaterThan(0);
    for (const el of switches) {
      expect(el).toHaveAttribute('aria-label');
    }
  });
});
