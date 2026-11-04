import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminWeatherFetcher } from './AdminWeatherFetcher';
import { isStoredWeatherFresh } from './adminWeatherFreshness';

const mocks = vi.hoisted(() => ({
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  proxy: vi.fn(),
  config: {
    fetchingStrategy: 'admin_proxy',
    updateFrequencyMinutes: 15,
    temperatureRanges: [],
    source: 'earth_networks',
  },
}));

vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) => ({
    path: `${collection}/${id}`,
  }),
  getDoc: mocks.getDoc,
  setDoc: mocks.setDoc,
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => mocks.proxy,
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    featurePermissions: [{ widgetType: 'weather', config: mocks.config }],
  }),
}));

const FIFTEEN_MIN = 15 * 60 * 1000;

const snapshot = (data: Record<string, unknown> | null) => ({
  exists: () => data !== null,
  data: () => data ?? undefined,
});

describe('AdminWeatherFetcher freshness check', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('[]', { status: 200 })
    );
    mocks.getDoc.mockReset();
    mocks.setDoc.mockReset().mockResolvedValue(undefined);
    mocks.proxy
      .mockReset()
      .mockResolvedValue({ data: { o: { t: 40, ic: 0 } } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips the fetch and write when stored data is fresh', async () => {
    mocks.getDoc.mockResolvedValue(
      snapshot({
        updatedAt: Date.now() - 60 * 1000,
        source: 'earth_networks',
        temp: 40,
      })
    );

    render(<AdminWeatherFetcher />);

    await waitFor(() => expect(mocks.getDoc).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mocks.proxy).not.toHaveBeenCalled();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('fetches and writes when stored data is stale', async () => {
    mocks.getDoc.mockResolvedValue(
      snapshot({
        updatedAt: Date.now() - FIFTEEN_MIN,
        source: 'earth_networks',
      })
    );

    render(<AdminWeatherFetcher />);

    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1));
    expect(mocks.proxy).toHaveBeenCalledTimes(1);
    expect(mocks.setDoc.mock.calls[0][1]).toMatchObject({
      temp: 40,
      condition: 'sunny',
      source: 'earth_networks',
    });
  });

  it('fetches and writes when no stored data exists', async () => {
    mocks.getDoc.mockResolvedValue(snapshot(null));

    render(<AdminWeatherFetcher />);

    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1));
    expect(mocks.proxy).toHaveBeenCalledTimes(1);
  });

  it('still fetches when the freshness read fails', async () => {
    mocks.getDoc.mockRejectedValue(new Error('offline'));

    render(<AdminWeatherFetcher />);

    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1));
  });
});

describe('AdminWeatherFetcher when the station has no temperature', () => {
  const stationWithoutTemp = {
    data: { o: { t: null, fl: null, ic: 264, h: 100, wsa: 5.5 } },
  };

  beforeEach(() => {
    vi.stubEnv('VITE_OPENWEATHER_API_KEY', 'test-key');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.getDoc.mockReset().mockResolvedValue(snapshot(null));
    mocks.setDoc.mockReset().mockResolvedValue(undefined);
    mocks.proxy.mockReset().mockResolvedValue(stationWithoutTemp);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('fills temperature from OpenWeather instead of storing null', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
      Promise.resolve(
        (input instanceof Request ? input.url : input.toString()).includes(
          'openweathermap'
        )
          ? new Response(
              JSON.stringify({
                cod: 200,
                name: 'Orono',
                main: { temp: 47.3, feels_like: 44.1, humidity: 90 },
                weather: [{ main: 'Clouds' }],
              }),
              { status: 200 }
            )
          : new Response('[]', { status: 200 })
      )
    );

    render(<AdminWeatherFetcher />);

    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1));
    expect(mocks.setDoc.mock.calls[0][1]).toMatchObject({
      temp: 47.3,
      feelsLike: 44.1,
      condition: 'cloudy',
      source: 'earth_networks',
      locationName: 'Orono IS',
    });
  });

  it('writes nothing when the fallback also fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ cod: 401, message: 'bad key' }), {
        status: 401,
      })
    );

    render(<AdminWeatherFetcher />);

    await waitFor(() => expect(mocks.proxy).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});

describe('isStoredWeatherFresh', () => {
  const now = 1_000_000_000;
  const base = {
    source: 'openweather',
    cityKey: 'Orono',
    frequencyMinutes: 15,
    now,
  };

  it('is fresh just under 0.9x the interval', () => {
    expect(
      isStoredWeatherFresh(
        {
          updatedAt: now - 0.89 * FIFTEEN_MIN,
          source: 'openweather',
          city: 'Orono',
          temp: 40,
        },
        base
      )
    ).toBe(true);
  });

  it('is stale at 0.9x the interval', () => {
    expect(
      isStoredWeatherFresh(
        {
          updatedAt: now - 0.9 * FIFTEEN_MIN,
          source: 'openweather',
          city: 'Orono',
        },
        base
      )
    ).toBe(false);
  });

  it('is stale when the source or city changed', () => {
    expect(
      isStoredWeatherFresh(
        { updatedAt: now, source: 'earth_networks', city: 'Orono' },
        base
      )
    ).toBe(false);
    expect(
      isStoredWeatherFresh(
        { updatedAt: now, source: 'openweather', city: 'Wayzata' },
        base
      )
    ).toBe(false);
  });

  it('is stale when an older client stored a blank temperature', () => {
    expect(
      isStoredWeatherFresh(
        { updatedAt: now, source: 'openweather', city: 'Orono', temp: null },
        base
      )
    ).toBe(false);
  });

  it('is stale when updatedAt is missing', () => {
    expect(isStoredWeatherFresh(undefined, base)).toBe(false);
    expect(
      isStoredWeatherFresh({ source: 'openweather', city: 'Orono' }, base)
    ).toBe(false);
  });
});
