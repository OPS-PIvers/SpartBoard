import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlcNote } from '@/types';
import { useNoteDraft } from './useNoteDraft';

const addToast = vi.fn();
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));
vi.mock('@/context/useDashboard', () => ({ useDashboard: () => ({ addToast }) }));
vi.mock('@/hooks/usePlcNoteCrdt', () => ({
  usePlcNoteCrdt: () => ({ status: 'off' }),
}));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const note = {
  id: 'n1',
  title: 'T',
  body: '',
  version: 3,
  lastEditedAt: 1,
} as unknown as PlcNote;

function setup(updateNote: ReturnType<typeof vi.fn>) {
  return renderHook(() =>
    useNoteDraft({
      plcId: 'p1',
      note,
      uid: 'u1',
      canEdit: true,
      collab: false,
      updateNote,
    })
  );
}

describe('useNoteDraft failed saves', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    addToast.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('retries a save the server did not take, keeping the patch', async () => {
    const updateNote = vi
      .fn()
      .mockRejectedValueOnce(new Error('internal'))
      .mockResolvedValue(undefined);
    const { result } = setup(updateNote);
    act(() => result.current.setTitle('New title'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(updateNote).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(updateNote).toHaveBeenCalledTimes(2);
    expect(updateNote.mock.calls[1][1]).toEqual({ title: 'New title' });
    expect(updateNote.mock.calls[1][2]).toEqual({ expectedVersion: 3 });
    expect(addToast).not.toHaveBeenCalled();
  });

  it('shows the error toast after the retries run out', async () => {
    const updateNote = vi.fn().mockRejectedValue(new Error('internal'));
    const { result } = setup(updateNote);
    act(() => result.current.setTitle('New title'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500 + 1000 * (2 ** 7 - 1));
    });
    expect(updateNote).toHaveBeenCalledTimes(7);
    expect(addToast).toHaveBeenCalledTimes(1);
    expect(addToast.mock.calls[0][1]).toBe('error');
  });
});
