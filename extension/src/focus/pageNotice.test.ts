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

afterEach(() => {
  host()?.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('showPageNotice', () => {
  it('shows the notice for a few seconds', () => {
    vi.useFakeTimers();
    show('notice');
    expect(host()).not.toBeNull();
    vi.advanceTimersByTime(6000);
    expect(host()).toBeNull();
  });

  it('keeps one cover per page, sends the fullscreen message from its button, and clears', () => {
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
    expect(document.querySelectorAll('#spartboard-focus-notice')).toHaveLength(
      1
    );
    const root = roots.at(-1);
    expect(root?.textContent).toContain(COVER_TEXT);
    root?.querySelector('button')?.click();
    expect(sendMessage).toHaveBeenCalledWith({
      type: FOCUS_FULLSCREEN_MESSAGE,
    });
    show('none');
    expect(host()).toBeNull();
  });
});
