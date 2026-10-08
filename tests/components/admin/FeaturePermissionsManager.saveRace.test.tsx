import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from '@testing-library/react';

const setDocMock = vi.hoisted(() => vi.fn());
const addToast = vi.hoisted(() => vi.fn());

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'col'),
  doc: vi.fn(() => ({})),
  setDoc: setDocMock,
  getDocs: vi.fn().mockResolvedValue({ forEach: vi.fn() }),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock('@/hooks/useAdminBuildings', () => ({ useAdminBuildings: () => [] }));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({ uploadWeatherImage: vi.fn() }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { email: 'admin@test.com' } }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast }),
}));

import { FeaturePermissionsManager } from '@/components/admin/FeaturePermissionsManager';

afterEach(cleanup);

describe('FeaturePermissionsManager — edit during an in-flight save', () => {
  it(
    'keeps an edit made while a save is in flight marked unsaved',
    { timeout: 30000 },
    async () => {
      let finish: () => void = () => undefined;
      setDocMock.mockReturnValue(
        new Promise<void>((resolve) => {
          finish = resolve;
        })
      );
      render(<FeaturePermissionsManager />);

      const toggle = await screen.findByRole('switch', {
        name: 'Clock enabled',
      });
      fireEvent.click(toggle);
      const save = screen.getByRole('button', { name: 'Save Clock' });
      expect(save).toBeEnabled();

      fireEvent.click(save);
      fireEvent.click(screen.getByRole('switch', { name: 'Clock enabled' }));
      await act(async () => {
        finish();
        await Promise.resolve();
      });

      expect(screen.getByRole('button', { name: 'Save Clock' })).toBeEnabled();
    }
  );
});
