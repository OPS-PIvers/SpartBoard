import { describe, expect, it } from 'vitest';
import {
  getWindowState,
  formatOpensLabel,
  resolveEffectiveWindow,
} from './assignmentWindow';

describe('getWindowState', () => {
  it('defaults to open when neither openAt nor closeAt is set', () => {
    expect(getWindowState({}, Date.now())).toBe('open');
  });

  it('is upcoming before openAt', () => {
    const now = 1_000_000;
    expect(getWindowState({ openAt: now + 1 }, now)).toBe('upcoming');
  });

  it('is open at exactly openAt (boundary)', () => {
    const now = 1_000_000;
    expect(getWindowState({ openAt: now }, now)).toBe('open');
  });

  it('is open just before closeAt', () => {
    const now = 1_000_000;
    expect(getWindowState({ closeAt: now + 1 }, now)).toBe('open');
  });

  it('is closed at exactly closeAt (boundary)', () => {
    const now = 1_000_000;
    expect(getWindowState({ closeAt: now }, now)).toBe('closed');
  });

  it('is closed after closeAt', () => {
    const now = 1_000_000;
    expect(getWindowState({ closeAt: now - 1 }, now)).toBe('closed');
  });

  it('honors both openAt and closeAt together', () => {
    const openAt = 1000;
    const closeAt = 2000;
    expect(getWindowState({ openAt, closeAt }, 500)).toBe('upcoming');
    expect(getWindowState({ openAt, closeAt }, 1500)).toBe('open');
    expect(getWindowState({ openAt, closeAt }, 2000)).toBe('closed');
  });
});

describe('resolveEffectiveWindow', () => {
  it('falls back to the session window with no pointer', () => {
    expect(resolveEffectiveWindow({ openAt: 100, closeAt: 200 }, null)).toEqual(
      { openAt: 100, closeAt: 200 }
    );
  });

  it('lets the pointer top-level window win per field', () => {
    expect(
      resolveEffectiveWindow({ openAt: 100, closeAt: 200 }, { closeAt: 500 })
    ).toEqual({ openAt: 100, closeAt: 500 });
  });

  it('keeps an earlier per-student close', () => {
    expect(
      resolveEffectiveWindow({ closeAt: 200 }, { closeAt: 150 }).closeAt
    ).toBe(150);
  });

  it('returns undefined fields when neither side has a window', () => {
    expect(resolveEffectiveWindow(null, null)).toEqual({
      openAt: undefined,
      closeAt: undefined,
    });
  });
});

describe('formatOpensLabel', () => {
  it('includes the "Opens" prefix', () => {
    expect(formatOpensLabel(Date.now())).toMatch(/^Opens /);
  });
});
