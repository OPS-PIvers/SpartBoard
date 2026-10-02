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
  } as Record<string, unknown>,
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

  it('is stale when updatedAt is missing', () => {
    expect(isStoredWeatherFresh(undefined, base)).toBe(false);
    expect(
      isStoredWeatherFresh({ source: 'openweather', city: 'Orono' }, base)
    ).toBe(false);
  });
});
