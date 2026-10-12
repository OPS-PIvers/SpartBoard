import { describe, it, expect, beforeEach } from 'vitest';
import type { ChangelogEntry } from '@/hooks/useChangelog';
import { dismissWidgetWhatsNew, pickWidgetNote } from './useWidgetWhatsNew';

const NOW = new Date('2026-10-20T12:00:00').getTime();

const entry = (
  version: string,
  date: string,
  notes: ChangelogEntry['widgetNotes'],
  tourSetId?: string
): ChangelogEntry => ({
  version,
  date,
  title: version,
  details: [],
  widgetNotes: notes,
  tourSetId,
});

const ENTRIES: ChangelogEntry[] = [
  entry('2026.10.15.1', '2026-10-15', [
    { widget: 'clock', text: 'Clock news' },
  ]),
  entry(
    '2026.10.10.1',
    '2026-10-10',
    [{ widget: 'calendar', text: 'Calendar news' }],
    'set-1'
  ),
  entry('2026.10.01.1', '2026-10-01', [
    { widget: 'calendar', text: 'Older calendar news' },
  ]),
  entry('2026.08.01.1', '2026-08-01', [{ widget: 'dice', text: 'Too old' }]),
];

describe('pickWidgetNote', () => {
  it('returns the newest note for the widget type with its tour', () => {
    expect(pickWidgetNote(ENTRIES, 'calendar', [], NOW)).toEqual({
      id: '2026.10.10.1:calendar',
      text: 'Calendar news',
      tourSetId: 'set-1',
    });
  });

  it('falls back to an older note once the newer one is dismissed', () => {
    expect(
      pickWidgetNote(ENTRIES, 'calendar', ['2026.10.10.1:calendar'], NOW)?.text
    ).toBe('Older calendar news');
  });

  it('skips notes older than 30 days and widget types with no note', () => {
    expect(pickWidgetNote(ENTRIES, 'dice', [], NOW)).toBeNull();
    expect(pickWidgetNote(ENTRIES, 'text', [], NOW)).toBeNull();
  });

  it('skips notes dated in the future', () => {
    const early = new Date('2026-10-05T12:00:00').getTime();
    expect(pickWidgetNote(ENTRIES, 'clock', [], early)).toBeNull();
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
