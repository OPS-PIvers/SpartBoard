import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installDragSelectEnhancer } from './contentEditableDragSelect';

/**
 * `caretPositionFromPoint` isn't implemented in jsdom, so we stub it
 * before each test to return the editor's first text node at offset 0.
 * That lets the installer's drag-start path run end-to-end and we can
 * observe whether `e.preventDefault()` was called — the core gating
 * behavior these tests guard.
 */
const stubCaretAt = (node: Node, offset: number) => {
  type CaretAPI = {
    caretPositionFromPoint: (
      x: number,
      y: number
    ) => { offsetNode: Node; offset: number } | null;
  };
  (document as unknown as CaretAPI).caretPositionFromPoint = () => ({
    offsetNode: node,
    offset,
  });
};

const setUserAgent = (ua: string) => {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    configurable: true,
  });
};

const setMatchMedia = (coarse: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q === '(pointer: coarse)' ? coarse : false,
    media: q,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
};

describe('installDragSelectEnhancer — preventDefault gating', () => {
  let editor: HTMLDivElement;
  let cleanup: (() => void) | undefined;
  const originalUA = navigator.userAgent;
  const originalMatchMedia = window.matchMedia;
  const originalCaretAPI = (
    document as unknown as { caretPositionFromPoint?: unknown }
  ).caretPositionFromPoint;

  let textNode: Text;

  beforeEach(() => {
    editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.innerHTML = '<div>Hello world</div>';
    document.body.appendChild(editor);
    const para = editor.querySelector('div');
    if (!para?.firstChild) throw new Error('test fixture: missing text node');
    textNode = para.firstChild as Text;
    stubCaretAt(textNode, 0);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    document.body.removeChild(editor);
    setUserAgent(originalUA);
    window.matchMedia = originalMatchMedia;
    (
      document as unknown as { caretPositionFromPoint?: unknown }
    ).caretPositionFromPoint = originalCaretAPI;
  });

  it('calls preventDefault on Chromium desktop (pointer: fine)', () => {
    setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    setMatchMedia(false);
    cleanup = installDragSelectEnhancer(editor);

    const evt = new MouseEvent('mousedown', {
      button: 0,
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10,
    });
    Object.defineProperty(evt, 'target', { value: textNode });
    editor.dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(true);
  });

  it('skips preventDefault on Firefox (no clamp bug)', () => {
    setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0'
    );
    setMatchMedia(false);
    cleanup = installDragSelectEnhancer(editor);

    const evt = new MouseEvent('mousedown', {
      button: 0,
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10,
    });
    Object.defineProperty(evt, 'target', { value: textNode });
    editor.dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(false);
  });

  it('skips preventDefault on Safari (no clamp bug)', () => {
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
    );
    setMatchMedia(false);
    cleanup = installDragSelectEnhancer(editor);

    const evt = new MouseEvent('mousedown', {
      button: 0,
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10,
    });
    Object.defineProperty(evt, 'target', { value: textNode });
    editor.dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(false);
  });

  it('skips preventDefault on Chromium mobile (pointer: coarse)', () => {
    // Chrome on Android — Chromium UA but touch primary input. Skipping
    // here preserves virtual-keyboard / long-press selection handles.
    setUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    );
    setMatchMedia(true);
    cleanup = installDragSelectEnhancer(editor);

    const evt = new MouseEvent('mousedown', {
      button: 0,
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10,
    });
    Object.defineProperty(evt, 'target', { value: textNode });
    editor.dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(false);
  });
});
