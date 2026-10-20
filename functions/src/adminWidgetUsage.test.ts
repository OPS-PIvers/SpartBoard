import { describe, expect, it } from 'vitest';
import {
  MAX_WIDGET_USER_ROWS,
  WidgetUsageTracker,
  ownUseMs,
  widgetDayCounts,
} from './adminWidgetUsage';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 20, 10);

const members = new Map([
  ['a', { email: 'a@d.org', buildingIds: ['middle'] }],
  ['b', { email: 'b@d.org', buildingIds: ['middle', 'high'] }],
  ['c', { email: 'c@d.org', buildingIds: [] }],
]);

describe('ownUseMs', () => {
  it('counts only a stamp the board owner made', () => {
    expect(ownUseMs({ uid: 'a', at: 5 }, 'a')).toBe(5);
    expect(ownUseMs({ uid: 'b', at: 5 }, 'a')).toBe(0);
    expect(ownUseMs({ uid: 'a', at: 'x' }, 'a')).toBe(0);
    expect(ownUseMs(undefined, 'a')).toBe(0);
  });
});

describe('WidgetUsageTracker', () => {
  it('counts daily and monthly users once per teacher, from their latest use', () => {
    const t = new WidgetUsageTracker();
    t.add('timer', 'a', { uid: 'a', at: NOW - 40 * DAY });
    t.add('timer', 'a', { uid: 'a', at: NOW - 2 * 60 * 1000 });
    t.add('timer', 'b', { uid: 'b', at: NOW - 3 * DAY });
    t.add('timer', 'c', undefined);
    const usage = t.build({ now: NOW, members });
    expect(usage.timer).toMatchObject({
      daily: 1,
      monthly: 2,
      dailyPrev: null,
      monthlyPrev: null,
      buildings: { middle: 2, high: 1, none: 1 },
    });
    expect(usage.timer.users.map((u) => u.email)).toEqual([
      'a@d.org',
      'b@d.org',
      'c@d.org',
    ]);
    expect(usage.timer.users[2].lastUsedMs).toBe(0);
  });

  it('ignores use stamped by someone else, such as on a copied board', () => {
    const t = new WidgetUsageTracker();
    t.add('clock', 'a', { uid: 'b', at: NOW - 1000 });
    expect(t.build({ now: NOW, members }).clock).toMatchObject({
      daily: 0,
      monthly: 0,
    });
  });

  it('compares with saved days, treating a widget missing from them as zero', () => {
    const t = new WidgetUsageTracker();
    t.add('clock', 'a', { uid: 'a', at: NOW - 1000 });
    const usage = t.build({
      now: NOW,
      members,
      prevDay: { timer: { daily: 3, monthly: 9 } },
      monthAgo: { clock: { daily: 1, monthly: 4 } },
    });
    expect(usage.clock.dailyPrev).toBe(0);
    expect(usage.clock.monthlyPrev).toBe(4);
    expect(widgetDayCounts(usage)).toEqual({
      clock: { daily: 1, monthly: 1 },
    });
  });

  it('caps the user list', () => {
    const t = new WidgetUsageTracker();
    for (let i = 0; i < MAX_WIDGET_USER_ROWS + 5; i++)
      t.add('note', `u${i}`, null);
    const usage = t.build({ now: NOW, members });
    expect(usage.note.users).toHaveLength(MAX_WIDGET_USER_ROWS);
    expect(usage.note.buildings.none).toBe(MAX_WIDGET_USER_ROWS + 5);
  });
});
