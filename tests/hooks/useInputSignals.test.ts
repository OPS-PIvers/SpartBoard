import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import type { InputSignalCounts } from '@/types';
import {
  useInputSignals,
  type UseInputSignalsArgs,
} from '@/hooks/useInputSignals';

const scripted = new WeakSet<Event>();
vi.mock('@/utils/eventTrust', () => ({
  isTrustedEvent: (e: Event) => !scripted.has(e),
}));

type Save = (
  attempt: number,
  counts: Record<string, InputSignalCounts>
) => Promise<void>;

const mouse = (type: string, x: number, y: number, trusted = true) => {
  const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(e, 'pointerType', { value: 'mouse' });
  if (!trusted) scripted.add(e);
  return e;
};

function setup(over: Partial<UseInputSignalsArgs> = {}) {
  const save = vi.fn<Save>(() => Promise.resolve());
  const hook = renderHook((p: UseInputSignalsArgs) => useInputSignals(p), {
    initialProps: {
      enabled: true,
      ready: true,
      attempt: 0,
      questionIndex: 0,
      serverSignals: undefined,
      save,
      ...over,
    },
  });
  return { save, ...hook };
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('useInputSignals', () => {
  it('saves the question just left, added to an earlier page load', () => {
    const { save, rerender } = setup({
      serverSignals: { '0': { '0': { clicks: 2 } } },
    });
    document.body.dispatchEvent(mouse('pointerdown', 10, 10));
    document.body.dispatchEvent(mouse('pointerdown', 400, 400));
    rerender({
      enabled: true,
      ready: true,
      attempt: 0,
      questionIndex: 1,
      serverSignals: undefined,
      save,
    });
    expect(save).toHaveBeenCalledExactlyOnceWith(0, {
      '0': { clicks: 4, jumpClicks: 1 },
    });
  });

  it('counts a scripted click on an answer button but not a real one', () => {
    const { save, unmount } = setup();
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.dispatchEvent(mouse('click', 5, 5));
    button.dispatchEvent(mouse('click', 5, 5, false));
    unmount();
    expect(save).toHaveBeenCalledExactlyOnceWith(0, {
      '0': { scripted: 1 },
    });
  });

  it('saves under the attempt it recorded when the attempt is turned in', () => {
    const { save, rerender } = setup({ attempt: 1 });
    document.body.dispatchEvent(mouse('pointerdown', 10, 10));
    rerender({
      enabled: false,
      ready: true,
      attempt: 2,
      questionIndex: 0,
      serverSignals: undefined,
      save,
    });
    expect(save).toHaveBeenCalledExactlyOnceWith(1, { '0': { clicks: 1 } });
  });

  it('keeps earlier counts across a pause and resume', () => {
    const { save, rerender, unmount } = setup();
    const props = {
      enabled: true,
      ready: true,
      attempt: 0,
      questionIndex: 0,
      serverSignals: undefined,
      save,
    };
    document.body.dispatchEvent(mouse('pointerdown', 10, 10));
    rerender({ ...props, enabled: false });
    rerender(props);
    document.body.dispatchEvent(mouse('pointerdown', 12, 12));
    unmount();
    expect(save).toHaveBeenLastCalledWith(0, { '0': { clicks: 2 } });
  });

  it('records and saves nothing while off', () => {
    const { save, unmount } = setup({ enabled: false });
    document.body.dispatchEvent(mouse('pointerdown', 10, 10));
    unmount();
    expect(save).not.toHaveBeenCalled();
  });
});
