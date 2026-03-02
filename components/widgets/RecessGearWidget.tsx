import React, { useMemo, useState, useEffect } from 'react';
import { useDashboard } from '../../context/useDashboard';
import {
  WidgetData,
  RecessGearConfig,
  WeatherConfig,
  FeaturePermission,
  RecessGearGlobalConfig,
  GlobalWeatherData,
} from '../../types';
import {
  Shirt,
  Thermometer,
  Info,
  Link as LinkIcon,
  AlertCircle,
  CloudSun,
} from 'lucide-react';
import { ScaledEmptyState } from '../common/ScaledEmptyState';
import { Toggle } from '../common/Toggle';
import { useFeaturePermissions } from '../../hooks/useFeaturePermissions';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';

interface GearItem {
  label: string;
  icon?: string;
  imageUrl?: string;
  category: 'clothing' | 'footwear' | 'accessory';
}

import { WidgetLayout } from './WidgetLayout';

export const RecessGearWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { activeDashboard } = useDashboard();
  const { subscribeToPermission } = useFeaturePermissions();
  const config = widget.config as RecessGearConfig;
  const [adminPermission, setAdminPermission] =
    useState<FeaturePermission | null>(null);
  const [adminWeatherData, setAdminWeatherData] =
    useState<WeatherConfig | null>(null);

  useEffect(() => {
    return subscribeToPermission('recessGear', setAdminPermission);
  }, [subscribeToPermission]);

  const adminConfig = adminPermission?.config as
    | RecessGearGlobalConfig
    | undefined;

  // If using admin proxy, fetch the shared weather data
  useEffect(() => {
    if (adminConfig?.fetchingStrategy === 'admin_proxy') {
      // The admin weather proxy stores data in a known location in Firestore: global_weather/current
      const unsubscribe = onSnapshot(
        doc(db, 'global_weather', 'current'),
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data() as GlobalWeatherData;
            // Map GlobalWeatherData to WeatherConfig
            if (data) {
              setAdminWeatherData({
                temp: data.temp,
                feelsLike: data.feelsLike,
                condition: data.condition,
                locationName: data.locationName,
                lastSync: data.updatedAt,
              });
            }
          }
        }
      );
      return () => unsubscribe();
    }
    return undefined;
  }, [adminConfig?.fetchingStrategy]);

  const widgets = activeDashboard?.widgets;

  // Find linked or first available weather widget (Fallback)
  const localWeatherWidget = useMemo(() => {
    if (!widgets) return null;
    if (config.linkedWeatherWidgetId) {
      const linked = widgets.find((w) => w.id === config.linkedWeatherWidgetId);
      if (linked && linked.type === 'weather') return linked;
    }
    return widgets.find((w) => w.type === 'weather') ?? null;
  }, [widgets, config.linkedWeatherWidgetId]);

  const localWeatherConfig = localWeatherWidget?.config as
    | WeatherConfig
    | undefined;

  // Determine which weather data to use
  const activeWeatherConfig =
    adminConfig?.fetchingStrategy === 'admin_proxy'
      ? adminWeatherData
      : localWeatherConfig;

  const getRecessGear = () => {
    if (!activeWeatherConfig || activeWeatherConfig.temp === undefined)
      return [];

    const useFeelsLike = adminConfig
      ? adminConfig.useFeelsLike
      : config.useFeelsLike;
    const temp =
      (useFeelsLike ?? true) && activeWeatherConfig.feelsLike !== undefined
        ? activeWeatherConfig.feelsLike
        : activeWeatherConfig.temp;
    const condition = activeWeatherConfig.condition?.toLowerCase() ?? 'sunny';

    // If admin has defined custom ranges, use them
    if (
      adminConfig?.temperatureRanges &&
      adminConfig.temperatureRanges.length > 0
    ) {
      const gear: GearItem[] = [];

      adminConfig.temperatureRanges.forEach((range) => {
        let matches = false;
        const type = range.type ?? 'range';

        if (type === 'range') {
          matches = temp >= range.min && temp <= range.max;
        } else if (type === 'above') {
          matches = temp > range.min;
        } else if (type === 'below') {
          matches = temp < range.max;
        }

        if (matches) {
          gear.push({
            label: range.label,
            icon: range.icon,
            imageUrl: range.imageUrl,
            category: range.category,
          });
        }
      });

      return gear;
    }

    // Fallback to legacy hardcoded logic
    const gear: GearItem[] = [];

    // Temperature-based clothing
    if (temp < 32) {
      gear.push({ label: 'Heavy Coat', icon: '🧥', category: 'clothing' });
      gear.push({ label: 'Hat & Gloves', icon: '🧤', category: 'accessory' });
    } else if (temp < 45) {
      gear.push({ label: 'Winter Coat', icon: '🧥', category: 'clothing' });
    } else if (temp < 60) {
      gear.push({ label: 'Light Jacket', icon: '🧥', category: 'clothing' });
    } else if (temp < 75) {
      gear.push({ label: 'Long Sleeves', icon: '👕', category: 'clothing' });
    } else {
      gear.push({ label: 'Short Sleeves', icon: '👕', category: 'clothing' });
    }

    // Condition-based gear
    if (
      condition.includes('rain') ||
      condition.includes('drizzle') ||
      condition.includes('storm')
    ) {
      gear.push({ label: 'Rain Boots', icon: '👢', category: 'footwear' });
      gear.push({ label: 'Umbrella', icon: '☂️', category: 'accessory' });
    } else if (condition.includes('snow')) {
      gear.push({ label: 'Snow Boots', icon: '🥾', category: 'footwear' });
      gear.push({ label: 'Snow Pants', icon: '👖', category: 'clothing' });
    } else if (temp < 50) {
      gear.push({ label: 'Closed Shoes', icon: '👟', category: 'footwear' });
    }

    return gear;
  };

  const gearList = getRecessGear();

  if (!activeWeatherConfig || activeWeatherConfig.temp === undefined) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={AlertCircle}
            title="No Weather Data"
            subtitle={
              adminConfig?.fetchingStrategy === 'admin_proxy'
                ? 'Waiting for admin weather data...'
                : 'Add a Weather widget to automatically see required recess gear.'
            }
          />
        }
      />
    );
  }

  const currentTemp = Math.round(
    ((adminConfig ? adminConfig.useFeelsLike : config.useFeelsLike) ?? true) &&
      activeWeatherConfig.feelsLike !== undefined
      ? activeWeatherConfig.feelsLike
      : activeWeatherConfig.temp
  );

  return (
    <WidgetLayout
      padding="p-0"
      header={
        <div
          className="flex items-center justify-between border-b border-slate-100 bg-white/50 backdrop-blur-sm shrink-0"
          style={{ padding: 'min(8px, 1.5cqmin) min(12px, 2.5cqmin)' }}
        >
          <div
            className="flex items-center"
            style={{ gap: 'min(6px, 1.5cqmin)' }}
          >
            <div
              className="bg-emerald-50 rounded-lg border border-emerald-100 shadow-sm flex items-center justify-center"
              style={{ padding: 'min(4px, 1cqmin)' }}
            >
              <Shirt
                className="text-emerald-600"
                style={{
                  width: 'min(14px, 4cqmin)',
                  height: 'min(14px, 4cqmin)',
                }}
              />
            </div>
            <span
              className="font-black uppercase tracking-widest text-slate-400"
              style={{ fontSize: 'min(12px, 5cqmin)' }}
            >
              Recess Gear
            </span>
          </div>
          <div
            className="flex items-center bg-emerald-50 rounded-full border border-emerald-100 shadow-sm"
            style={{
              gap: 'min(4px, 1cqmin)',
              padding: 'min(3px, 0.8cqmin) min(8px, 2cqmin)',
            }}
          >
            <Thermometer
              className="text-emerald-600"
              style={{
                width: 'min(14px, 4cqmin)',
                height: 'min(14px, 4cqmin)',
              }}
            />
            <span
              className="font-black text-emerald-700 tracking-tight"
              style={{ fontSize: 'min(14px, 5cqmin)' }}
            >
              {currentTemp}°
            </span>
          </div>
        </div>
      }
      content={
        <div
          className="flex-1 w-full h-full overflow-y-auto custom-scrollbar bg-slate-50/30"
          style={{ padding: 'min(12px, 2.5cqmin)' }}
        >
          {gearList.length > 0 ? (
            <div
              className="grid grid-cols-1 @[240px]:grid-cols-2"
              style={{ gap: 'min(10px, 2.5cqmin)' }}
            >
              {gearList.map((item, idx) => (
                <div
                  key={`${item.label}-${idx}`}
                  className="flex items-center bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-emerald-200 hover:shadow-md transition-all group overflow-hidden"
                  style={{
                    gap: 'min(10px, 2.5cqmin)',
                    padding: 'min(12px, 2.5cqmin)',
                  }}
                >
                  {item.imageUrl ? (
                    <div
                      className="shrink-0 rounded-xl overflow-hidden shadow-sm"
                      style={{
                        width: 'min(48px, 16cqmin)',
                        height: 'min(48px, 16cqmin)',
                      }}
                    >
                      <img
                        src={item.imageUrl}
                        alt={item.label}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    </div>
                  ) : (
                    <span
                      className="group-hover:scale-125 transition-transform duration-300 transform-gpu drop-shadow-sm shrink-0"
                      style={{ fontSize: 'min(48px, 16cqmin)' }}
                    >
                      {item.icon ?? '👕'}
                    </span>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span
                      className="font-black text-slate-700 uppercase leading-tight tracking-tight truncate"
                      style={{ fontSize: 'min(18px, 7cqmin)' }}
                    >
                      {item.label}
                    </span>
                    <span
                      className="font-bold text-slate-300 uppercase tracking-widest"
                      style={{
                        fontSize: 'min(12px, 4.5cqmin)',
                        marginTop: 'min(2px, 0.5cqmin)',
                      }}
                    >
                      {item.category}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ScaledEmptyState
              icon={CloudSun}
              title="Perfect Weather"
              subtitle="No specific gear recommended for the current conditions."
            />
          )}
        </div>
      }
      footer={
        <div
          className="bg-slate-50/50 border-t border-slate-100 flex items-center justify-between font-black text-slate-400 uppercase tracking-widest shrink-0"
          style={{
            padding: 'min(8px, 1.5cqmin) min(12px, 2.5cqmin)',
            fontSize: 'min(11px, 4cqmin)',
          }}
        >
          <div
            className="flex items-center truncate max-w-[70%]"
            style={{ gap: 'min(4px, 1cqmin)' }}
          >
            <LinkIcon
              className="opacity-60"
              style={{
                width: 'min(10px, 3cqmin)',
                height: 'min(10px, 3cqmin)',
              }}
            />
            <span className="truncate">
              {activeWeatherConfig.locationName ?? 'Weather'} Source
            </span>
          </div>
          <div
            className="flex items-center shrink-0"
            style={{ gap: 'min(3px, 0.8cqmin)' }}
          >
            <div
              className={`bg-emerald-400 rounded-full ${
                adminConfig?.fetchingStrategy === 'admin_proxy'
                  ? 'animate-pulse'
                  : ''
              }`}
              style={{
                width: 'min(5px, 1.5cqmin)',
                height: 'min(5px, 1.5cqmin)',
              }}
            />
            <span>
              {adminConfig?.fetchingStrategy === 'admin_proxy'
                ? 'Admin'
                : 'Auto'}
            </span>
          </div>
        </div>
      }
    />
  );
};

export const RecessGearSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { activeDashboard, updateWidget } = useDashboard();
  const config = widget.config as RecessGearConfig;

  const weatherWidgets = useMemo(() => {
    return activeDashboard?.widgets.filter((w) => w.type === 'weather') ?? [];
  }, [activeDashboard?.widgets]);

  return (
    <div className="space-y-6">
      <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl space-y-4">
        <div className="flex items-center gap-2 text-emerald-900">
          <Info className="w-4 h-4" />
          <span className="text-xs font-black uppercase tracking-wider">
            Smart Linking
          </span>
        </div>
        <p className="text-xxs text-emerald-800 leading-relaxed">
          Recess Gear automatically updates based on the current temperature and
          conditions from your Weather widget.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
          <div className="flex flex-col gap-0.5">
            <span className="text-xxs font-bold text-slate-700 uppercase tracking-tight">
              Use &quot;Feels Like&quot; Temp
            </span>
            <span className="text-xxs text-slate-400 leading-tight">
              Use wind chill and heat index for gear calculation.
            </span>
          </div>
          <Toggle
            size="sm"
            checked={config.useFeelsLike ?? true}
            onChange={(checked) =>
              updateWidget(widget.id, {
                config: { ...config, useFeelsLike: checked },
              })
            }
          />
        </div>

        <div className="space-y-2">
          <label className="text-xxs font-black text-slate-400 uppercase tracking-widest block px-1">
            Source Weather Widget
          </label>
          <select
            value={config.linkedWeatherWidgetId ?? ''}
            onChange={(e) =>
              updateWidget(widget.id, {
                config: {
                  ...config,
                  linkedWeatherWidgetId: e.target.value || null,
                },
              })
            }
            className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700"
          >
            <option value="">Auto-select (First available)</option>
            {weatherWidgets.map((w) => (
              <option key={w.id} value={w.id}>
                Weather at{' '}
                {(w.config as WeatherConfig).locationName ?? 'Classroom'}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
