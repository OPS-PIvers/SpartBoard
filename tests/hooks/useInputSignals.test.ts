import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import type { InputSignalCounts } from '@/types';
import { parseWritingLog, textAfter } from '@/utils/writingLog';
import { INPUT_SIGNALS_FLUSH_EVENT } from '@/utils/inputSignals';
import {
  useInputSignals,
  type UseInputSignalsArgs,
} from '@/hooks/useInputSignals';

const scripted = new WeakSet<Event>();
vi.mock('@/utils/eventTrust', () => ({
  isTrustedEvent: (e: Event) => !scripted.has(e),
}));

const environment = vi.hoisted(() => ({
  detect: vi.fn(() => new Promise<never>(() => undefined)),
}));
vi.mock('@/utils/quizEnvironment', () => ({
  detectQuizEnvironment: environment.detect,
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
      questionId: 'q1',
      serverSignals: undefined,
      save,
      ...over,
    },
  });
  return { save, ...hook };
}

// A frozen clock keeps time-on-question out of the exact-match checks.
beforeEach(() => {
  vi.spyOn(performance, 'now').mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  document.body.innerHTML = '';
});

describe('useInputSignals', () => {
  it('saves when a turn-in is about to lock the attempt', () => {
    const { save } = setup();
    document.body.dispatchEvent(mouse('pointerdown', 10, 10));
    document.dispatchEvent(new CustomEvent(INPUT_SIGNALS_FLUSH_EVENT));
    expect(save).toHaveBeenCalledExactlyOnceWith(0, { q1: { clicks: 1 } });
  });

  it('saves the question just left, added to an earlier page load', () => {
    const { save, rerender } = setup({
      serverSignals: { '0': { q1: { clicks: 2 } } },
    });
    document.body.dispatchEvent(mouse('pointerdown', 10, 10));
    document.body.dispatchEvent(mouse('pointerdown', 400, 400));
    rerender({
      enabled: true,
      ready: true,
      attempt: 0,
      questionId: 'q2',
      serverSignals: undefined,
      save,
    });
    expect(save).toHaveBeenCalledExactlyOnceWith(0, {
      q1: { clicks: 4, jumpClicks: 1 },
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
      q1: { scripted: 1 },
    });
  });

  it('saves under the attempt it recorded when the attempt is turned in', () => {
    const { save, rerender } = setup({ attempt: 1 });
    document.body.dispatchEvent(mouse('pointerdown', 10, 10));
    rerender({
      enabled: false,
      ready: true,
      attempt: 2,
      questionId: 'q1',
      serverSignals: undefined,
      save,
    });
    expect(save).toHaveBeenCalledExactlyOnceWith(1, { q1: { clicks: 1 } });
  });

  it('keeps earlier counts across a pause and resume', () => {
    const { save, rerender, unmount } = setup();
    const props = {
      enabled: true,
      ready: true,
      attempt: 0,
      questionId: 'q1',
      serverSignals: undefined,
      save,
    };
    document.body.dispatchEvent(mouse('pointerdown', 10, 10));
    rerender({ ...props, enabled: false });
    rerender(props);
    document.body.dispatchEvent(mouse('pointerdown', 12, 12));
    unmount();
    expect(save).toHaveBeenLastCalledWith(0, { q1: { clicks: 2 } });
  });

  it('records and saves nothing while off', () => {
    const { save, unmount } = setup({ enabled: false });
    document.body.dispatchEvent(mouse('pointerdown', 10, 10));
    unmount();
    expect(save).not.toHaveBeenCalled();
  });

  it('logs edits to a written answer and counts revisions', () => {
    const { save, unmount } = setup();
    const box = document.createElement('textarea');
    document.body.appendChild(box);
    const edit = (value: string, inputType = 'insertText') => {
      box.dispatchEvent(new InputEvent('beforeinput', { bubbles: true }));
      box.value = value;
      box.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType, data: null })
      );
    };
    edit('c');
    edit('ca');
    edit('c', 'deleteContentBackward');
    edit('cat');
    unmount();
    const saved = save.mock.calls[0][1].q1;
    expect(saved.dels).toBe(1);
    expect(saved.delChars).toBe(1);
    const { edits } = parseWritingLog(saved.log);
    expect(textAfter(edits, edits.length)).toBe('cat');
  });

  it('counts a page that narrows while the window keeps its size', () => {
    const { save, unmount } = setup();
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
      value: width - 380,
      configurable: true,
    });
    window.dispatchEvent(new Event('resize'));
    Object.defineProperty(window, 'innerWidth', {
      value: width,
      configurable: true,
    });
    unmount();
    expect(save.mock.calls[0][1].q1.panelOpens).toBe(1);
  });

  it('saves the browser and profile the attempt ran in', async () => {
    environment.detect.mockResolvedValueOnce({
      browser: 'Firefox 131, Windows',
      profile: 'no-extension',
    } as never);
    const { save, unmount } = setup();
    await Promise.resolve();
    await Promise.resolve();
    unmount();
    expect(save).toHaveBeenCalledExactlyOnceWith(0, {
      _: { browser: 'Firefox 131, Windows', profile: 'no-extension' },
    });
  });
});
