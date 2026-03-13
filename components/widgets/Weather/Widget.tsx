import React, { useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { isExternalBackground } from '@/utils/backgrounds';
import {
  WidgetData,
  WeatherConfig,
  WeatherGlobalConfig,
  DEFAULT_GLOBAL_STYLE,
  GlobalWeatherData,
} from '@/types';
import { Sun, Cloud, CloudRain, CloudSnow, Wind } from 'lucide-react';
import { getFontClass } from '@/utils/styles';

import { WidgetLayout } from '@/components/widgets/WidgetLayout';

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
    fontFamily = 'global',
    fontColor = '#334155',
  } = config;

  const fontClass = getFontClass(fontFamily, globalStyle.fontFamily);

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

    // Don't override user-selected image or video backgrounds (URLs).
    // The weather sync only applies to Tailwind class-based backgrounds.
    if (isExternalBackground(activeDashboard.background)) return;

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
          className={`flex flex-col items-center justify-center h-full w-full ${fontClass}`}
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
                className="font-black tabular-nums leading-none"
                style={{
                  fontSize: hideClothing
                    ? 'min(75cqh, 40cqw)'
                    : 'clamp(32px, 35cqmin, 400px)',
                  color: fontColor,
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
                className="font-black uppercase tracking-wider whitespace-nowrap leading-none text-center"
                style={{
                  fontSize: hideClothing
                    ? 'min(10cqh, 40cqw)'
                    : 'min(14px, 5cqmin)',
                  marginTop: hideClothing ? '1cqh' : 'min(2px, 0.5cqmin)',
                  color: fontColor,
                  opacity: 0.8,
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
                className="font-bold leading-tight"
                style={{ fontSize: 'min(20px, 6cqmin)', color: fontColor }}
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
