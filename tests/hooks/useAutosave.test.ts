import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAutosave } from '@/hooks/useAutosave';

interface Props {
  draftToken: unknown;
  resetKey?: unknown;
  enabled: boolean;
  onSave: () => void | Promise<void>;
}

const setup = (props: Partial<Props> = {}) => {
  const onSave = props.onSave ?? vi.fn((): Promise<void> => Promise.resolve());
  return renderHook(
    (p: Props) =>
      useAutosave({
        draftToken: p.draftToken,
        resetKey: p.resetKey,
        enabled: p.enabled,
        delayMs: 50,
        onSave: p.onSave,
      }),
    {
      initialProps: {
        draftToken: props.draftToken ?? 'seed',
        resetKey: props.resetKey ?? 'item-1',
        enabled: props.enabled ?? true,
        onSave,
      },
    }
  );
};

describe('useAutosave', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing until the draft moves', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { result } = setup({ onSave });
    await new Promise((r) => setTimeout(r, 120));
    expect(onSave).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('saves once the draft has been still for the quiet period', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { result, rerender } = setup({ onSave });
    rerender({ draftToken: 'a', resetKey: 'item-1', enabled: true, onSave });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.status).toBe('saved'));
  });

  it('restarts the quiet period on each edit, so typing produces one write', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { rerender } = setup({ onSave });
    for (const token of ['a', 'b', 'c', 'd']) {
      rerender({
        draftToken: token,
        resetKey: 'item-1',
        enabled: true,
        onSave,
      });
      await new Promise((r) => setTimeout(r, 15));
    }
    expect(onSave).not.toHaveBeenCalled();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  // Regression: an editor that persists a normalized copy of its draft used to
  // stay dirty forever. Keying on what was written, not on dirtiness, means a
  // settled draft is written once however long the editor stays open.
  it('does not write again while the draft itself has not moved', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { rerender } = setup({ onSave });
    rerender({ draftToken: 'a', resetKey: 'item-1', enabled: true, onSave });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 200));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('writes again once the draft moves on', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { rerender } = setup({ onSave });
    rerender({ draftToken: 'a', resetKey: 'item-1', enabled: true, onSave });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    rerender({ draftToken: 'b', resetKey: 'item-1', enabled: true, onSave });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  });

  it('stays off while disabled', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { rerender } = setup({ onSave });
    rerender({ draftToken: 'a', resetKey: 'item-1', enabled: false, onSave });
    await new Promise((r) => setTimeout(r, 150));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('flush saves outstanding work without waiting out the quiet period', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { result, rerender } = setup({ onSave });
    rerender({ draftToken: 'a', resetKey: 'item-1', enabled: true, onSave });
    await act(async () => {
      await result.current.flush();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('flush is a no-op when the current draft was already written', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { result, rerender } = setup({ onSave });
    rerender({ draftToken: 'a', resetKey: 'item-1', enabled: true, onSave });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await act(async () => {
      await result.current.flush();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('reports a failed write and retries it on flush', async () => {
    const onSave = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const { result, rerender } = setup({ onSave });
    rerender({ draftToken: 'a', resetKey: 'item-1', enabled: true, onSave });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.message).toBe('offline');

    await act(async () => {
      await result.current.flush();
    });
    expect(onSave).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.status).toBe('saved'));
  });

  // Regression: `flush` used to decide from `status`, which lags a render
  // behind the write it just waited out, so a save that failed as the editor
  // closed was reported as a success and the editor closed without a word.
  it('reports failure when the write it waited on failed', async () => {
    const onSave = vi.fn(
      (): Promise<void> =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('offline')), 100)
        )
    );
    const { result, rerender } = setup({ onSave });
    rerender({ draftToken: 'a', resetKey: 'item-1', enabled: true, onSave });
    // Let the quiet period elapse so the write is in flight, not scheduled.
    await new Promise((r) => setTimeout(r, 70));
    expect(onSave).toHaveBeenCalledTimes(1);

    let ok = true;
    await act(async () => {
      ok = await result.current.flush();
    });
    expect(ok).toBe(false);
  });

  // Regression: the baseline used to be the caller's `isDirty`, which compares
  // against the content the editor opened with. Typing a change, letting it
  // autosave, then typing it back left `isDirty` false while the database held
  // the intermediate value — the final edit was dropped in silence.
  it('still writes a draft edited back to its original wording', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { result, rerender } = setup({ draftToken: ['Draft'], onSave });
    rerender({
      draftToken: ['Drafts'],
      resetKey: 'item-1',
      enabled: true,
      onSave,
    });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    // Back to the wording the editor opened with. The baseline is what was
    // written, not what was opened, so this is owed a write of its own.
    rerender({
      draftToken: ['Draft'],
      resetKey: 'item-1',
      enabled: true,
      onSave,
    });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.hasUnsavedWork).toBe(false));
  });

  // The other half of dropping `isDirty`: opening a record must not write it
  // straight back out.
  it('writes nothing when pointed at a different record', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { rerender } = setup({ onSave });
    rerender({ draftToken: ['b'], resetKey: 'item-2', enabled: true, onSave });
    await new Promise((r) => setTimeout(r, 150));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('never runs two writes at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const onSave = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 60));
      inFlight -= 1;
    });
    const { result, rerender } = setup({ onSave });
    rerender({ draftToken: 'a', resetKey: 'item-1', enabled: true, onSave });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    rerender({ draftToken: 'b', resetKey: 'item-1', enabled: true, onSave });
    await act(async () => {
      await result.current.flush();
    });
    await new Promise((r) => setTimeout(r, 150));
    expect(peak).toBe(1);
  });
});
