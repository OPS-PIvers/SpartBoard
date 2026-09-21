import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAutosave } from '@/hooks/useAutosave';

interface Props {
  isDirty: boolean;
  draftToken: unknown;
  enabled: boolean;
  onSave: () => void | Promise<void>;
}

const setup = (props: Partial<Props> = {}) => {
  const onSave = props.onSave ?? vi.fn((): Promise<void> => Promise.resolve());
  return renderHook(
    (p: Props) =>
      useAutosave({
        isDirty: p.isDirty,
        draftToken: p.draftToken,
        enabled: p.enabled,
        delayMs: 50,
        onSave: p.onSave,
      }),
    {
      initialProps: {
        isDirty: props.isDirty ?? false,
        draftToken: props.draftToken ?? 'seed',
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

  it('does nothing while the draft is clean', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { result } = setup({ onSave });
    await new Promise((r) => setTimeout(r, 120));
    expect(onSave).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('saves once the draft has been still for the quiet period', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { result, rerender } = setup({ onSave });
    rerender({ isDirty: true, draftToken: 'a', enabled: true, onSave });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.status).toBe('saved'));
  });

  it('restarts the quiet period on each edit, so typing produces one write', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { rerender } = setup({ onSave });
    for (const token of ['a', 'b', 'c', 'd']) {
      rerender({ isDirty: true, draftToken: token, enabled: true, onSave });
      await new Promise((r) => setTimeout(r, 15));
    }
    expect(onSave).not.toHaveBeenCalled();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  // Regression: an editor that persists a normalized copy of its draft can
  // leave `isDirty` permanently true. Re-saving on that alone would write to
  // Firestore every cycle for as long as the editor stayed open.
  it('does not write again while the draft itself has not moved', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { rerender } = setup({ onSave });
    rerender({ isDirty: true, draftToken: 'a', enabled: true, onSave });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 200));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('writes again once the draft moves on', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { rerender } = setup({ onSave });
    rerender({ isDirty: true, draftToken: 'a', enabled: true, onSave });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    rerender({ isDirty: true, draftToken: 'b', enabled: true, onSave });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  });

  it('stays off while disabled', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { rerender } = setup({ onSave });
    rerender({ isDirty: true, draftToken: 'a', enabled: false, onSave });
    await new Promise((r) => setTimeout(r, 150));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('flush saves outstanding work without waiting out the quiet period', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { result, rerender } = setup({ onSave });
    rerender({ isDirty: true, draftToken: 'a', enabled: true, onSave });
    await act(async () => {
      await result.current.flush();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('flush is a no-op when the current draft was already written', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { result, rerender } = setup({ onSave });
    rerender({ isDirty: true, draftToken: 'a', enabled: true, onSave });
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
    rerender({ isDirty: true, draftToken: 'a', enabled: true, onSave });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.message).toBe('offline');

    await act(async () => {
      await result.current.flush();
    });
    expect(onSave).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.status).toBe('saved'));
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
    rerender({ isDirty: true, draftToken: 'a', enabled: true, onSave });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    rerender({ isDirty: true, draftToken: 'b', enabled: true, onSave });
    await act(async () => {
      await result.current.flush();
    });
    await new Promise((r) => setTimeout(r, 150));
    expect(peak).toBe(1);
  });
});
