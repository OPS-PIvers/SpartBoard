/**
 * Inline-style emission test for LibraryPreviewPane width.
 *
 * The pane previously used `min(360px, 90vw)` which scaled against the
 * viewport. Inside a narrow widget (e.g. a 480px-wide QuizWidget on a
 * small dashboard) that pinned the pane at 360px and collapsed the grid
 * to ~108px — unusable. The fix replaces the viewport cap with a
 * container-relative clamp (`clamp(240px, 50%, widthPx)`).
 *
 * This is a string-level assertion: it verifies React emits the right
 * inline-style declaration. The actual grid-usability outcome is a
 * layout-engine concern that jsdom can't evaluate; that's deliberately
 * out of scope here.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { LibraryPreviewPane } from '@/components/common/library/LibraryPreviewPane';

// Server-rendered static markup bypasses jsdom's CSS parser, which
// silently drops `clamp(...)` / `min(...)` declarations it doesn't
// understand. Effects (`useEffect` for Esc handling, focus restoration)
// don't run under SSR — that's fine here because we're only inspecting
// the emitted style attribute.
function renderHtml(widthPx?: number): string {
  return renderToStaticMarkup(
    <LibraryPreviewPane
      isOpen
      onClose={() => undefined}
      title="Preview"
      widthPx={widthPx}
    >
      <div>body</div>
    </LibraryPreviewPane>
  );
}

describe('LibraryPreviewPane width style emission', () => {
  it('emits a container-relative clamp with a 240px floor', () => {
    const html = renderHtml(360);
    expect(html).toContain('clamp(240px, 50%, 360px)');
    // Defensive: ensure no viewport-relative units leak back in. If a
    // future refactor reintroduces `vw` / `vh`, this assertion will fail.
    expect(html).not.toMatch(/\b\d+v[wh]\b/);
  });

  it('respects a custom widthPx prop', () => {
    const html = renderHtml(500);
    expect(html).toContain('clamp(240px, 50%, 500px)');
  });

  it('defaults widthPx to 360', () => {
    const html = renderHtml();
    expect(html).toContain('clamp(240px, 50%, 360px)');
  });

  it.each([
    ['zero', 0],
    ['negative', -100],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('falls back to 360 when widthPx is %s', (_label, badValue: number) => {
    const html = renderHtml(badValue);
    expect(html).toContain('clamp(240px, 50%, 360px)');
  });
});
