import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DialogContext,
  type DialogContextValue,
} from '@/context/DialogContextValue';
import {
  ViewAsContext,
  type ViewAsContextValue,
} from '@/context/ViewAsContextValue';
import { useViewAsOutward, VIEW_AS_LOCKED_TITLE } from './useViewAsOutward';

const recordMock = vi.fn((_label: string) => Promise.resolve());
vi.mock('@/utils/viewAsAudit', () => ({
  recordViewAsOutward: (label: string) => recordMock(label),
}));

const session = (readOnly: boolean): ViewAsContextValue => ({
  sid: 's',
  targetUid: 'u',
  targetEmail: 'teacher@orono.k12.mn.us',
  adminTarget: false,
  expiresAt: Date.now() + 60_000,
  readOnly,
  canUnlock: true,
  renew: vi.fn(),
  unlock: vi.fn(),
  end: vi.fn(),
});

function wrap(viewAs: ViewAsContextValue | null, confirmResult = true) {
  const showConfirm = vi.fn(() => Promise.resolve(confirmResult));
  const dialog = { showConfirm } as unknown as DialogContextValue;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <DialogContext.Provider value={dialog}>
      <ViewAsContext.Provider value={viewAs}>{children}</ViewAsContext.Provider>
    </DialogContext.Provider>
  );
  return { wrapper, showConfirm };
}

describe('useViewAsOutward', () => {
  it('passes straight through outside view-as', async () => {
    const { wrapper, showConfirm } = wrap(null);
    const { result } = renderHook(() => useViewAsOutward(), { wrapper });
    expect(result.current.locked).toBe(false);
    expect(result.current.lockedTitle).toBeUndefined();
    let ok = false;
    await act(async () => {
      ok = await result.current.confirm('Assign');
    });
    expect(ok).toBe(true);
    expect(showConfirm).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('locks while read-only', async () => {
    const { wrapper, showConfirm } = wrap(session(true));
    const { result } = renderHook(() => useViewAsOutward(), { wrapper });
    expect(result.current.locked).toBe(true);
    expect(result.current.lockedTitle).toBe(VIEW_AS_LOCKED_TITLE);
    let ok = true;
    await act(async () => {
      ok = await result.current.confirm('Assign');
    });
    expect(ok).toBe(false);
    expect(showConfirm).not.toHaveBeenCalled();
  });

  it('confirms and audits when unlocked', async () => {
    const { wrapper, showConfirm } = wrap(session(false));
    const { result } = renderHook(() => useViewAsOutward(), { wrapper });
    let ok = false;
    await act(async () => {
      ok = await result.current.confirm('Assign');
    });
    expect(ok).toBe(true);
    expect(showConfirm).toHaveBeenCalledWith(
      'As teacher@orono.k12.mn.us',
      expect.objectContaining({ title: 'Assign', confirmLabel: 'Assign' })
    );
    expect(recordMock).toHaveBeenCalledWith('Assign');
  });

  it('does not audit a cancelled confirm', async () => {
    recordMock.mockClear();
    const { wrapper } = wrap(session(false), false);
    const { result } = renderHook(() => useViewAsOutward(), { wrapper });
    let ok = true;
    await act(async () => {
      ok = await result.current.confirm('Assign');
    });
    expect(ok).toBe(false);
    expect(recordMock).not.toHaveBeenCalled();
  });
});
