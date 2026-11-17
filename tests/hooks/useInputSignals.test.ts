import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import type { InputSignalCounts } from '@/types';
import { parseWritingLog, textAfter } from '@/utils/writingLog';
import { INPUT_SIGNALS_FLUSH_EVENT } from '@/utils/inputSignals';
import {
  editorPlainText,
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

  it('hands the flush event its save promise so a turn-in can wait for it', () => {
    const { save } = setup();
    document.body.dispatchEvent(mouse('pointerdown', 10, 10));
    const saves: Promise<void>[] = [];
    document.dispatchEvent(
      new CustomEvent(INPUT_SIGNALS_FLUSH_EVENT, { detail: { saves } })
    );
    expect(save).toHaveBeenCalledTimes(1);
    expect(saves).toHaveLength(1);
  });

  it('does not save under the old attempt once it is turned in', () => {
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
    expect(save).not.toHaveBeenCalled();
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

  it('holds a large log back on a question change and hide, but not on a turn-in', () => {
    const big = `0:${'a'.repeat(40_000)}`;
    const { save, rerender } = setup({
      serverSignals: { '0': { q1: { log: big } } },
    });
    const box = document.createElement('textarea');
    box.value = 'a'.repeat(40_000);
    document.body.appendChild(box);
    box.dispatchEvent(new InputEvent('beforeinput', { bubbles: true }));
    box.value += 'b';
    box.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertText' })
    );
    rerender({
      enabled: true,
      ready: true,
      attempt: 0,
      questionId: 'q2',
      serverSignals: { '0': { q1: { log: big } } },
      save,
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    expect(save).not.toHaveBeenCalled();
    document.dispatchEvent(new CustomEvent(INPUT_SIGNALS_FLUSH_EVENT));
    expect(save).toHaveBeenCalledOnce();
  });

  it('saves a large log on pagehide without the throttle', () => {
    const big = `0:${'a'.repeat(40_000)}`;
    const { save } = setup({ serverSignals: { '0': { q1: { log: big } } } });
    const box = document.createElement('textarea');
    box.value = 'a'.repeat(40_000);
    document.body.appendChild(box);
    box.dispatchEvent(new InputEvent('beforeinput', { bubbles: true }));
    box.value += 'b';
    box.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertText' })
    );
    window.dispatchEvent(new Event('pagehide'));
    expect(save).toHaveBeenCalledOnce();
  });

  it('logs no unkeyed text when the editor turns a new line into a paragraph', () => {
    const { save, unmount } = setup();
    const box = document.createElement('div');
    Object.defineProperty(box, 'isContentEditable', { value: true });
    document.body.appendChild(box);
    const edit = (html: string, inputType = 'insertText') => {
      box.dispatchEvent(new InputEvent('beforeinput', { bubbles: true }));
      box.innerHTML = html;
      box.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType, data: null })
      );
    };
    edit('a');
    edit('a<div><br></div>', 'insertParagraph');
    // The editor rewrites the new <div> as a <p> with no input event.
    box.innerHTML = 'a<p><br></p>';
    edit('a<p>b</p>');
    unmount();
    const { edits } = parseWritingLog(save.mock.calls[0][1].q1.log);
    expect(edits.map((e) => e.kind)).toEqual(['typed', 'typed', 'typed']);
    expect(textAfter(edits, edits.length)).toBe('a\nb');
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

  it('counts a tap on an accent key as a key press for the letter it types', () => {
    const { save, unmount } = setup();
    const box = document.createElement('textarea');
    const key = document.createElement('button');
    key.setAttribute('data-typing-key', '');
    document.body.append(box, key);
    const type = (data: string) =>
      box.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data,
        })
      );
    key.dispatchEvent(mouse('pointerdown', 5, 5, false));
    type('x'.repeat(5));
    key.dispatchEvent(mouse('pointerdown', 5, 5));
    type('é'.repeat(20));
    unmount();
    expect(save.mock.calls[0][1].q1).toMatchObject({
      chars: 25,
      unkeyedChars: 5,
    });
  });

  it('counts pressing Enter on an accent key as a key press', () => {
    const { save, unmount } = setup();
    const box = document.createElement('textarea');
    const key = document.createElement('button');
    key.setAttribute('data-typing-key', '');
    document.body.append(box, key);
    key.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
    );
    box.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: 'é'.repeat(20),
      })
    );
    unmount();
    expect(save.mock.calls[0][1].q1).toMatchObject({ chars: 20 });
    expect(save.mock.calls[0][1].q1.unkeyedChars).toBeUndefined();
  });

  it('counts a second screen plugged in during the attempt', () => {
    // jsdom's Screen is no event target, so stand one in as Chrome's is.
    const target = new EventTarget();
    let isExtended = false;
    const screen = {
      get isExtended() {
        return isExtended;
      },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    };
    vi.spyOn(window, 'screen', 'get').mockReturnValue(
      screen as unknown as Screen
    );
    const { save, unmount } = setup();
    isExtended = true;
    target.dispatchEvent(new Event('change'));
    target.dispatchEvent(new Event('change'));
    unmount();
    expect(save.mock.calls[0][1].q1.extraScreen).toBe(1);
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

describe('editorPlainText', () => {
  const textOf = (html: string) => {
    const el = document.createElement('div');
    el.innerHTML = html;
    return editorPlainText(el);
  };

  it('gives one newline per Enter and two around a blank line', () => {
    expect(textOf('<p>a</p><p>b</p>')).toBe('a\nb');
    expect(textOf('<p>a</p><p><br></p><p>b</p>')).toBe('a\n\nb');
    expect(textOf('a<div>b</div><div><br></div><div>c</div>')).toBe(
      'a\nb\n\nc'
    );
  });

  it('keeps a line break inside a paragraph and drops a closing one', () => {
    expect(textOf('<p>a<br>b</p>')).toBe('a\nb');
    expect(textOf('<p>a<br><br></p>')).toBe('a\n');
    expect(textOf('<p>a</p><p><br></p>')).toBe('a\n');
  });

  it('puts list items on their own lines', () => {
    expect(textOf('<ul><li>x</li><li>y</li></ul><p>z</p>')).toBe('x\ny\nz');
  });
});
