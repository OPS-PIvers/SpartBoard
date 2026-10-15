import { describe, it, expect, beforeEach } from 'vitest';
import type { ChangelogWidgetNote } from '@/hooks/useChangelog';
import { dismissWidgetWhatsNew, pickWidgetNote } from './useWidgetWhatsNew';

const NOW = new Date('2026-10-20T12:00:00').getTime();
const DAY = 24 * 60 * 60 * 1000;

const note = (
  id: string,
  widget: ChangelogWidgetNote['widget'],
  date: string,
  extra: Partial<ChangelogWidgetNote> = {}
): ChangelogWidgetNote => ({ id, widget, date, text: `${id} text`, ...extra });

const NOTES: ChangelogWidgetNote[] = [
  note('clock-new', 'clock', '2026-10-15'),
  note('cal-new', 'calendar', '2026-10-10', { tourSetId: 'set-1' }),
  note('cal-old', 'calendar', '2026-10-01'),
  note('dice-old', 'dice', '2026-08-01'),
];

const open = {
  dismissed: [],
  firstSeen: {},
  now: NOW,
  canUseFeature: () => true,
};

describe('pickWidgetNote', () => {
  it('returns the newest note for the widget type with its tour', () => {
    expect(pickWidgetNote(NOTES, 'calendar', open)).toEqual({
      id: 'cal-new',
      text: 'cal-new text',
      tourSetId: 'set-1',
    });
  });

  it('falls back to an older note once the newer one is dismissed', () => {
    expect(
      pickWidgetNote(NOTES, 'calendar', { ...open, dismissed: ['cal-new'] })?.id
    ).toBe('cal-old');
  });

  it('skips ungated notes older than 30 days and widget types with no note', () => {
    expect(pickWidgetNote(NOTES, 'dice', open)).toBeNull();
    expect(pickWidgetNote(NOTES, 'text', open)).toBeNull();
  });

  it('skips notes dated in the future', () => {
    const early = new Date('2026-10-05T12:00:00').getTime();
    expect(pickWidgetNote(NOTES, 'clock', { ...open, now: early })).toBeNull();
  });

  describe('gated notes', () => {
    const gated = [note('quiz-timer', 'quiz', '2026-08-01', { feature: 'f' })];

    it('wait until the teacher can use the feature', () => {
      expect(
        pickWidgetNote(gated, 'quiz', { ...open, canUseFeature: () => false })
      ).toBeNull();
    });

    it('run 30 days from when the teacher first sees them, not from the date', () => {
      expect(pickWidgetNote(gated, 'quiz', open)?.id).toBe('quiz-timer');
      const seen = { 'quiz-timer': NOW - 29 * DAY };
      expect(
        pickWidgetNote(gated, 'quiz', { ...open, firstSeen: seen })?.id
      ).toBe('quiz-timer');
      const expired = { 'quiz-timer': NOW - 31 * DAY };
      expect(
        pickWidgetNote(gated, 'quiz', { ...open, firstSeen: expired })
      ).toBeNull();
    });

    it('stop showing 180 days after the date even if never seen', () => {
      const late = new Date('2027-02-01T12:00:00').getTime();
      expect(pickWidgetNote(gated, 'quiz', { ...open, now: late })).toBeNull();
    });
  });
});

describe('dismissWidgetWhatsNew', () => {
  beforeEach(() => localStorage.clear());

  it('stores each dismissed note once', () => {
    dismissWidgetWhatsNew('a:calendar');
    dismissWidgetWhatsNew('a:calendar');
    dismissWidgetWhatsNew('b:clock');
    expect(
      JSON.parse(localStorage.getItem('widget-whats-new-dismissed') ?? '')
    ).toEqual(['a:calendar', 'b:clock']);
  });
});
