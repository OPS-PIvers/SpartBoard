import { describe, expect, it } from 'vitest';
import { isFrameReport, isOverlayActionMessage } from './internalMessages';

describe('internal message checks', () => {
  it('accepts well-formed frame reports only', () => {
    expect(
      isFrameReport({
        type: 'wt:found',
        token: '1:1',
        weak: false,
        url: 'https://a.example/',
      })
    ).toBe(true);
    expect(
      isFrameReport({
        type: 'wt:found',
        token: '1:1',
        weak: false,
        url: '',
        overlay: true,
      })
    ).toBe(true);
    expect(
      isFrameReport({
        type: 'wt:found',
        token: '1:1',
        weak: false,
        url: '',
        overlay: 'yes',
      })
    ).toBe(false);
    expect(isFrameReport({ type: 'wt:acted', token: '1:1' })).toBe(true);
    expect(
      isFrameReport({
        type: 'wt:found',
        token: '1:1',
        weak: 'no',
        url: '',
      })
    ).toBe(false);
    expect(isFrameReport({ type: 'wt:acted', token: 'x'.repeat(101) })).toBe(
      false
    );
    expect(isFrameReport({ type: 'wt:next', token: '1' })).toBe(false);
    const fix = { role: 'button', name: 'Save' };
    expect(isFrameReport({ type: 'wt:candidate', token: '1', fix })).toBe(true);
    expect(
      isFrameReport({
        type: 'wt:found',
        token: '1',
        weak: true,
        url: '',
        fix,
      })
    ).toBe(true);
    for (const bad of [
      undefined,
      'Save',
      { ...fix, frames: [] },
      { ...fix, html: '<b>' },
      { name: 'x'.repeat(501) },
    ])
      expect(
        isFrameReport({ type: 'wt:candidate', token: '1', fix: bad })
      ).toBe(false);
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
