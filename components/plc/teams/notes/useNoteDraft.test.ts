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
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast }),
}));
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

type UpdateNote = Parameters<typeof useNoteDraft>[0]['updateNote'];

function setup(updateNote: ReturnType<typeof vi.fn<UpdateNote>>) {
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
      .fn<UpdateNote>()
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
    const updateNote = vi
      .fn<UpdateNote>()
      .mockRejectedValue(new Error('internal'));
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

describe('useNoteDraft retry ordering', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    addToast.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('never re-sends older text over a newer save queued behind the failed one', async () => {
    let rejectA: (e: Error) => void = () => undefined;
    const updateNote = vi
      .fn<UpdateNote>()
      .mockImplementationOnce(
        () => new Promise<void>((_, reject) => (rejectA = reject))
      )
      .mockResolvedValue(undefined);
    const { result } = setup(updateNote);
    act(() => result.current.setBody('v1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    act(() => result.current.setBody('v2'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    await act(async () => {
      rejectA(new Error('internal'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(updateNote.mock.calls[1][1]).toEqual({ body: 'v2' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const last = updateNote.mock.calls[updateNote.mock.calls.length - 1];
    expect(last[1]).toEqual({ body: 'v2' });
    expect(last[2]).toEqual({ expectedVersion: 4 });
  });
});
