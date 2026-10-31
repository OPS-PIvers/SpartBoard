import { describe, expect, it } from 'vitest';
import type { WeatherDetailField } from '@/types';
import {
  buildDetailRows,
  compassPoint,
  moonPhase,
  parseEarthNetworksDetails,
  parseEpaUvHours,
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

  it("keeps today's sun times just after midnight", () => {
    // Tests run in UTC, where 00:30 is past midnight but before Orono's solar midnight.
    const early = sunTimes(
      new Date('2026-10-27T00:30:00Z'),
      ORONO.lat,
      ORONO.lon
    );
    const midday = sunTimes(
      new Date('2026-10-27T17:00:00Z'),
      ORONO.lat,
      ORONO.lon
    );
    expect(early).toEqual(midday);
    expect(new Date(early?.sunrise ?? 0).toISOString().slice(0, 10)).toBe(
      '2026-10-27'
    );
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

  it('parses the station feed and keeps a placeholder for a missing reading', () => {
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
        'rainDaily' as WeatherDetailField,
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
    expect(rows.map((r) => [r.field, r.value, r.unit])).toEqual([
      ['dewPoint', '41°', undefined],
      ['humidity', '100', '%'],
      ['pressure', '30.25', '"'],
      ['windAvg', 'NE 4', 'mph'],
      ['windGust', '11', 'mph'],
      ['highLow', '46° / 39°', undefined],
    ]);
  });
  it('ignores a stored sunrise from an earlier day', () => {
    const now = new Date('2026-10-26T20:00:00Z');
    const rows = buildDetailRows(['sunrise'], {
      details: { sunrise: Date.parse('2026-10-20T12:30:00Z') },
      feelsLike: undefined,
      now,
      ...ORONO,
      locale: 'en-US',
      t: (key) => key,
    });
    const computed = sunTimes(now, ORONO.lat, ORONO.lon);
    const expected = new Date(computed?.sunrise ?? 0).toLocaleTimeString(
      'en-US',
      { hour: 'numeric', minute: '2-digit' }
    );
    expect(`${rows[0].value} ${rows[0].unit}`).toBe(expected);
  });
  it('reads the EPA hourly UV forecast for the current hour', () => {
    const uvHours = parseEpaUvHours([
      { DATE_TIME: 'Oct/26/2026 12 PM', UV_VALUE: 6 },
      { DATE_TIME: 'Oct/26/2026 01 PM', UV_VALUE: 7.4 },
      { DATE_TIME: 'Oct/27/2026 01 PM', UV_VALUE: 1 },
      { DATE_TIME: 'bad', UV_VALUE: 9 },
    ]);
    expect(uvHours?.date).toBe('2026-10-26');
    expect(uvHours?.values[12]).toBe(6);
    expect(uvHours?.values[13]).toBe(7.4);
    const row = (now: Date) =>
      buildDetailRows(['uvIndex'], {
        details: { uvHours },
        feelsLike: undefined,
        now,
        ...ORONO,
        locale: 'en-US',
        t: (key) => key,
      })[0];
    expect(row(new Date(2026, 9, 26, 13, 30))).toMatchObject({
      value: '7',
      unit: '(widgets.weather.details.uvLevels.high)',
    });
    expect(row(new Date(2026, 9, 27, 13, 30)).value).toBe('--');
  });
  it('reads EPA months in any letter case', () => {
    const uvHours = parseEpaUvHours([
      { DATE_TIME: 'OCT/27/2026 07 AM', UV_VALUE: 1 },
    ]);
    expect(uvHours?.date).toBe('2026-10-27');
    expect(uvHours?.values[7]).toBe(1);
  });
});
