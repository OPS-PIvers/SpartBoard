import { describe, expect, it } from 'vitest';
import { getWidgetShareLink, publishWidgetShareLink } from './widgetShareLinks';

describe('widget share links', () => {
  it("keeps the board widget's link when a copy with the same id clears its own", () => {
    const board = Symbol('board');
    const copy = Symbol('copy');
    publishWidgetShareLink('w', board, 'https://a');
    publishWidgetShareLink('w', copy, 'https://a');
    publishWidgetShareLink('w', copy, undefined);
    expect(getWidgetShareLink('w')).toBe('https://a');
    publishWidgetShareLink('w', copy, undefined);
    expect(getWidgetShareLink('w')).toBe('https://a');
    publishWidgetShareLink('w', board, undefined);
    expect(getWidgetShareLink('w')).toBeUndefined();
  });

  it('shows the most recently published link', () => {
    const a = Symbol('a');
    const b = Symbol('b');
    publishWidgetShareLink('x', a, 'https://1');
    publishWidgetShareLink('x', b, 'https://2');
    expect(getWidgetShareLink('x')).toBe('https://2');
    publishWidgetShareLink('x', a, 'https://3');
    expect(getWidgetShareLink('x')).toBe('https://3');
    publishWidgetShareLink('x', a, undefined);
    expect(getWidgetShareLink('x')).toBe('https://2');
    publishWidgetShareLink('x', b, undefined);
  });
});
