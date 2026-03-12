import React, { useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { WidgetData, WeatherConfig, WeatherGlobalConfig } from '@/types';
import { Toggle } from '@/components/common/Toggle';
import {
  MapPin,
  RefreshCw,
  AlertCircle,
  Thermometer,
  Palette,
  Shirt,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  Wind,
} from 'lucide-react';

import {
  OpenWeatherData,
  EarthNetworksResponse,
  EARTH_NETWORKS_ICONS,
  STATION_CONFIG,
  EARTH_NETWORKS_API,
} from './constants';
import { TypographySettings } from '@/components/common/TypographySettings';

export const WeatherSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { t } = useTranslation();
  const { updateWidget, addToast } = useDashboard();
  const config = widget.config as WeatherConfig;
  const {
    temp = 72,
    condition = 'sunny',
    isAuto = false,
    city = '',
    locationName: _locationName = 'Classroom',
    source = 'openweather',
    showFeelsLike: localShowFeelsLike,
    hideClothing,
    syncBackground,
  } = config;

  // We should also access global config to hide controls if forced by admin proxy
  const { featurePermissions } = useAuth();
  const weatherPermission = featurePermissions.find(
    (p) => p.widgetType === 'weather'
  );
  const globalConfig = weatherPermission?.config as
    | WeatherGlobalConfig
    | undefined;

  const showFeelsLike =
    localShowFeelsLike ?? globalConfig?.showFeelsLike ?? false;

  const isAdminProxy = globalConfig?.fetchingStrategy === 'admin_proxy';

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

      // Use our own Cloud Function proxy to avoid CORS issues entirely
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

        // Fallback to public proxies
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

      const obs = data.o; // Current observations

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

  const fetchWeather = async (params: string) => {
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

      addToast(`${t('widgets.weather.updatedFor')} ${data.name}`, 'success');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t('widgets.weather.syncFailed');
      addToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const syncByCity = () => {
    if (!city.trim()) return addToast(t('widgets.weather.enterCity'), 'info');

    void fetchWeather(`q=${encodeURIComponent(city.trim())}`);
  };

  const syncByLocation = () => {
    if (!navigator.geolocation)
      return addToast(t('widgets.weather.geoNotSupported'), 'error');

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        void fetchWeather(
          `lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`
        ),
      (_err) => {
        addToast(t('widgets.weather.locationDenied'), 'error');
        setLoading(false);
      }
    );
  };

  const conditions = [
    { id: 'sunny', icon: Sun, label: t('widgets.weather.conditions.sunny') },
    {
      id: 'cloudy',
      icon: Cloud,
      label: t('widgets.weather.conditions.cloudy'),
    },
    {
      id: 'rainy',
      icon: CloudRain,
      label: t('widgets.weather.conditions.rainy'),
    },
    {
      id: 'snowy',
      icon: CloudSnow,
      label: t('widgets.weather.conditions.snowy'),
    },
    { id: 'windy', icon: Wind, label: t('widgets.weather.conditions.windy') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
        <div className="flex flex-col gap-0.5">
          <span className="text-xxs font-bold text-slate-700 uppercase tracking-tight">
            {t('widgets.weather.prioritizeFeelsLike')}
          </span>
          <span className="text-xxs text-slate-400 leading-tight">
            {t('widgets.weather.prioritizeDescription')}
          </span>
        </div>
        <Toggle
          size="sm"
          checked={showFeelsLike}
          onChange={(checked) =>
            updateWidget(widget.id, {
              config: { ...config, showFeelsLike: checked },
            })
          }
        />
      </div>

      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
        <div className="flex flex-col gap-0.5">
          <span className="text-xxs font-bold text-slate-700 uppercase tracking-tight flex items-center gap-1.5">
            <Shirt className="w-3 h-3" /> {t('widgets.weather.hideClothing')}
          </span>
          <span className="text-xxs text-slate-400 leading-tight">
            {t('widgets.weather.hideClothingDescription')}
          </span>
        </div>
        <Toggle
          size="sm"
          checked={hideClothing ?? false}
          onChange={(checked) =>
            updateWidget(widget.id, {
              config: { ...config, hideClothing: checked },
            })
          }
        />
      </div>

      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
        <div className="flex flex-col gap-0.5">
          <span className="text-xxs font-bold text-slate-700 uppercase tracking-tight flex items-center gap-1.5">
            <Palette className="w-3 h-3" />{' '}
            {t('widgets.weather.syncBackground')}
          </span>
          <span className="text-xxs text-slate-400 leading-tight">
            {t('widgets.weather.syncBackgroundDescription')}
          </span>
        </div>
        <Toggle
          size="sm"
          checked={syncBackground ?? false}
          onChange={(checked) =>
            updateWidget(widget.id, {
              config: { ...config, syncBackground: checked },
            })
          }
        />
      </div>

      <div className="flex bg-slate-100 p-1 rounded-xl">
        <button
          onClick={() =>
            updateWidget(widget.id, {
              config: { ...config, isAuto: false },
            })
          }
          className={`flex-1 py-1.5 text-xxs font-black uppercase rounded-lg transition-all ${!isAuto ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
        >
          {t('widgets.weather.manual')}
        </button>
        <button
          onClick={() =>
            updateWidget(widget.id, {
              config: { ...config, isAuto: true },
            })
          }
          className={`flex-1 py-1.5 text-xxs font-black uppercase rounded-lg transition-all ${isAuto ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
        >
          {t('widgets.weather.automatic')}
        </button>
      </div>

      {!isAuto ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
          <div>
            <label className="text-xxs  text-slate-400 uppercase tracking-widest mb-4 block flex items-center gap-2">
              <Thermometer className="w-3 h-3" />{' '}
              {t('widgets.weather.temperature')} (°F)
            </label>
            <div className="flex items-center gap-4 px-2">
              <input
                type="range"
                min="0"
                max="110"
                step="1"
                value={temp}
                onChange={(e) =>
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      temp: parseInt(e.target.value),
                      locationName: t('widgets.weather.manualMode'),
                    },
                  })
                }
                className="flex-1 accent-indigo-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />
              <span className="w-10 text-center font-mono  text-slate-700 text-sm">
                {Math.round(temp)}°
              </span>
            </div>
          </div>

          <div>
            <label className="text-xxs  text-slate-400 uppercase tracking-widest mb-4 block flex items-center gap-2">
              <Palette className="w-3 h-3" /> {t('widgets.weather.condition')}
            </label>
            <div className="grid grid-cols-5 gap-2">
              {conditions.map((c) => (
                <button
                  key={c.id}
                  onClick={() =>
                    updateWidget(widget.id, {
                      config: { ...config, condition: c.id },
                    })
                  }
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${condition === c.id ? 'border-indigo-500 bg-indigo-50 text-indigo-600 shadow-sm' : 'border-slate-100 bg-white text-slate-400'}`}
                >
                  <c.icon className="w-4 h-4" />
                  <span className="text-xxxs font-black uppercase tracking-tighter">
                    {c.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {isAdminProxy ? (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <p className="text-xxs  text-blue-800 leading-tight flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {t('widgets.weather.managedByAdmin')}
              </p>
            </div>
          ) : (
            <>
              {/* Source Toggle */}
              <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
                <button
                  onClick={() =>
                    updateWidget(widget.id, {
                      config: { ...config, source: 'openweather' },
                    })
                  }
                  className={`flex-1 py-1.5 text-xxs  uppercase font-black rounded-lg transition-all ${source === 'openweather' || !source ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
                >
                  OpenWeather
                </button>
                <button
                  onClick={() =>
                    updateWidget(widget.id, {
                      config: { ...config, source: 'earth_networks' },
                    })
                  }
                  className={`flex-1 py-1.5 text-xxs  uppercase font-black rounded-lg transition-all ${source === 'earth_networks' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
                >
                  {t('widgets.weather.schoolStation')}
                </button>
              </div>

              {source === 'earth_networks' ? (
                <div className="space-y-3">
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-xxs  text-indigo-900 uppercase font-bold">
                        {t('widgets.weather.stationReady')}
                      </span>
                    </div>
                    <p className="text-xs text-indigo-800  leading-tight">
                      <Trans
                        i18nKey="widgets.weather.stationConnectedTo"
                        values={{
                          name: STATION_CONFIG.name,
                          id: STATION_CONFIG.id,
                        }}
                        components={{ b: <span className="font-bold" /> }}
                      />
                    </p>
                  </div>
                  <button
                    onClick={fetchEarthNetworksWeather}
                    disabled={loading}
                    className="w-full py-3 bg-indigo-600 text-white rounded-xl  text-xxs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-md shadow-indigo-200"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                    />
                    {t('widgets.weather.refreshStation')}
                  </button>
                </div>
              ) : (
                <>
                  {!hasApiKey && (
                    <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl items-start">
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xxs  text-amber-800 leading-tight">
                        {t('widgets.weather.serviceNotConfiguredAdmin')}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="text-xxs  text-slate-400 uppercase tracking-widest mb-2 block flex items-center gap-2">
                      <MapPin className="w-3 h-3" />{' '}
                      {t('widgets.weather.cityZip')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder={t('widgets.weather.cityPlaceholder')}
                        value={city}
                        onChange={(e) =>
                          updateWidget(widget.id, {
                            config: { ...config, city: e.target.value },
                          })
                        }
                        disabled={!hasApiKey}
                        className="flex-1 p-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 disabled:opacity-50 disabled:bg-slate-50"
                      />
                      <button
                        onClick={syncByCity}
                        disabled={loading || !hasApiKey}
                        className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                      >
                        <RefreshCw
                          className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-100" />
                    </div>
                    <div className="relative flex justify-center text-xxxs font-black  text-slate-300 uppercase tracking-widest">
                      <span className="bg-white px-2">
                        {t('widgets.weather.or')}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={syncByLocation}
                    disabled={loading || !hasApiKey}
                    className="w-full py-3 border-2 border-indigo-100 text-indigo-600 rounded-xl  text-xxs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-50 transition-all disabled:opacity-50"
                  >
                    <MapPin className="w-4 h-4" />{' '}
                    {t('widgets.weather.useLocation')}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      <hr className="border-slate-100" />

      <TypographySettings
        config={config}
        updateConfig={(updates) =>
          updateWidget(widget.id, {
            config: { ...config, ...updates },
          })
        }
      />
    </div>
  );
};
