import { describe, expect, it } from 'vitest';
import {
  buildDetailRows,
  compassPoint,
  moonPhase,
  parseEarthNetworksDetails,
  sunTimes,
} from './details';

const ORONO = { lat: 44.99082, lon: -93.59635 };
const minutesCentral = (ms: number) => {
  const d = new Date(ms - 5 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

describe('weather details', () => {
  it('computes Orono sunrise and sunset within a few minutes of NOAA', () => {
    // NOAA for 2026-10-26 Orono, MN: sunrise 7:44 AM CDT, sunset 6:11 PM CDT.
    const times = sunTimes(
      new Date('2026-10-26T17:00:00Z'),
      ORONO.lat,
      ORONO.lon
    );
    if (!times) throw new Error('no sun times');
    expect(
      Math.abs(minutesCentral(times.sunrise) - (7 * 60 + 44))
    ).toBeLessThanOrEqual(3);
    expect(
      Math.abs(minutesCentral(times.sunset) - (18 * 60 + 11))
    ).toBeLessThanOrEqual(3);
  });

  it('names moon phases by Central calendar day', () => {
    // Full moon 2026-10-25 11:12 PM CDT; WeatherBug shows waning gibbous on Oct 26.
    expect(moonPhase(new Date('2026-10-25T05:00:00Z'))).toBe('fullMoon');
    expect(moonPhase(new Date('2026-10-26T05:00:00Z'))).toBe('waningGibbous');
    // New moon 2026-11-09 1:02 AM CST, last quarter 2026-11-01 2:28 PM CST.
    expect(moonPhase(new Date('2026-11-09T06:00:00Z'))).toBe('newMoon');
    expect(moonPhase(new Date('2026-11-01T06:00:00Z'))).toBe('lastQuarter');
    expect(moonPhase(new Date('2026-11-03T06:00:00Z'))).toBe('waningCrescent');
  });

  it('maps degrees to compass points', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(53)).toBe('NE');
    expect(compassPoint(67.5)).toBe('ENE');
    expect(compassPoint(359)).toBe('N');
  });

  it('parses the station feed and drops fields with no reading', () => {
    const details = parseEarthNetworksDetails({
      o: {
        t: 41.3,
        ic: 264,
        dp: 41.3,
        h: 100,
        psl: 30.25,
        rd: null,
        wsa: 4.2,
        wda: 53,
        wgh: 11.4,
      },
      hl: { th: 45.8, tl: 39.4 },
    });
    const rows = buildDetailRows(
      [
        'dewPoint',
        'humidity',
        'pressure',
        'rainDaily',
        'windAvg',
        'windGust',
        'highLow',
      ],
      {
        details,
        feelsLike: 41,
        now: new Date('2026-10-26T20:00:00Z'),
        ...ORONO,
        locale: 'en-US',
        t: (key) => key,
      }
    );
    expect(rows.map((r) => [r.field, r.value])).toEqual([
      ['dewPoint', '41°'],
      ['humidity', '100%'],
      ['pressure', '30.25 in'],
      ['windAvg', 'NE 4 mph'],
      ['windGust', '11 mph'],
      ['highLow', '46° / 39°'],
    ]);
  });
});
