import { describe, expect, it } from 'vitest';
import { revealTourAnchors, tourRevealCss } from './tourReveal';

describe('tourRevealCss', () => {
  it('shows only the hover-only controls the tour points at', () => {
    const css = tourRevealCss([
      'library-shell.folder-menu#row-*',
      'library-shell.folder-menu-new-subfolder',
    ]);
    expect(css).toContain('[data-tour="library-shell.folder-menu"]');
    expect(css).toContain(':has([data-tour="library-shell.folder-menu"])');
    expect(css).toContain(
      '[data-tour-reveal-swap="library-shell.folder-menu"]'
    );
    expect(css).not.toContain('library-shell.folder-menu#');
    expect(css).not.toContain('card-menu');
  });

  it('ignores refs that are not registered anchors', () => {
    expect(tourRevealCss(['', 'nope"]{}*{x', 'board.whole:'])).toBe(
      tourRevealCss(['board.whole'])
    );
    expect(tourRevealCss(['', 'not-an-anchor'])).toBe('');
  });
});

describe('revealTourAnchors', () => {
  it('adds one style while the tour runs and removes it after', () => {
    const undo = revealTourAnchors(['library-shell.folder-menu']);
    expect(
      document.head.querySelectorAll('style[data-tour-reveal]')
    ).toHaveLength(1);
    undo();
    expect(
      document.head.querySelectorAll('style[data-tour-reveal]')
    ).toHaveLength(0);
  });
});
