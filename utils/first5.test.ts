import { describe, it, expect } from 'vitest';
import {
  stripTime,
  countWeekdaysBetween,
  computeCurrentDayNumber,
} from './first5';

describe('first5 utils', () => {
  describe('stripTime', () => {
    it('should strip time from a date', () => {
      const date = new Date(2023, 10, 15, 14, 30, 45); // Nov 15, 2023, 14:30:45
      const stripped = stripTime(date);
      expect(stripped.getFullYear()).toBe(2023);
      expect(stripped.getMonth()).toBe(10);
      expect(stripped.getDate()).toBe(15);
      expect(stripped.getHours()).toBe(0);
      expect(stripped.getMinutes()).toBe(0);
      expect(stripped.getSeconds()).toBe(0);
      expect(stripped.getMilliseconds()).toBe(0);
    });

    it('should handle end of month correctly', () => {
      const date = new Date(2023, 0, 31, 23, 59, 59); // Jan 31, 2023
      const stripped = stripTime(date);
      expect(stripped.getFullYear()).toBe(2023);
      expect(stripped.getMonth()).toBe(0);
      expect(stripped.getDate()).toBe(31);
    });

    it('should handle leap year (Feb 29) correctly', () => {
      const date = new Date(2024, 1, 29, 10, 0, 0); // Feb 29, 2024
      const stripped = stripTime(date);
      expect(stripped.getFullYear()).toBe(2024);
      expect(stripped.getMonth()).toBe(1);
      expect(stripped.getDate()).toBe(29);
    });
  });

  describe('countWeekdaysBetween', () => {
    it('should return 0 for the same day', () => {
      const date = new Date(2023, 10, 15); // Wed
      expect(countWeekdaysBetween(date, date)).toBe(0);
    });

    it('should count weekdays between two dates (excluding start, including end)', () => {
      const start = new Date(2023, 10, 13); // Mon
      const end = new Date(2023, 10, 15); // Wed
      expect(countWeekdaysBetween(start, end)).toBe(2); // Tue, Wed
    });

    it('should exclude weekends', () => {
      const start = new Date(2023, 10, 10); // Fri
      const end = new Date(2023, 10, 13); // Mon
      expect(countWeekdaysBetween(start, end)).toBe(1); // Only Mon
    });

    it('should return positive value if end > start', () => {
      const start = new Date(2023, 10, 13); // Mon
      const end = new Date(2023, 10, 17); // Fri
      expect(countWeekdaysBetween(start, end)).toBe(4); // Tue, Wed, Thu, Fri
    });

    it('should return negative value if end < start', () => {
      const start = new Date(2023, 10, 17); // Fri
      const end = new Date(2023, 10, 13); // Mon
      expect(countWeekdaysBetween(start, end)).toBe(-4);
    });

    it('should handle ranges spanning multiple weeks', () => {
      const start = new Date(2023, 10, 6); // Mon
      const end = new Date(2023, 10, 20); // Mon (two weeks later)
      expect(countWeekdaysBetween(start, end)).toBe(10);
    });
  });

  describe('computeCurrentDayNumber', () => {
    const referenceDate = '2023-11-13'; // A Monday
    const activeDayNumber = 10;

    it('should compute day number after rollover hour (6 AM) on the same day', () => {
      const now = new Date(2023, 10, 13, 7); // Monday at 7 AM
      expect(computeCurrentDayNumber(activeDayNumber, referenceDate, now)).toBe(
        10
      );
    });

    it('should compute day number before rollover hour (6 AM) uses previous day', () => {
      const now = new Date(2023, 10, 14, 5); // Tuesday at 5 AM
      // Effective date is Monday, so day number remains 10
      expect(computeCurrentDayNumber(activeDayNumber, referenceDate, now)).toBe(
        10
      );
    });

    it('should compute day number after rollover hour (6 AM) next day', () => {
      const now = new Date(2023, 10, 14, 7); // Tuesday at 7 AM
      expect(computeCurrentDayNumber(activeDayNumber, referenceDate, now)).toBe(
        11
      );
    });

    it('should correctly handle weekends in day number computation', () => {
      const now = new Date(2023, 10, 20, 7); // Following Monday at 7 AM
      // 5 weekdays between (Tue, Wed, Thu, Fri, Mon)
      expect(computeCurrentDayNumber(activeDayNumber, referenceDate, now)).toBe(
        15
      );
    });

    describe('rollover boundary at 6:00 AM', () => {
      it('should treat 5:59 AM as the previous calendar day', () => {
        const now = new Date(2023, 10, 14, 5, 59); // Tue 5:59 AM
        // Effective date is Monday, so day number stays at 10
        expect(
          computeCurrentDayNumber(activeDayNumber, referenceDate, now)
        ).toBe(10);
      });

      it('should treat exactly 6:00 AM as the current calendar day', () => {
        const now = new Date(2023, 10, 14, 6, 0); // Tue 6:00 AM sharp
        // Effective date is Tuesday, so day number advances to 11
        expect(
          computeCurrentDayNumber(activeDayNumber, referenceDate, now)
        ).toBe(11);
      });
    });

    describe('same-day pre-rollover relative to referenceDate', () => {
      it('should return activeDayNumber - 1 when called pre-rollover on the reference Monday', () => {
        const now = new Date(2023, 10, 13, 5); // Reference Monday, 5 AM
        // Effective date is Sunday Nov 12 — one weekday backwards from Mon = -1
        expect(
          computeCurrentDayNumber(activeDayNumber, referenceDate, now)
        ).toBe(9);
      });
    });

    describe('weekend transitions stick to Friday value', () => {
      // referenceDate Monday Nov 13 with day 10 → Fri Nov 17 = day 14
      it('returns the Friday value on Saturday', () => {
        const now = new Date(2023, 10, 18, 12); // Sat noon
        expect(
          computeCurrentDayNumber(activeDayNumber, referenceDate, now)
        ).toBe(14);
      });

      it('returns the Friday value on Sunday', () => {
        const now = new Date(2023, 10, 19, 12); // Sun noon
        expect(
          computeCurrentDayNumber(activeDayNumber, referenceDate, now)
        ).toBe(14);
      });

      it('still returns the Friday value early Monday before 6 AM', () => {
        const now = new Date(2023, 10, 20, 5); // Mon 5 AM — effective is Sun
        expect(
          computeCurrentDayNumber(activeDayNumber, referenceDate, now)
        ).toBe(14);
      });

      it('rolls over to the new Monday value at exactly 6 AM Monday', () => {
        const now = new Date(2023, 10, 20, 6); // Mon 6 AM sharp
        expect(
          computeCurrentDayNumber(activeDayNumber, referenceDate, now)
        ).toBe(15);
      });
    });
  });
});
