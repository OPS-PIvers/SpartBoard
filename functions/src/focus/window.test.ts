import { describe, expect, it } from 'vitest';
import {
  focusExtendEndsAt,
  focusStartEndsAt,
  focusWindowEndsAt,
  parseFocusWindow,
} from './window';
import { DEFAULT_FOCUS_WINDOW } from './shared.gen';

const W = DEFAULT_FOCUS_WINDOW;
// 2026-10-28 is a Wednesday, CDT (UTC-5); 2026-12-02 is a Wednesday, CST (UTC-6).
const cdt = (hhmm: string) => Date.parse(`2026-10-28T${hhmm}:00-05:00`);
const cst = (hhmm: string) => Date.parse(`2026-12-02T${hhmm}:00-06:00`);

describe('focusWindowEndsAt', () => {
  it('returns 16:00 Chicago inside the window, in both daylight and standard time', () => {
    expect(focusWindowEndsAt(cdt('09:15'), W)).toBe(cdt('16:00'));
    expect(focusWindowEndsAt(cst('07:00'), W)).toBe(cst('16:00'));
  });

  it('is null before the start, at and after the end, and on weekends', () => {
    expect(focusWindowEndsAt(cdt('06:59'), W)).toBeNull();
    expect(focusWindowEndsAt(cdt('16:00'), W)).toBeNull();
    expect(focusWindowEndsAt(cdt('20:00'), W)).toBeNull();
    expect(
      focusWindowEndsAt(Date.parse('2026-10-31T10:00:00-05:00'), W)
    ).toBeNull();
  });

  it('uses the Chicago day, not the UTC day', () => {
    // 15:30 Friday in Chicago is already Saturday in UTC.
    const fri = Date.parse('2026-10-30T15:30:00-05:00');
    expect(focusWindowEndsAt(fri, W)).toBe(
      Date.parse('2026-10-30T16:00:00-05:00')
    );
    // 20:00 Sunday in Chicago is Monday in UTC.
    expect(
      focusWindowEndsAt(Date.parse('2026-11-01T20:00:00-06:00'), {
        ...W,
        end: '21:00',
      })
    ).toBeNull();
  });

  it('drops sub-second time so the end lands on the minute', () => {
    expect(focusWindowEndsAt(cdt('09:15') + 999, W)).toBe(cdt('16:00'));
  });
});

describe('focusStartEndsAt', () => {
  it('ends after the length, or at the window close if sooner', () => {
    expect(focusStartEndsAt(cdt('09:00'), 45, W)).toEqual({
      ok: true,
      endsAt: cdt('09:45'),
    });
    expect(focusStartEndsAt(cdt('15:40'), 60, W)).toEqual({
      ok: true,
      endsAt: cdt('16:00'),
    });
  });

  it('refuses outside the window and bad lengths', () => {
    expect(focusStartEndsAt(cdt('06:30'), 30, W)).toEqual({
      ok: false,
      reason: 'outside-window',
    });
    for (const minutes of [0, -5, 61, 2.5, NaN])
      expect(focusStartEndsAt(cdt('09:00'), minutes, W)).toEqual({
        ok: false,
        reason: 'bad-length',
      });
  });
});

describe('focusExtendEndsAt', () => {
  it('adds 10 minutes to the current end, capped at the window close', () => {
    expect(focusExtendEndsAt(cdt('09:00'), cdt('09:30'), W)).toEqual({
      ok: true,
      endsAt: cdt('09:40'),
    });
    expect(focusExtendEndsAt(cdt('15:45'), cdt('15:55'), W)).toEqual({
      ok: true,
      endsAt: cdt('16:00'),
    });
  });

  it('refuses a session that already ran out', () => {
    expect(focusExtendEndsAt(cdt('09:35'), cdt('09:30'), W)).toEqual({
      ok: false,
      reason: 'ended',
    });
  });

  it('refuses at the window close and outside the window', () => {
    expect(focusExtendEndsAt(cdt('15:50'), cdt('16:00'), W)).toEqual({
      ok: false,
      reason: 'outside-window',
    });
    expect(focusExtendEndsAt(cdt('16:05'), cdt('16:00'), W)).toEqual({
      ok: false,
      reason: 'outside-window',
    });
  });
});

describe('parseFocusWindow', () => {
  it('keeps a valid window and drops duplicate days', () => {
    expect(
      parseFocusWindow({
        start: '08:30',
        end: '15:15',
        days: [1, 1, 3],
        timeZone: 'America/Chicago',
      })
    ).toEqual({
      start: '08:30',
      end: '15:15',
      days: [1, 3],
      timeZone: 'America/Chicago',
    });
  });

  it.each([
    undefined,
    null,
    'x',
    { ...W, start: '7:00' },
    { ...W, start: '16:00', end: '07:00' },
    { ...W, end: '24:00' },
    { ...W, days: [] },
    { ...W, days: [7] },
    { ...W, days: [1.5] },
    { ...W, timeZone: 'Mars/Olympus' },
  ])('falls back to the default for %j', (raw) => {
    expect(parseFocusWindow(raw)).toEqual(W);
  });
});
