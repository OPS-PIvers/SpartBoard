import type { WeatherDetailField, WeatherDetails } from '@/types';
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
    rainDaily: num(o?.rd),
    rainMonthly: num(o?.rm),
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
    high: num(data.main.temp_max),
    low: num(data.main.temp_min),
    humidity: num(data.main.humidity),
    pressure: hpa === null ? null : hpa * 0.02953,
    rainDaily: null,
    rainMonthly: null,
    windSpeedAvg: num(data.wind?.speed),
    windDirectionAvg: num(data.wind?.deg),
    windGust: num(data.wind?.gust),
    sunrise: sunrise === null ? null : sunrise * 1000,
    sunset: sunset === null ? null : sunset * 1000,
  };
}

/** Sunrise and sunset (epoch ms) for the given day and place, after the NOAA/suncalc formulas. */
export function sunTimes(
  date: Date,
  lat: number,
  lon: number
): { sunrise: number; sunset: number } | null {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = date.getTime() / DAY_MS - 0.5 + J1970 - J2000;
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

export interface DetailRow {
  field: WeatherDetailField;
  value: string;
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

/** Display text per enabled field; fields with no reading are left out. */
export function buildDetailRows(
  fields: readonly WeatherDetailField[],
  input: FormatInput
): DetailRow[] {
  const { details = {}, feelsLike, now, lat, lon, locale, t } = input;
  const deg = (v: number) => `${Math.round(v)}°`;
  const inches = (v: number) => `${v.toFixed(2)} in`;
  const sun = sunTimes(now, lat, lon);
  const time = (ms: number | null | undefined) =>
    typeof ms === 'number'
      ? new Date(ms).toLocaleTimeString(locale, {
          hour: 'numeric',
          minute: '2-digit',
        })
      : null;
  const value = (field: WeatherDetailField): string | null => {
    switch (field) {
      case 'feelsLike':
        return feelsLike === undefined ? null : deg(feelsLike);
      case 'highLow':
        return typeof details.high === 'number' &&
          typeof details.low === 'number'
          ? `${deg(details.high)} / ${deg(details.low)}`
          : null;
      case 'dewPoint':
        return typeof details.dewPoint === 'number'
          ? deg(details.dewPoint)
          : null;
      case 'humidity':
        return typeof details.humidity === 'number'
          ? `${Math.round(details.humidity)}%`
          : null;
      case 'pressure':
        return typeof details.pressure === 'number'
          ? inches(details.pressure)
          : null;
      case 'rainDaily':
        return typeof details.rainDaily === 'number'
          ? inches(details.rainDaily)
          : null;
      case 'rainMonthly':
        return typeof details.rainMonthly === 'number'
          ? inches(details.rainMonthly)
          : null;
      case 'windAvg': {
        const speed = details.windSpeedAvg;
        if (typeof speed !== 'number') return null;
        if (Math.round(speed) === 0) return t('widgets.weather.details.calm');
        const dir =
          typeof details.windDirectionAvg === 'number'
            ? `${compassPoint(details.windDirectionAvg)} `
            : '';
        return `${dir}${Math.round(speed)} mph`;
      }
      case 'windGust':
        return typeof details.windGust === 'number'
          ? `${Math.round(details.windGust)} mph`
          : null;
      case 'sunrise':
        return time(details.sunrise ?? sun?.sunrise);
      case 'sunset':
        return time(details.sunset ?? sun?.sunset);
      case 'moon': {
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        return t(`widgets.weather.moonPhases.${moonPhase(dayStart)}`);
      }
    }
  };
  return fields.flatMap((field) => {
    const text = value(field);
    return text === null ? [] : [{ field, value: text }];
  });
}
