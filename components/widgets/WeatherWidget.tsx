import React, { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import {
  WidgetData,
  WeatherConfig,
  WeatherGlobalConfig,
  DEFAULT_GLOBAL_STYLE,
} from '../../types';
import { Toggle } from '../common/Toggle';
import {
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  Wind,
  Thermometer,
  Palette,
  MapPin,
  RefreshCw,
  AlertCircle,
  Shirt,
} from 'lucide-react';

interface OpenWeatherData {
  cod: number | string;
  message?: string;
  name: string;
  main: {
    temp: number;
    feels_like: number;
  };
  weather: [{ main: string }, ...{ main: string }[]];
}

interface EarthNetworksResponse {
  o?: {
    t: number;
    ic: number;
    fl?: number;
  };
}

interface GlobalWeatherData {
  temp: number;
  feelsLike?: number;
  condition: string;
  locationName: string;
  updatedAt: number;
  source?: string;
}

const STATION_CONFIG = {
  id: 'BLLST',
  lat: 44.99082,
  lon: -93.59635,
  name: 'Orono IS',
};

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

import { WidgetLayout } from './WidgetLayout';

export const WeatherWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { t } = useTranslation();
  const { updateWidget, activeDashboard, setBackground } = useDashboard();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const { featurePermissions } = useAuth();
  const config = widget.config as WeatherConfig;
  const {
    temp = 72,
    feelsLike,
    condition = 'sunny',
    isAuto = false,
    locationName: _locationName = 'Classroom',
    lastSync = null,
    showFeelsLike: localShowFeelsLike,
    hideClothing,
    syncBackground,
  } = config;

  const weatherPermission = featurePermissions.find(
    (p) => p.widgetType === 'weather'
  );
  const globalConfig = weatherPermission?.config as
    | WeatherGlobalConfig
    | undefined;

  // Use local config if set, otherwise fallback to global config
  const showFeelsLike =
    localShowFeelsLike ?? globalConfig?.showFeelsLike ?? false;

  // Initial Admin Proxy Fetch
  useEffect(() => {
    if (!isAuto || globalConfig?.fetchingStrategy !== 'admin_proxy') return;

    const fetchInitial = async () => {
      try {
        const snap = await getDoc(doc(db, 'global_weather', 'current'));
        if (snap.exists()) {
          const data = snap.data() as GlobalWeatherData;
          updateWidget(widget.id, {
            config: {
              ...config,
              temp: data.temp,
              feelsLike: data.feelsLike,
              condition: data.condition,
              locationName: data.locationName,
              lastSync: data.updatedAt,
            },
          });
        }
      } catch (err) {
        console.error('Failed to fetch initial global weather:', err);
      }
    };

    void fetchInitial();
  }, [isAuto, globalConfig?.fetchingStrategy, widget.id, config, updateWidget]);

  // Admin Proxy Subscription
  useEffect(() => {
    if (!isAuto) return;
    if (globalConfig?.fetchingStrategy !== 'admin_proxy') return;

    const unsubscribe = onSnapshot(
      doc(db, 'global_weather', 'current'),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as GlobalWeatherData;
          // Avoid infinite loop: check if data actually changed significantly
          if (
            Math.round(data.temp) !== Math.round(temp) ||
            data.feelsLike !== feelsLike ||
            data.condition !== condition ||
            data.updatedAt !== lastSync
          ) {
            updateWidget(widget.id, {
              config: {
                ...config,
                temp: data.temp,
                feelsLike: data.feelsLike,
                condition: data.condition,
                locationName: data.locationName,
                lastSync: data.updatedAt,
              },
            });
          }
        }
      },
      (error) => {
        console.error('Failed to subscribe to global weather:', error);
      }
    );

    return () => unsubscribe();
  }, [
    isAuto,
    globalConfig?.fetchingStrategy,
    widget.id,
    updateWidget,
    temp,
    feelsLike,
    condition,
    lastSync,
    config,
  ]);

  // Nexus Connection: Weather -> Background Theme
  // Maps weather conditions to preset IDs from BACKGROUND_GRADIENTS
  useEffect(() => {
    if (!syncBackground || !activeDashboard) return;

    const getBackgroundForCondition = (cond: string) => {
      switch (cond.toLowerCase()) {
        case 'sunny':
        case 'clear':
          return 'bg-gradient-to-br from-blue-400 via-sky-300 to-blue-200';
        case 'cloudy':
        case 'clouds':
          return 'bg-gradient-to-br from-slate-500 via-slate-400 to-slate-300';
        case 'rainy':
        case 'rain':
        case 'drizzle':
          return 'bg-gradient-to-br from-slate-800 via-blue-900 to-slate-900';
        case 'snowy':
        case 'snow':
          return 'bg-gradient-to-br from-blue-100 via-white to-blue-50';
        case 'windy':
        case 'squall':
        case 'tornado':
          return 'bg-gradient-to-br from-teal-600 via-emerald-500 to-teal-400';
        default:
          console.warn(
            `[WeatherWidget] Unhandled condition for background sync: ${cond}`
          );
          return 'bg-gradient-to-br from-slate-300 via-slate-200 to-slate-100';
      }
    };

    const targetBg = getBackgroundForCondition(condition);
    // Only update if different to avoid loops/fighting
    if (activeDashboard.background !== targetBg) {
      setBackground(targetBg);
    }
  }, [
    condition,
    syncBackground,
    activeDashboard?.background,
    setBackground,
    activeDashboard,
  ]);

  const getIcon = (size: string) => {
    switch (condition.toLowerCase()) {
      case 'cloudy':
      case 'clouds':
        return <Cloud size={size} className="text-slate-500" />;
      case 'rainy':
      case 'rain':
      case 'drizzle':
        return <CloudRain size={size} className="text-blue-400" />;
      case 'snowy':
      case 'snow':
        return <CloudSnow size={size} className="text-blue-200" />;
      case 'windy':
      case 'squall':
      case 'tornado':
        return <Wind size={size} className="text-slate-500" />;
      case 'sunny':
      case 'clear':
        return <Sun size={size} className="text-amber-400 animate-spin-slow" />;
      default:
        return <Sun size={size} className="text-amber-400 animate-spin-slow" />;
    }
  };

  const getClothing = () => {
    if (temp < 40)
      return { label: t('widgets.weather.clothing.heavyCoat'), icon: '🧤' };
    if (temp < 60)
      return { label: t('widgets.weather.clothing.lightJacket'), icon: '🧥' };
    if (temp < 75)
      return { label: t('widgets.weather.clothing.longSleeves'), icon: '👕' };
    return { label: t('widgets.weather.clothing.shortSleeves'), icon: '🩳' };
  };

  const clothing = getClothing();

  // Custom Message/Image Logic
  let displayMessage: React.ReactNode = (
    <Trans
      i18nKey="widgets.weather.messageTemplate"
      values={{
        condition: t(`widgets.weather.conditions.${condition.toLowerCase()}`, {
          defaultValue: condition,
        }),
        clothing: clothing.label,
      }}
      components={{
        cond: <span className="text-indigo-600 uppercase" />,
        cloth: <span className="text-indigo-600" />,
        br: <br />,
      }}
    />
  );
  let displayImage = <span>{clothing.icon}</span>;

  if (globalConfig?.temperatureRanges) {
    const match = globalConfig.temperatureRanges.find((r) => {
      if (r.type === 'above') return temp > r.min;
      if (r.type === 'below') return temp < r.max;
      return temp >= r.min && temp <= r.max;
    });
    if (match) {
      displayMessage = match.message;
      if (match.imageUrl) {
        displayImage = (
          <img
            src={match.imageUrl}
            alt={t('widgets.weather.weatherImageAlt')}
            className="w-full h-full object-cover rounded-lg"
          />
        );
      }
    }
  }

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={`flex flex-col items-center justify-center h-full w-full font-${globalStyle.fontFamily}`}
          style={{
            gap: hideClothing ? '2cqh' : 'min(12px, 2.5cqmin)',
            padding: hideClothing ? '4cqh' : 'min(8px, 2cqmin)',
          }}
        >
          <div
            className="flex flex-col items-center justify-center w-full"
            style={{ gap: hideClothing ? '1cqh' : 'min(4px, 1cqmin)' }}
          >
            <div
              className="flex items-center justify-center w-full"
              style={{
                gap: hideClothing ? '4cqw' : 'min(24px, 6cqmin)',
              }}
            >
              <div
                style={{
                  fontSize: hideClothing
                    ? 'min(60cqh, 30cqw)'
                    : 'min(80px, 25cqmin)',
                }}
              >
                {getIcon('1em')}
              </div>
              <div
                className="font-black text-slate-800 tabular-nums leading-none"
                style={{
                  fontSize: hideClothing
                    ? 'min(75cqh, 40cqw)'
                    : 'clamp(32px, 35cqmin, 400px)',
                }}
              >
                {showFeelsLike && feelsLike !== undefined
                  ? Math.round(feelsLike)
                  : Math.round(temp)}
                °
              </div>
            </div>

            {(showFeelsLike || feelsLike !== undefined) && (
              <div
                className="font-black text-slate-600 uppercase tracking-wider whitespace-nowrap leading-none text-center"
                style={{
                  fontSize: hideClothing
                    ? 'min(10cqh, 40cqw)'
                    : 'min(14px, 5cqmin)',
                  marginTop: hideClothing ? '1cqh' : 'min(2px, 0.5cqmin)',
                }}
              >
                {showFeelsLike
                  ? `${t('widgets.weather.actual')} ${Math.round(temp)}°`
                  : `${t('widgets.weather.feelsLike')} ${Math.round(feelsLike ?? temp)}°`}
              </div>
            )}
          </div>

          {!hideClothing && (
            <div
              className="w-full bg-white border border-slate-200 rounded-2xl flex items-center shadow-sm"
              style={{
                gap: 'min(16px, 4cqmin)',
                padding: 'min(12px, 2.5cqmin) min(16px, 4cqmin)',
              }}
            >
              <div
                className="shrink-0 flex items-center justify-center overflow-hidden"
                style={{
                  fontSize: 'min(48px, 12cqmin)',
                  width: 'min(64px, 15cqmin)',
                  height: 'min(64px, 15cqmin)',
                }}
              >
                {displayImage}
              </div>
              <div
                className="font-bold text-slate-700 leading-tight"
                style={{ fontSize: 'min(20px, 6cqmin)' }}
              >
                {displayMessage}
              </div>
            </div>
          )}
        </div>
      }
    />
  );
};

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
                  <span className="text-[8px] font-black uppercase tracking-tighter">
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
                    <div className="relative flex justify-center text-[8px] font-black  text-slate-300 uppercase tracking-widest">
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
    </div>
  );
};
