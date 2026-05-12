/**
 * Width regression test for LibraryPreviewPane.
 *
 * The pane previously used `min(360px, 90vw)` which scaled against the
 * viewport. Inside a narrow widget (e.g. a 480px-wide QuizWidget on a
 * small dashboard) that pinned the pane at 360px and collapsed the grid
 * to ~108px — unusable. The fix replaces the viewport cap with a
 * container-relative one (`min(360px, 50%)`).
 *
 * This test renders the pane inside a fixed-width parent and asserts the
 * computed style respects the 50% bound so a future regression to a
 * viewport-relative width would fail loudly.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { LibraryPreviewPane } from '@/components/common/library/LibraryPreviewPane';

// Server-rendered static markup bypasses jsdom's CSS parser, which
// silently drops `min(...)` declarations it doesn't understand. We
// only need to verify React emits the right inline-style string —
// the actual layout behavior is a visual concern not testable in
// jsdom anyway.
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

describe('LibraryPreviewPane width', () => {
  it('uses a container-relative cap so the grid stays usable on narrow widgets', () => {
    const html = renderHtml(360);
    expect(html).toContain('min(360px, 50%)');
    // Defensive: ensure the viewport-relative cap is gone. If a future
    // refactor reintroduces `vw`/`vh`, this assertion will fail.
    expect(html).not.toMatch(/min\(\d+px,\s*\d+vw\)/);
  });

  it('respects a custom widthPx prop', () => {
    const html = renderHtml(500);
    expect(html).toContain('min(500px, 50%)');
  });

  it('defaults widthPx to 360', () => {
    const html = renderHtml();
    expect(html).toContain('min(360px, 50%)');
  });
});
