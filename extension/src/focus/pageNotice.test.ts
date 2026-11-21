import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COVER_TEXT,
  COVER_TITLE,
  FOCUS_FULLSCREEN_MESSAGE,
  NOTICE_TEXT,
  showPageNotice,
  type PageNoticeKind,
} from './pageNotice';

const show = (kind: PageNoticeKind) =>
  showPageNotice(
    kind,
    NOTICE_TEXT,
    COVER_TITLE,
    COVER_TEXT,
    FOCUS_FULLSCREEN_MESSAGE
  );
const host = () => document.getElementById('spartboard-focus-notice');
const coverHost = () => document.getElementById('spartboard-focus-cover');

afterEach(() => {
  host()?.remove();
  coverHost()?.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('showPageNotice', () => {
  it('shows the notice for a few seconds', () => {
    vi.useFakeTimers();
    show('notice');
    expect(host()).not.toBeNull();
    vi.advanceTimersByTime(6000);
    expect(host()).toBeNull();
  });

  it('keeps one cover per page, sends the fullscreen message from its button, and clears', async () => {
    const sendMessage = vi.fn(() => Promise.resolve());
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const roots: ShadowRoot[] = [];
    const real = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'attachShadow'
    )?.value as (this: Element, init: ShadowRootInit) => ShadowRoot;
    vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (
      this: Element,
      init: ShadowRootInit
    ) {
      const root = real.call(this, { ...init, mode: 'open' });
      roots.push(root);
      return root;
    });
    show('cover');
    show('cover');
    expect(document.querySelectorAll('#spartboard-focus-cover')).toHaveLength(
      1
    );
    const root = roots.at(-1);
    // A notice on the same page leaves the cover in place.
    show('notice');
    expect(coverHost()).not.toBeNull();
    expect(root?.textContent).toContain(COVER_TEXT);
    const button = root?.querySelector('button');
    // Focus that slips out (a click on the background, a blur) comes straight back.
    button?.blur();
    await Promise.resolve();
    expect(root?.activeElement).toBe(button);
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    root?.querySelector('div')?.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(root?.activeElement).toBe(button);
    expect(root?.querySelector('div')?.tabIndex).toBe(-1);
    root?.querySelector('button')?.click();
    expect(sendMessage).toHaveBeenCalledWith({
      type: FOCUS_FULLSCREEN_MESSAGE,
    });
    show('none');
    expect(coverHost()).toBeNull();
  });

  it("doesn't ping-pong with a page that traps focus itself", async () => {
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn() } });
    const real = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'attachShadow'
    )?.value as (this: Element, init: ShadowRootInit) => ShadowRoot;
    vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (
      this: Element,
      init: ShadowRootInit
    ) {
      return real.call(this, { ...init, mode: 'open' });
    });
    const trap = document.createElement('input');
    document.body.append(trap);
    const pulls = vi.spyOn(trap, 'focus');
    // The page's modal pulls focus back whenever it lands on the cover.
    const pull = (e: FocusEvent) => {
      if ((e.target as Element).id === 'spartboard-focus-cover') trap.focus();
    };
    document.addEventListener('focusin', pull);
    try {
      show('cover');
      await new Promise((r) => setTimeout(r, 20));
      expect(pulls.mock.calls.length).toBeLessThanOrEqual(4);
    } finally {
      document.removeEventListener('focusin', pull);
      trap.remove();
    }
  });
});
