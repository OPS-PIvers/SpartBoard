import {
  WEATHER_DETAIL_FIELDS,
  type WeatherDetailField,
  type WeatherDetails,
} from '@/types';
import type { EarthNetworksResponse, OpenWeatherData } from './constants';

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function parseEarthNetworksDetails(
  data: EarthNetworksResponse
): WeatherDetails {
  const o = data.o;
  return {
    high: num(data.hl?.th),
    low: num(data.hl?.tl),
    dewPoint: num(o?.dp),
    humidity: num(o?.h),
    pressure: num(o?.psl),
    windSpeedAvg: num(o?.wsa),
    windDirectionAvg: num(o?.wda),
    windGust: num(o?.wgh),
  };
}

export function parseOpenWeatherDetails(data: OpenWeatherData): WeatherDetails {
  const hpa = num(data.main.pressure);
  const sunrise = num(data.sys?.sunrise);
  const sunset = num(data.sys?.sunset);
  return {
    // OpenWeather's current temp_max/temp_min are not the day's high and low.
    high: null,
    low: null,
    humidity: num(data.main.humidity),
    pressure: hpa === null ? null : hpa * 0.02953,
    windSpeedAvg: num(data.wind?.speed),
    windDirectionAvg: num(data.wind?.deg),
    windGust: num(data.wind?.gust),
    sunrise: sunrise === null ? null : sunrise * 1000,
    sunset: sunset === null ? null : sunset * 1000,
  };
}

export const EPA_UV_URL =
  'https://data.epa.gov/efservice/getEnvirofactsUVHOURLY/ZIP';

interface EpaUvHour {
  DATE_TIME?: unknown;
  UV_VALUE?: unknown;
}

/** EPA rows look like {DATE_TIME: "Oct/26/2026 07 AM", UV_VALUE: 3}; keeps the first day listed. */
export function parseEpaUvHours(rows: unknown): WeatherDetails['uvHours'] {
  if (!Array.isArray(rows)) return null;
  const months = 'janfebmaraprmayjunjulaugsepoctnovdec';
  let date: string | null = null;
  const values: (number | null)[] = Array.from({ length: 24 }, () => null);
  for (const row of rows as EpaUvHour[]) {
    const match =
      typeof row.DATE_TIME === 'string'
        ? /^(\w{3})\/(\d{2})\/(\d{4}) (\d{2}) (AM|PM)$/.exec(row.DATE_TIME)
        : null;
    const uv = num(row.UV_VALUE);
    if (!match || uv === null) continue;
    const month = months.indexOf(match[1].toLowerCase()) / 3 + 1;
    if (!Number.isInteger(month) || month < 1) continue;
    const day = `${match[3]}-${String(month).padStart(2, '0')}-${match[2]}`;
    date ??= day;
    if (day !== date) continue;
    values[(Number(match[4]) % 12) + (match[5] === 'PM' ? 12 : 0)] = uv;
  }
  return date ? { date, values } : null;
}

const UV_TIMEOUT_MS = 5000;

/** Fetches today's hourly UV forecast for a ZIP; falls back to `previous` if it is today's, else null. */
export async function fetchUvHours(
  zip: string,
  signal?: AbortSignal,
  previous?: WeatherDetails['uvHours']
): Promise<WeatherDetails['uvHours']> {
  const timeout = AbortSignal.timeout(UV_TIMEOUT_MS);
  const combined =
    signal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([signal, timeout])
      : timeout;
  let fresh: WeatherDetails['uvHours'] = null;
  try {
    const res = await fetch(`${EPA_UV_URL}/${zip}/JSON`, { signal: combined });
    fresh = res.ok ? parseEpaUvHours(await res.json()) : null;
  } catch {
    fresh = null;
  }
  return fresh ?? (previous?.date === localDate(new Date()) ? previous : null);
}

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const UV_LEVELS = [
  [11, 'extreme'],
  [8, 'veryHigh'],
  [6, 'high'],
  [3, 'moderate'],
  [0, 'low'],
] as const;

/** Sunrise and sunset (epoch ms) for the given local day and place, after the NOAA/suncalc formulas. */
export function sunTimes(
  date: Date,
  lat: number,
  lon: number
): { sunrise: number; sunset: number } | null {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  // From local noon, so the nearest solar transit is today's even just after midnight.
  const noon = new Date(date);
  noon.setHours(12, 0, 0, 0);
  const d = noon.getTime() / DAY_MS - 0.5 + J1970 - J2000;
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const m = RAD * (357.5291 + 0.98560028 * ds);
  const c =
    RAD *
    (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m));
  const l = m + c + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(OBLIQUITY) * Math.sin(l));
  const transit = (j: number) =>
    J2000 + j + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l);
  const cosW =
    (Math.sin(RAD * -0.833) - Math.sin(phi) * Math.sin(dec)) /
    (Math.cos(phi) * Math.cos(dec));
  if (cosW < -1 || cosW > 1) return null;
  const w = Math.acos(cosW);
  const jNoon = transit(ds);
  const jSet = transit(0.0009 + (w + lw) / (2 * Math.PI) + n);
  const jRise = jNoon - (jSet - jNoon);
  const toMs = (j: number) => (j + 0.5 - J1970) * DAY_MS;
  return { sunrise: toMs(jRise), sunset: toMs(jSet) };
}

export const MOON_PHASES = [
  'newMoon',
  'waxingCrescent',
  'firstQuarter',
  'waxingGibbous',
  'fullMoon',
  'waningGibbous',
  'lastQuarter',
  'waningCrescent',
] as const;
export type MoonPhase = (typeof MOON_PHASES)[number];

const toDays = (ms: number) => ms / DAY_MS - 0.5 + J1970 - J2000;

/** Moon phase from 0 (new) through 0.5 (full) back to 1: the moon's ecliptic longitude ahead of the sun's. */
export function moonPhaseFraction(ms: number): number {
  const d = toDays(ms);
  const sm = RAD * (357.5291 + 0.98560028 * d);
  const sunLon =
    sm +
    RAD *
      (1.9148 * Math.sin(sm) +
        0.02 * Math.sin(2 * sm) +
        0.0003 * Math.sin(3 * sm)) +
    RAD * 102.9372 +
    Math.PI;
  // Astronomical Almanac low-precision lunar longitude, good to about 0.3 degrees.
  const t = d / 36525;
  const term = (amp: number, a: number, b: number) =>
    amp * Math.sin(RAD * (a + b * t));
  const moonLon =
    RAD *
    (218.32 +
      481267.881 * t +
      term(6.29, 135.0, 477198.87) +
      term(-1.27, 259.3, -413335.36) +
      term(0.66, 235.7, 890534.22) +
      term(0.21, 269.9, 954397.74) +
      term(-0.19, 357.5, 35999.05) +
      term(-0.11, 186.5, 966404.03));
  const turn = 2 * Math.PI;
  return ((((moonLon - sunLon) % turn) + turn) % turn) / turn;
}

/** Names the day's phase the way almanacs do: new, quarter and full only on the day they happen. */
export function moonPhase(dayStart: Date): MoonPhase {
  const p0 = moonPhaseFraction(dayStart.getTime());
  const p1 = moonPhaseFraction(dayStart.getTime() + DAY_MS);
  const span = (((p1 - p0) % 1) + 1) % 1;
  const principal = [0, 0.25, 0.5, 0.75].findIndex(
    (target) => (((target - p0) % 1) + 1) % 1 < span
  );
  if (principal !== -1) return MOON_PHASES[principal * 2];
  return MOON_PHASES[Math.floor(p0 * 4) * 2 + 1];
}

const COMPASS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
] as const;

export const compassPoint = (degrees: number): string =>
  COMPASS[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16];

const isDetailField = (field: string): field is WeatherDetailField =>
  (WEATHER_DETAIL_FIELDS as readonly string[]).includes(field);

export interface DetailRow {
  field: WeatherDetailField;
  value: string;
  /** Shown smaller after the value. */
  unit?: string;
  /** Wind: compass degrees the wind blows from. */
  direction?: number;
  /** Moon: phase fraction, 0 new through 0.5 full. */
  phase?: number;
  /** Sunrise and sunset: epoch ms. */
  time?: number;
}

interface FormatInput {
  details: WeatherDetails | undefined;
  feelsLike: number | undefined;
  now: Date;
  lat: number;
  lon: number;
  locale: string;
  t: (key: string) => string;
}

type RowParts = Omit<DetailRow, 'field'>;

/** Display parts per enabled field, in order. */
export function buildDetailRows(
  fields: readonly WeatherDetailField[],
  input: FormatInput
): DetailRow[] {
  const { details = {}, feelsLike, now, lat, lon, locale, t } = input;
  const num = (v: number | null | undefined): v is number =>
    typeof v === 'number';
  const deg = (v: number): RowParts => ({ value: `${Math.round(v)}°` });
  const inches = (v: number): RowParts => ({
    value: v.toFixed(2),
    unit: '"',
  });
  const sun = sunTimes(now, lat, lon);
  // A stored time from an earlier sync is only used on the day it belongs to.
  const today = (ms: number | null | undefined) =>
    num(ms) && new Date(ms).toDateString() === now.toDateString() ? ms : null;
  const time = (ms: number | null | undefined): RowParts | null => {
    if (!num(ms)) return null;
    const parts = new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
    }).formatToParts(new Date(ms));
    const dayPeriod = parts.find((p) => p.type === 'dayPeriod')?.value;
    const clock = parts
      .filter((p) => p.type !== 'dayPeriod')
      .map((p) => p.value)
      .join('')
      .trim();
    return dayPeriod
      ? { value: clock, unit: dayPeriod, time: ms }
      : { value: clock, time: ms };
  };
  const parts = (field: WeatherDetailField): RowParts | null => {
    switch (field) {
      case 'feelsLike':
        return feelsLike === undefined ? null : deg(feelsLike);
      case 'highLow':
        return num(details.high) && num(details.low)
          ? {
              value: `${Math.round(details.high)}° / ${Math.round(details.low)}°`,
            }
          : null;
      case 'dewPoint':
        return num(details.dewPoint) ? deg(details.dewPoint) : null;
      case 'humidity':
        return num(details.humidity)
          ? { value: `${Math.round(details.humidity)}`, unit: '%' }
          : null;
      case 'pressure':
        return num(details.pressure) ? inches(details.pressure) : null;
      case 'windAvg': {
        const speed = details.windSpeedAvg;
        if (!num(speed)) return null;
        if (Math.round(speed) === 0)
          return { value: t('widgets.weather.details.calm') };
        const dir = details.windDirectionAvg;
        return {
          value: `${num(dir) ? `${compassPoint(dir)} ` : ''}${Math.round(speed)}`,
          unit: 'mph',
          ...(num(dir) ? { direction: dir } : {}),
        };
      }
      case 'windGust':
        return num(details.windGust)
          ? { value: `${Math.round(details.windGust)}`, unit: 'mph' }
          : null;
      case 'sunrise':
        return time(today(details.sunrise) ?? sun?.sunrise);
      case 'sunset':
        return time(today(details.sunset) ?? sun?.sunset);
      case 'uvIndex': {
        const uv =
          details.uvHours?.date === localDate(now)
            ? details.uvHours.values[now.getHours()]
            : null;
        if (!num(uv)) return null;
        const level = UV_LEVELS.find(([min]) => uv >= min)?.[1] ?? 'low';
        return {
          value: `${Math.round(uv)}`,
          unit: `(${t(`widgets.weather.details.uvLevels.${level}`)})`,
        };
      }
      case 'moon': {
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        return {
          value: t(`widgets.weather.moonPhases.${moonPhase(dayStart)}`),
          phase: moonPhaseFraction(now.getTime()),
        };
      }
    }
  };
  // A reading the source didn't send still keeps its place, so a teacher sees the toggle worked.
  // Drops fields saved before a reading was retired.
  return fields.filter(isDetailField).map((field) => ({
    field,
    ...(parts(field) ?? { value: '--' }),
  }));
}
