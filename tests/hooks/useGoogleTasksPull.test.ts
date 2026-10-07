import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const callableMock = vi.fn();
const applyMock = vi.fn<(...args: unknown[]) => Promise<void>>();

vi.mock('firebase/functions', () => ({
  httpsCallable: () => callableMock,
}));
vi.mock('@/config/firebase', () => ({
  auth: { currentUser: { uid: 'me' } },
  functions: {},
  isAuthBypass: false,
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'me' } }),
}));
vi.mock('@/utils/plcActionItemDone', () => ({
  applyActionItemDoneChanges: (...args: unknown[]) => applyMock(...args),
  readPlcNoteCollabEnabled: () => Promise.resolve(true),
}));

const { useGoogleTasksPull, GOOGLE_TASKS_PULL_INTERVAL_MS } =
  await import('@/hooks/useGoogleTasksPull');

const changes = [
  { plcId: 'p1', source: 'note', parentId: 'n1', itemId: 'a', done: true },
];

describe('useGoogleTasksPull', () => {
  beforeEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    callableMock.mockReset().mockResolvedValue({ data: { changes } });
    applyMock.mockReset().mockResolvedValue(undefined);
  });

  it('does nothing when disabled', () => {
    renderHook(() => useGoogleTasksPull('p1', false));
    expect(callableMock).not.toHaveBeenCalled();
  });

  it('pulls once per interval per user and applies the changes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);

    renderHook(() => useGoogleTasksPull('p1', true));
    renderHook(() => useGoogleTasksPull('p2', true));

    await waitFor(() => expect(applyMock).toHaveBeenCalledTimes(1));
    expect(callableMock).toHaveBeenCalledTimes(1);
    expect(callableMock).toHaveBeenCalledWith({ plcId: 'p1' });
    expect(applyMock).toHaveBeenCalledWith(changes, 'me', { collab: true });

    vi.setSystemTime(1_000_000 + GOOGLE_TASKS_PULL_INTERVAL_MS);
    renderHook(() => useGoogleTasksPull('p1', true));
    await waitFor(() => expect(callableMock).toHaveBeenCalledTimes(2));
  });
});
