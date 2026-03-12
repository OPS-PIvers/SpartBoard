import { useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import { WeatherConfig, WidgetData } from '../../../types';
import {
  OpenWeatherData,
  EarthNetworksResponse,
  EARTH_NETWORKS_API,
  STATION_CONFIG,
  EARTH_NETWORKS_ICONS,
} from './constants';

export const useWeather = (widget: WidgetData) => {
  const { t } = useTranslation();
  const { updateWidget, addToast } = useDashboard();
  const config = widget.config as WeatherConfig;
  const [loading, setLoading] = useState(false);

  const systemKey = import.meta.env.VITE_OPENWEATHER_API_KEY as
    | string
    | undefined;
  const hasApiKey = !!systemKey && systemKey.trim() !== '';

  const mapEarthNetworksIcon = (ic: number): string => {
    if (EARTH_NETWORKS_ICONS.SNOW.includes(ic)) return 'snowy';
    if (EARTH_NETWORKS_ICONS.CLOUDY.includes(ic)) return 'cloudy';
    if (EARTH_NETWORKS_ICONS.SUNNY.includes(ic)) return 'sunny';
    if (EARTH_NETWORKS_ICONS.RAIN.includes(ic)) return 'rainy';
    return 'cloudy'; // Default fallback
  };

  const fetchEarthNetworksWeather = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        ...EARTH_NETWORKS_API.PARAMS,
        si: STATION_CONFIG.id,
        locstr: `${STATION_CONFIG.lat},${STATION_CONFIG.lon}`,
      }).toString();

      const url = `${EARTH_NETWORKS_API.BASE_URL}?${queryParams}`;

      const fetchProxy = httpsCallable<{ url: string }, EarthNetworksResponse>(
        functions,
        'fetchWeatherProxy'
      );

      let data: EarthNetworksResponse | null = null;

      try {
        const result = await fetchProxy({ url });
        data = result.data;
        console.warn(
          '[WeatherWidget] Fetched Earth Networks Data via Cloud Proxy'
        );
      } catch (_proxyErr) {
        console.warn(
          '[WeatherWidget] Cloud Proxy failed, trying public proxies'
        );

        const proxies = [
          (u: string) =>
            `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
          (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
          (u: string) =>
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
        ];

        let lastError: Error | null =
          _proxyErr instanceof Error ? _proxyErr : new Error(String(_proxyErr));

        for (const getProxyUrl of proxies) {
          try {
            const proxyUrl = getProxyUrl(url);
            const res = await fetch(proxyUrl);
            if (!res.ok) throw new Error(`Proxy error: ${res.status}`);

            const text = await res.text();
            const trimmed = text.trim();

            if (
              !trimmed ||
              trimmed.startsWith('<') ||
              trimmed.toLowerCase().startsWith('<!doctype')
            ) {
              throw new Error(
                'Proxy returned HTML or empty response instead of JSON'
              );
            }

            try {
              data = JSON.parse(trimmed) as EarthNetworksResponse;
              console.warn(
                '[WeatherWidget] Fetched Earth Networks Data via Public Proxy'
              );
            } catch (_) {
              throw new Error('Failed to parse response as JSON');
            }

            if (data && data.o) break;
          } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            console.warn(
              `[WeatherWidget] Public proxy attempt failed: ${lastError.message}`
            );
          }
        }

        if (!data) {
          throw lastError ?? new Error('All proxy attempts failed');
        }
      }

      const obs = data.o;
      if (!obs) throw new Error('No observation data available');

      const newCondition = mapEarthNetworksIcon(obs.ic);

      updateWidget(widget.id, {
        config: {
          ...config,
          temp: obs.t,
          feelsLike: obs.fl ?? obs.t,
          condition: newCondition,
          locationName: STATION_CONFIG.name,
          lastSync: Date.now(),
          isAuto: true,
        },
      });

      addToast(
        `${t('widgets.weather.connectedTo')} ${STATION_CONFIG.name}`,
        'success'
      );
    } catch (err) {
      console.error(err);
      let message = t('widgets.weather.stationFailed');
      if (err instanceof Error) {
        message += `: ${err.message}`;
      }
      addToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchWeather = useCallback(
    async (params: string) => {
      if (!hasApiKey) {
        addToast(t('widgets.weather.serviceNotConfigured'), 'error');
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?${params}&appid=${systemKey}&units=imperial`
        );

        if (res.status === 401) {
          throw new Error(t('widgets.weather.invalidApiKey'));
        }

        const data = (await res.json()) as OpenWeatherData;

        if (Number(data.cod) !== 200)
          throw new Error(data.message ?? t('common.error'));

        updateWidget(widget.id, {
          config: {
            ...config,
            temp: data.main.temp,
            feelsLike: data.main.feels_like,
            condition: data.weather[0].main.toLowerCase(),
            locationName: data.name,
            lastSync: Date.now(),
          },
        });
        addToast(`${t('widgets.weather.syncedWith')} ${data.name}`, 'success');
      } catch (err) {
        console.error(err);
        let message = t('widgets.weather.syncFailed');
        if (err instanceof Error) {
          message += `: ${err.message}`;
        }
        addToast(message, 'error');
        updateWidget(widget.id, {
          config: { ...config, isAuto: false },
        });
      } finally {
        setLoading(false);
      }
    },
    [addToast, config, hasApiKey, systemKey, t, updateWidget, widget.id]
  );

  const syncByCity = useCallback(() => {
    if (!config.city?.trim()) {
      addToast(t('widgets.weather.enterCity'), 'error');
      return;
    }
    const isZip = /^\d{5}(?:[-\s]\d{4})?$/.test(config.city.trim());
    const params = isZip
      ? `zip=${config.city.trim()}`
      : `q=${config.city.trim()}`;
    void fetchWeather(params);
  }, [config.city, addToast, t, fetchWeather]);

  const syncByLocation = useCallback(() => {
    if (!navigator.geolocation) {
      addToast(t('widgets.weather.locationNotSupported'), 'error');
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void fetchWeather(
          `lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`
        );
      },
      (err) => {
        console.error(err);
        let msg = t('widgets.weather.locationError');
        if (err.code === 1) msg = t('widgets.weather.locationDenied');
        addToast(msg, 'error');
        setLoading(false);
        updateWidget(widget.id, {
          config: { ...config, isAuto: false },
        });
      },
      { timeout: 10000 }
    );
  }, [addToast, t, widget.id, config, updateWidget, fetchWeather]);

  return {
    loading,
    hasApiKey,
    fetchEarthNetworksWeather,
    syncByCity,
    syncByLocation,
  };
};
