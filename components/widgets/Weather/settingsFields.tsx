import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Toggle } from '@/components/common/Toggle';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import type { WeatherConfig, WeatherGlobalConfig } from '@/types';
import {
  EARTH_NETWORKS_API,
  EARTH_NETWORKS_ICONS,
  STATION_CONFIG,
  type EarthNetworksResponse,
  type OpenWeatherData,
} from './constants';
import { tourAttr } from '@/config/tourAnchors';

function useWeatherGlobalConfig(): WeatherGlobalConfig | undefined {
  const { featurePermissions } = useAuth();
  return featurePermissions.find(
    (permission) => permission.widgetType === 'weather'
  )?.config as WeatherGlobalConfig | undefined;
}

export const WeatherFeelsLikeField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const globalConfig = useWeatherGlobalConfig();
  const checked =
    typeof ctx.config.showFeelsLike === 'boolean'
      ? ctx.config.showFeelsLike
      : (globalConfig?.showFeelsLike ?? false);
  return (
    <div
      id={ctx.id}
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
    >
      <Toggle
        checked={checked}
        onChange={(showFeelsLike) => ctx.updateConfig({ showFeelsLike })}
        label={ctx.t('widgetSettings.weather.showFeelsLike')}
        showLabels={false}
        size="sm"
        anchor={tourAttr(
          'widget-settings.weather.show-feels-like',
          ctx.widget.id,
          ctx.widget.type
        )}
      />
    </div>
  );
};

function mapEarthNetworksIcon(icon: number): string {
  if (EARTH_NETWORKS_ICONS.SNOW.includes(icon)) return 'snowy';
  if (EARTH_NETWORKS_ICONS.CLOUDY.includes(icon)) return 'cloudy';
  if (EARTH_NETWORKS_ICONS.SUNNY.includes(icon)) return 'sunny';
  if (EARTH_NETWORKS_ICONS.RAIN.includes(icon)) return 'rainy';
  return 'cloudy';
}

export const WeatherAutoSyncField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const config = ctx.config as unknown as WeatherConfig;
  const source = config.source ?? 'openweather';
  const city = config.city ?? '';
  const globalConfig = useWeatherGlobalConfig();
  const { addToast } = useDashboard();
  const [loading, setLoading] = useState(false);
  const apiKey = import.meta.env.VITE_OPENWEATHER_API_KEY as string | undefined;
  const hasApiKey = Boolean(apiKey?.trim());
  const isAdminProxy = globalConfig?.fetchingStrategy === 'admin_proxy';

  const fetchOpenWeather = async (params: string) => {
    if (!apiKey) {
      addToast(ctx.t('widgets.weather.serviceNotConfigured'), 'error');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?${params}&appid=${apiKey}&units=imperial`
      );
      if (response.status === 401) {
        throw new Error(ctx.t('widgets.weather.invalidApiKey'));
      }
      const data = (await response.json()) as OpenWeatherData;
      if (Number(data.cod) !== 200) {
        throw new Error(data.message ?? ctx.t('common.error'));
      }
      ctx.updateConfig({
        temp: data.main.temp,
        feelsLike: data.main.feels_like,
        condition: data.weather[0].main.toLowerCase(),
        locationName: data.name,
        lastSync: Date.now(),
      });
      addToast(
        `${ctx.t('widgets.weather.updatedFor')} ${data.name}`,
        'success'
      );
    } catch (error) {
      addToast(
        error instanceof Error
          ? error.message
          : ctx.t('widgets.weather.syncFailed'),
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchStation = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        ...EARTH_NETWORKS_API.PARAMS,
        si: STATION_CONFIG.id,
        locstr: `${STATION_CONFIG.lat},${STATION_CONFIG.lon}`,
      });
      const proxy = httpsCallable<{ url: string }, EarthNetworksResponse>(
        functions,
        'fetchExternalProxy'
      );
      const result = await proxy({
        url: `${EARTH_NETWORKS_API.BASE_URL}?${params.toString()}`,
      });
      const observation = result.data.o;
      if (!observation) throw new Error('No observation data available');
      ctx.updateConfig({
        temp: observation.t,
        feelsLike: observation.fl ?? observation.t,
        condition: mapEarthNetworksIcon(observation.ic),
        locationName: STATION_CONFIG.name,
        lastSync: Date.now(),
        isAuto: true,
      });
      addToast(
        `${ctx.t('widgets.weather.connectedTo')} ${STATION_CONFIG.name}`,
        'success'
      );
    } catch (error) {
      const suffix = error instanceof Error ? `: ${error.message}` : '';
      addToast(`${ctx.t('widgets.weather.stationFailed')}${suffix}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const syncCity = () => {
    if (!city.trim()) {
      addToast(ctx.t('widgets.weather.enterCity'), 'info');
      return;
    }
    void fetchOpenWeather(`q=${encodeURIComponent(city.trim())}`);
  };

  const syncLocation = () => {
    if (!navigator.geolocation) {
      addToast(ctx.t('widgets.weather.geoNotSupported'), 'error');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) =>
        void fetchOpenWeather(
          `lat=${position.coords.latitude}&lon=${position.coords.longitude}`
        ),
      () => {
        addToast(ctx.t('widgets.weather.locationDenied'), 'error');
        setLoading(false);
      }
    );
  };

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-3"
    >
      {isAdminProxy ? (
        <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
          {ctx.t('widgets.weather.managedByAdmin')}
        </p>
      ) : (
        <>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {(['openweather', 'earth_networks'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={source === option}
                onClick={() => ctx.updateConfig({ source: option })}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold ${
                  source === option
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                {ctx.t(
                  option === 'openweather'
                    ? 'widgetSettings.weather.openWeather'
                    : 'widgets.weather.schoolStation'
                )}
              </button>
            ))}
          </div>
          {source === 'earth_networks' ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => void fetchStation()}
              className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              {...tourAttr(
                'widget-settings.weather.sync-station',
                ctx.widget.id,
                ctx.widget.type
              )}
            >
              {ctx.t('widgets.weather.refreshStation')}
            </button>
          ) : (
            <>
              {!hasApiKey && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  {ctx.t('widgets.weather.serviceNotConfiguredAdmin')}
                </p>
              )}
              <input
                type="text"
                value={city}
                disabled={!hasApiKey}
                onChange={(event) =>
                  ctx.updateConfig({ city: event.target.value })
                }
                placeholder={ctx.t('widgets.weather.cityPlaceholder')}
                aria-label={ctx.t('widgets.weather.cityZip')}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:opacity-50"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={loading || !hasApiKey}
                  onClick={syncCity}
                  className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  {...tourAttr(
                    'widget-settings.weather.sync-city',
                    ctx.widget.id,
                    ctx.widget.type
                  )}
                >
                  {ctx.t('widgetSettings.weather.refreshCity')}
                </button>
                <button
                  type="button"
                  disabled={loading || !hasApiKey}
                  onClick={syncLocation}
                  className="rounded-xl border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-50"
                >
                  {ctx.t('widgets.weather.useLocation')}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};
