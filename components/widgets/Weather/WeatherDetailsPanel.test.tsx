import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeatherDetailsLayout } from './WeatherDetailsPanel';
import type { DetailRow } from './details';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key.split('.').pop() ?? key }),
}));

const ORONO = { lat: 44.99082, lon: -93.59635 };
const rise = Date.parse('2026-10-27T12:47:00Z');
const set = Date.parse('2026-10-27T23:11:00Z');

const ROWS: DetailRow[] = [
  { field: 'sunrise', value: '7:47', unit: 'AM', time: rise },
  { field: 'sunset', value: '6:11', unit: 'PM', time: set },
  { field: 'windAvg', value: 'ENE 10', unit: 'mph', direction: 67 },
  { field: 'humidity', value: '92', unit: '%' },
  { field: 'moon', value: 'Waning gibbous', phase: 0.55 },
];

describe('WeatherDetailsLayout instruments', () => {
  const OriginalObserver = global.ResizeObserver;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-27T18:30:00Z'));
    global.ResizeObserver = class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() {
        this.cb(
          [{ contentRect: { width: 900, height: 460 } } as ResizeObserverEntry],
          this
        );
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    };
  });
  afterEach(() => {
    vi.useRealTimers();
    global.ResizeObserver = OriginalObserver;
  });

  it('groups readings into instruments and points the wind arrow downwind', () => {
    const { container } = render(
      <WeatherDetailsLayout rows={ROWS} {...ORONO} color="#334155">
        <div>face</div>
      </WeatherDetailsLayout>
    );
    expect(screen.getByTestId('weather-instrument-sun')).toBeTruthy();
    expect(screen.getByTestId('weather-instrument-wind')).toBeTruthy();
    expect(screen.getByTestId('weather-instrument-wet')).toBeTruthy();
    expect(screen.getByTestId('weather-instrument-moon')).toBeTruthy();
    expect(screen.queryByTestId('weather-instrument-air')).toBeNull();
    expect(container.querySelector('g[transform="rotate(247)"]')).toBeTruthy();
  });

  it('places the sun along its path by the time of day', () => {
    const { container } = render(
      <WeatherDetailsLayout rows={ROWS} {...ORONO} color="#334155">
        <div>face</div>
      </WeatherDetailsLayout>
    );
    const sun = screen.getByTestId('weather-instrument-sun');
    const dot = sun.querySelector('circle');
    // 1:30 PM is a little past the middle of a 7:47 AM to 6:11 PM day, so right of center.
    expect(Number(dot?.getAttribute('cx'))).toBeGreaterThan(50);
    expect(Number(dot?.getAttribute('cy'))).toBeLessThan(10);
    expect(container.textContent).toContain('Waning gibbous');
  });
});
