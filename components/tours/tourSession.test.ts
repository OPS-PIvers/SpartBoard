import { describe, expect, it } from 'vitest';
import { isDestructiveAnchor } from '@/config/tourAnchors';
import { teacherMustClick } from './tourSession';

describe('teacherMustClick', () => {
  it('defaults to true only for anchors registered as destructive', () => {
    expect(isDestructiveAnchor('widget.close')).toBe(true);
    expect(isDestructiveAnchor('sidebar.clear-board')).toBe(true);
    expect(isDestructiveAnchor('sidebar.boards')).toBe(false);
    expect(isDestructiveAnchor('dock.item:dice')).toBe(false);
    expect(isDestructiveAnchor('nope')).toBe(false);
    expect(teacherMustClick({ anchor: 'widget.close' })).toBe(true);
    expect(teacherMustClick({ anchor: 'sidebar.boards' })).toBe(false);
  });

  it('lets the step override the default', () => {
    expect(
      teacherMustClick({ anchor: 'widget.close', teacherMustClick: false })
    ).toBe(false);
    expect(
      teacherMustClick({ anchor: 'sidebar.boards', teacherMustClick: true })
    ).toBe(true);
  });
});
