import React, { useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { WeatherDetails, WeatherGlobalConfig } from '@/types';
import {
  STATION_CONFIG,
  type EarthNetworksResponse,
  type OpenWeatherData,
} from '@/components/widgets/Weather/constants';
import {
  fetchUvHours,
  parseEarthNetworksDetails,
  parseOpenWeatherDetails,
  readStationTemperature,
} from '@/components/widgets/Weather/details';
import {
  isStoredWeatherFresh,
  isWeatherUnchanged,
} from './adminWeatherFreshness';

const EARTH_NETWORKS_API = {
  BASE_URL: 'https://owc.enterprise.earthnetworks.com/Data/GetData.ashx',
  PARAMS: {
    dt: 'o',
    pi: '3',
    units: 'english',
    verbose: 'false',
  },
};

const EARTH_NETWORKS_ICONS = {
  SNOW: [140, 186, 210, 102],
  CLOUDY: [1, 13, 24, 70, 71, 73, 79],
  SUNNY: [0, 2, 3, 4, 7],
  RAIN: [10, 11, 12, 14, 15, 16, 17, 18, 19],
};

export const AdminWeatherFetcher: React.FC = () => {
  const { featurePermissions } = useAuth();

  const weatherPermission = featurePermissions.find(
    (p) => p.widgetType === 'weather'
  );
  const config = weatherPermission?.config as WeatherGlobalConfig | undefined;

  useEffect(() => {
    // Only run if admin proxy is enabled
    if (config?.fetchingStrategy !== 'admin_proxy') return;

    const abortController = new AbortController();
    const frequency = Math.max(5, config.updateFrequencyMinutes ?? 15);
    const source = config.source ?? 'openweather';
    const cityKey = config.city?.trim() ?? '';
    const weatherRef = doc(db, 'global_weather', 'current');
    const checkedRef = doc(db, 'global_weather', 'status');

    const fetchOpenWeather = async (city?: string) => {
      const apiKey = import.meta.env.VITE_OPENWEATHER_API_KEY as
        string | undefined;
      if (!apiKey) throw new Error('No API Key');
      const params =
        city && city.trim()
          ? `q=${encodeURIComponent(city.trim())}`
          : `lat=${STATION_CONFIG.lat}&lon=${STATION_CONFIG.lon}`;
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?${params}&appid=${apiKey}&units=imperial`,
        { signal: abortController.signal }
      );
      const data = (await res.json()) as OpenWeatherData;
      if (Number(data.cod) !== 200) throw new Error(String(data.message));
      return data;
    };

    const fetchWeather = async () => {
      let storedUv: WeatherDetails['uvHours'] = null;
      let stored: Record<string, unknown> | undefined;
      // A failed freshness read falls through to a normal fetch.
      try {
        const [snap, checkedSnap] = await Promise.all([
          getDoc(weatherRef),
          getDoc(checkedRef).catch(() => undefined),
        ]);
        if (abortController.signal.aborted) return;
        stored = snap.data();
        storedUv =
          (stored as { details?: WeatherDetails } | undefined)?.details
            ?.uvHours ?? null;
        if (
          snap.exists() &&
          isStoredWeatherFresh(snap.data(), {
            source,
            cityKey,
            frequencyMinutes: frequency,
            now: Date.now(),
            checkedAt: (
              checkedSnap?.data() as { lastCheckedAt?: unknown } | undefined
            )?.lastCheckedAt,
          })
        ) {
          return;
        }
      } catch (readErr) {
        console.warn('[AdminWeatherFetcher] Freshness check failed:', readErr);
      }

      try {
        let temp = 72;
        let feelsLike = 72;
        let condition = 'sunny';
        let locationName = STATION_CONFIG.name;
        let details: WeatherDetails | undefined;

        if (source === 'earth_networks') {
          // Earth Networks Fetch Logic
          const queryParams = new URLSearchParams({
            ...EARTH_NETWORKS_API.PARAMS,
            si: STATION_CONFIG.id,
            locstr: `${STATION_CONFIG.lat},${STATION_CONFIG.lon}`,
          }).toString();

          const url = `${EARTH_NETWORKS_API.BASE_URL}?${queryParams}`;

          // Use our own Cloud Function proxy to avoid CORS issues entirely
          const fetchProxy = httpsCallable<
            { url: string },
            EarthNetworksResponse
          >(functions, 'fetchExternalProxy');

          let data: EarthNetworksResponse | null = null;

          try {
            const result = await fetchProxy({ url });
            data = result.data;
            console.warn('[AdminWeatherFetcher] Fetched via Cloud Proxy');
          } catch (proxyErr) {
            console.error(
              '[AdminWeatherFetcher] Cloud Proxy failed:',
              proxyErr
            );
          }

          if (data?.o) {
            condition = EARTH_NETWORKS_ICONS.SNOW.includes(data.o.ic)
              ? 'snowy'
              : EARTH_NETWORKS_ICONS.CLOUDY.includes(data.o.ic)
                ? 'cloudy'
                : EARTH_NETWORKS_ICONS.SUNNY.includes(data.o.ic)
                  ? 'sunny'
                  : EARTH_NETWORKS_ICONS.RAIN.includes(data.o.ic)
                    ? 'rainy'
                    : 'cloudy';
            const reading = readStationTemperature(data.o);
            if (reading) {
              temp = reading.temp;
              feelsLike = reading.feelsLike;
            } else {
              // Station sensor reports no temperature; never store null (shows as 0°).
              const fallback = await fetchOpenWeather();
              temp = fallback.main.temp;
              feelsLike = fallback.main.feels_like;
            }
            locationName = STATION_CONFIG.name;
            details = {
              ...parseEarthNetworksDetails(data),
              uvHours: await fetchUvHours(
                STATION_CONFIG.zip,
                abortController.signal,
                storedUv
              ),
            };
          } else {
            throw new Error('Station data unavailable');
          }
        } else {
          const data = await fetchOpenWeather(config.city);
          temp = data.main.temp;
          feelsLike = data.main.feels_like;
          condition = data.weather[0].main.toLowerCase();
          locationName = data.name;
          details = parseOpenWeatherDetails(data);
        }

        // Write to Firestore
        if (abortController.signal.aborted) return;
        const next = {
          temp,
          feelsLike,
          condition,
          locationName,
          source,
          city: cityKey,
          ...(details ? { details } : {}),
        };
        // Unchanged values only stamp lastCheckedAt, so open widgets aren't woken.
        if (isWeatherUnchanged(stored, next)) {
          await setDoc(checkedRef, { lastCheckedAt: Date.now() });
          return;
        }
        await setDoc(weatherRef, { ...next, updatedAt: Date.now() });

        console.warn(
          `[AdminWeatherFetcher] Updated weather: ${temp}° (Feels like ${feelsLike}°) ${condition}`
        );
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('[AdminWeatherFetcher] Failed to fetch:', err);
      }
    };

    // Initial fetch
    void fetchWeather();

    // Interval
    const intervalId = setInterval(
      () => {
        void fetchWeather();
      },
      frequency * 60 * 1000
    );

    return () => {
      abortController.abort();
      clearInterval(intervalId);
    };
  }, [
    config?.fetchingStrategy,
    config?.updateFrequencyMinutes,
    config?.source,
    config?.city,
  ]);

  return null; // Headless component
};
