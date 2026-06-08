// Typed factories for the Playwright (browser-side) mocks that the e2e specs
// would otherwise inline with `(window as any)` / `(navigator as any)` casts.
// Centralising them keeps the spec call sites suppression-free.
//
// IMPORTANT: helpers here are serialised by Playwright (`addInitScript`) and
// re-evaluated inside the page, so they must be standalone — no vitest, no
// Node references, no closed-over variables. Vitest-side mocks live in
// `./mocks`.

/**
 * The window augmentation used by the clipboard mock: a host-page function
 * (`window.mockWriteText`) is exposed via Playwright's `exposeFunction`, then
 * `navigator.clipboard.writeText` is rewired to it inside an `addInitScript`.
 * Playwright's exposed bindings always resolve a promise, matching
 * `Clipboard['writeText']`'s `Promise<void>` shape. Typing the augmented
 * globals here lets the init-script body stay free of `as any` casts.
 */
interface ClipboardMockWindow extends Window {
  mockWriteText: (text: string) => Promise<void>;
}

/**
 * The function body installed via `page.addInitScript`. Playwright serialises
 * this to a string and re-evaluates it in the page, so it must be a standalone
 * function with no closed-over Node references. Pointing `navigator.clipboard`
 * at the exposed `window.mockWriteText` lets the test observe copied text.
 */
export function clipboardWriteTextInitScript(): void {
  const w = window as unknown as ClipboardMockWindow;
  // `navigator.clipboard` is `readonly` in lib.dom; widen to a mutable shape
  // so the fallback branch can install a stub when the page has no clipboard.
  const nav = navigator as { clipboard?: Pick<Clipboard, 'writeText'> };
  if (nav.clipboard) {
    nav.clipboard.writeText = (text: string) => w.mockWriteText(text);
  } else {
    nav.clipboard = {
      writeText: (text: string) => w.mockWriteText(text),
    };
  }
}
