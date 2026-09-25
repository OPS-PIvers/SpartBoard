// Pins each feature's Enabled and Daily limit toggles to an accessible name.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

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

import { FeaturesPanel } from '@/components/admin/access/FeaturesPanel';

afterEach(cleanup);

describe('FeaturesPanel — label associations', () => {
  // Toggle renders visible "ON"/"OFF" text, so assert the aria-label attribute itself.
  it('leaves no switch without an aria-label, collapsed or expanded', async () => {
    render(<FeaturesPanel />);

    const switches = await screen.findAllByRole('switch');
    expect(switches.length).toBeGreaterThan(0);
    fireEvent.click(
      document.querySelector(
        '[aria-controls="access-row-gemini-functions"]'
      ) as Element
    );
    for (const el of screen.getAllByRole('switch')) {
      expect(el).toHaveAttribute('aria-label');
    }
  });
});
