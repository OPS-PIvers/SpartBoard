import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RosterGroupReminder } from '@/types';
import { upcomingOnWeeks } from './groupSchedulePrint';

const RealDate = Date;
const ZONE = 'America/Chicago';
const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

interface Parts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  ms: number;
}

const partsOf = (t: number): Parts => {
  const ms = ((t % 1000) + 1000) % 1000;
  const p = Object.fromEntries(
    fmt.formatToParts(t).map((x) => [x.type, Number(x.value)])
  );
  return {
    y: p.year,
    mo: p.month - 1,
    d: p.day,
    h: p.hour,
    mi: p.minute,
    s: p.second,
    ms,
  };
};

const offsetAt = (t: number): number => {
  const p = partsOf(t);
  return RealDate.UTC(p.y, p.mo, p.d, p.h, p.mi, p.s, p.ms) - t;
};

const localToMs = (
  y: number,
  mo: number,
  d: number,
  h = 0,
  mi = 0,
  s = 0,
  ms = 0
): number => {
  const guess = RealDate.UTC(y, mo, d, h, mi, s, ms);
  return guess - offsetAt(guess - offsetAt(guess));
};

// A Date that reads and writes wall-clock time in America/Chicago, since worker threads cannot change TZ.
class ChicagoDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length >= 2) {
      super(
        localToMs(
          ...(args as [
            number,
            number,
            number?,
            number?,
            number?,
            number?,
            number?,
          ])
        )
      );
    } else {
      super(...(args as [number]));
    }
  }
  private p = (): Parts => partsOf(this.getTime());
  getFullYear = () => this.p().y;
  getMonth = () => this.p().mo;
  getDate = () => this.p().d;
  getHours = () => this.p().h;
  getDay = () =>
    new RealDate(RealDate.UTC(this.p().y, this.p().mo, this.p().d)).getUTCDay();
  setDate = (d: number) => {
    const p = this.p();
    return this.setTime(localToMs(p.y, p.mo, d, p.h, p.mi, p.s, p.ms));
  };
  setHours = (h: number, mi = 0, s = 0, ms = 0) => {
    const p = this.p();
    return this.setTime(localToMs(p.y, p.mo, p.d, h, mi, s, ms));
  };
}

const reminder: RosterGroupReminder = {
  enabled: true,
  days: [1],
  alerts: [{ time: '10:15', leadMinutes: 0 }],
  repeat: 'biweekly',
  startDate: '2026-10-26',
  sound: 'off',
  snoozeMinutes: 3,
  showName: false,
  showTime: false,
  showMessage: false,
  message: '',
  emailAlert: false,
  emailMessage: '',
};

describe('upcomingOnWeeks across the fall-back DST change', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps returning Mondays after clocks go back', () => {
    vi.stubGlobal('Date', ChicagoDate);
    const weeks = upcomingOnWeeks(reminder, new ChicagoDate(2026, 9, 28), 3);
    expect(weeks.map((d) => `${d.getMonth() + 1}/${d.getDate()}`)).toEqual([
      '10/26',
      '11/9',
      '11/23',
    ]);
    expect(weeks.every((d) => d.getDay() === 1)).toBe(true);
  });
});
