import { describe, expect, it } from 'vitest';
import type { ScheduleConfig, ScheduleItem } from '@/types';
import { findDueWarning, markWarningFired } from './blockWarning';

const at = (h: number, m: number, s = 0) =>
  new Date(2026, 10, 12, h, m, s).getTime();

const art: ScheduleItem = {
  id: 'art',
  task: 'Art',
  startTime: '09:00',
  endTime: '09:50',
  warning: { minutes: 5, sound: 'Gong' },
};

const config = (
  items: ScheduleItem[],
  extra: Partial<ScheduleConfig> = {}
): ScheduleConfig => ({ items, ...extra });

describe('findDueWarning', () => {
  it('is not due before the warning time', () => {
    expect(findDueWarning(config([art]), at(9, 44, 59))).toBeNull();
  });

  it('is due from N minutes before the end, with the block and sound', () => {
    const due = findDueWarning(config([art]), at(9, 45));
    expect(due?.key).toBe('art');
    expect(due?.block).toEqual({
      endsAt: at(9, 50),
      task: 'Art',
      minutes: 5,
      sound: 'Gong',
    });
  });

  it('fires late while the block is still running', () => {
    expect(findDueWarning(config([art]), at(9, 48))).not.toBeNull();
  });

  it('skips a block that already ended', () => {
    expect(findDueWarning(config([art]), at(9, 50))).toBeNull();
  });

  it('fires once a day', () => {
    const fired = { art: '2026-11-12' };
    expect(
      findDueWarning(config([art], { warningsFired: fired }), at(9, 46))
    ).toBeNull();
    const yesterday = { art: '2026-11-11' };
    expect(
      findDueWarning(config([art], { warningsFired: yesterday }), at(9, 46))
    ).not.toBeNull();
  });

  it('ignores items without a warning and one-offs for other days', () => {
    const plain = { ...art, warning: undefined };
    const other = { ...art, oneOffDate: '2026-11-13' };
    expect(findDueWarning(config([plain]), at(9, 46))).toBeNull();
    expect(findDueWarning(config([other]), at(9, 46))).toBeNull();
  });

  it('starts a long warning at the block start for a short block', () => {
    const short = {
      ...art,
      endTime: '09:03',
      warning: { minutes: 5, sound: 'Chime' },
    };
    expect(findDueWarning(config([short]), at(9, 0))).not.toBeNull();
  });

  it('defaults the sound to Chime', () => {
    const noSound = { ...art, warning: { minutes: 5 } };
    expect(findDueWarning(config([noSound]), at(9, 46))?.block.sound).toBe(
      'Chime'
    );
  });
});

describe('markWarningFired', () => {
  it('keeps only today and adds the key', () => {
    const marks = markWarningFired(
      config([art], {
        warningsFired: { old: '2026-11-01', same: '2026-11-12' },
      }),
      'art',
      at(9, 46)
    );
    expect(marks).toEqual({ same: '2026-11-12', art: '2026-11-12' });
  });
});
