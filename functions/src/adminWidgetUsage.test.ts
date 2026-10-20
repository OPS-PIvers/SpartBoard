import { describe, expect, it } from 'vitest';
import {
  MAX_TOTAL_USER_ROWS,
  MAX_WIDGET_USER_ROWS,
  rowAllowance,
  WidgetUsageTracker,
  ownUseMs,
  widgetDayCounts,
} from './adminWidgetUsage';

const DAY = 24 * 60 * 60 * 1000;
// 5 AM in Chicago, measuring the day before.
const NOW = Date.UTC(2026, 9, 20, 10);
const DAY_KEY = '2026-10-19';

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
    const usage = t.build({ now: NOW, day: DAY_KEY, members });
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

  it('ignores a stamp from a clock far in the future instead of throwing', () => {
    const t = new WidgetUsageTracker();
    t.add('clock', 'a', { uid: 'a', at: 1e17 });
    t.add('clock', 'b', { uid: 'b', at: NOW + 2 * DAY });
    const usage = t.build({ now: NOW, day: DAY_KEY, members });
    expect(usage.clock).toMatchObject({ daily: 0, monthly: 0 });
    expect(usage.clock.users.every((u) => u.lastUsedMs === 0)).toBe(true);
  });

  it('ignores use stamped by someone else, such as on a copied board', () => {
    const t = new WidgetUsageTracker();
    t.add('clock', 'a', { uid: 'b', at: NOW - 1000 });
    expect(t.build({ now: NOW, day: DAY_KEY, members }).clock).toMatchObject({
      daily: 0,
      monthly: 0,
    });
  });

  it('compares with saved days, treating a widget missing from them as zero', () => {
    const t = new WidgetUsageTracker();
    t.add('clock', 'a', { uid: 'a', at: NOW - 1000 });
    const usage = t.build({
      now: NOW,
      day: DAY_KEY,
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
    const usage = t.build({ now: NOW, day: DAY_KEY, members });
    expect(usage.note.users).toHaveLength(MAX_WIDGET_USER_ROWS);
    expect(usage.note.buildings.none).toBe(MAX_WIDGET_USER_ROWS + 5);
  });
});

describe('daily window', () => {
  it('counts only use on or after the measured district day', () => {
    const t = new WidgetUsageTracker();
    // 11:30 PM on the 18th in Chicago is within 24h of noon on the 19th but on the day before.
    t.add('clock', 'a', { uid: 'a', at: Date.UTC(2026, 9, 19, 4, 30) });
    t.add('clock', 'b', { uid: 'b', at: Date.UTC(2026, 9, 19, 14) });
    const noon = Date.UTC(2026, 9, 19, 17);
    expect(t.build({ now: noon, day: '2026-10-19', members }).clock.daily).toBe(
      1
    );
  });

  it('counts a teacher once per building even when the id repeats', () => {
    const t = new WidgetUsageTracker();
    t.add('clock', 'd', null);
    const usage = t.build({
      now: NOW,
      day: DAY_KEY,
      members: new Map([
        ['d', { email: 'd@d.org', buildingIds: ['high', 'high'] }],
      ]),
    });
    expect(usage.clock.buildings).toEqual({ high: 1 });
  });
});

describe('rowAllowance', () => {
  it('keeps small widgets whole and splits the rest within the total budget', () => {
    const sizes = new Map<string, number>([['small', 10]]);
    for (let i = 0; i < 40; i++) sizes.set(`big${i}`, 1500);
    const a = rowAllowance(sizes);
    expect(a.get('small')).toBe(10);
    const total = [...a.values()].reduce((x, y) => x + y, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_USER_ROWS);
    expect(a.get('big0')).toBe(Math.floor((MAX_TOTAL_USER_ROWS - 10) / 40));
  });
});
