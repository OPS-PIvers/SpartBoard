import { describe, expect, it } from 'vitest';
import { isFrameReport, isOverlayActionMessage } from './internalMessages';

describe('internal message checks', () => {
  it('accepts well-formed frame reports only', () => {
    expect(
      isFrameReport({
        type: 'wt:found',
        token: '1:1',
        clue: 'role',
        tied: false,
        url: 'https://a.example/',
      })
    ).toBe(true);
    expect(isFrameReport({ type: 'wt:acted', token: '1:1' })).toBe(true);
    expect(
      isFrameReport({
        type: 'wt:found',
        token: '1:1',
        clue: 'position',
        tied: false,
        url: '',
      })
    ).toBe(false);
    expect(isFrameReport({ type: 'wt:acted', token: 'x'.repeat(101) })).toBe(
      false
    );
    expect(isFrameReport({ type: 'wt:next', token: '1' })).toBe(false);
    expect(isFrameReport(null)).toBe(false);
  });

  it('accepts only the three overlay actions', () => {
    expect(
      isOverlayActionMessage({ type: 'overlay/action', action: 'next' })
    ).toBe(true);
    expect(
      isOverlayActionMessage({ type: 'overlay/action', action: 'click' })
    ).toBe(false);
    expect(isOverlayActionMessage({ type: 'web-tour/start' })).toBe(false);
  });
});
