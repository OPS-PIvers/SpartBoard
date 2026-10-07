import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useGlobalPermissionsEditor } from './useGlobalPermissionsEditor';

const setDocMock = vi.hoisted(() => vi.fn());
const addToast = vi.hoisted(() => vi.fn());

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(() => ({})),
  getDocs: vi.fn(() => Promise.resolve({ forEach: () => undefined })),
  serverTimestamp: vi.fn(),
  setDoc: setDocMock,
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { email: 'admin@test.com' } }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast }),
}));

describe('useGlobalPermissionsEditor', () => {
  it('keeps an edit made while a save is in flight, still unsaved', async () => {
    let finish: () => void = () => undefined;
    setDocMock.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      })
    );
    const { result } = renderHook(() => useGlobalPermissionsEditor());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saved: Promise<boolean> = Promise.resolve(false);
    act(() => {
      saved = result.current.savePermission('smart-poll', undefined, '');
    });
    act(() => {
      result.current.updatePermission('smart-poll', { enabled: false });
    });
    await act(async () => {
      finish();
      await saved;
    });

    expect(result.current.getPermission('smart-poll').enabled).toBe(false);
    expect(result.current.unsavedChanges.has('smart-poll')).toBe(true);
  });
});
