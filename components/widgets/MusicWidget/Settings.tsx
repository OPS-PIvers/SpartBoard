import React from 'react';
import { LayoutGrid, Music, Palette } from 'lucide-react';
import { WidgetData, MusicConfig, MusicLayout } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useMusicStations } from '@/hooks/useMusicStations';
import { Toggle } from '@/components/common/Toggle';
import {
  WIDGET_PALETTE,
  STANDARD_COLORS,
  TRANSPARENT_BG_URL,
} from '@/config/colors';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { buildSpotifyEmbedUrl } from './utils';

// ---------------------------------------------------------------------------
// Layout option descriptor
// ---------------------------------------------------------------------------

const LAYOUT_OPTIONS: {
  value: MusicLayout;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'default',
    label: 'Default',
    description: 'Thumbnail + info, adapts to widget size',
    icon: (
      <svg viewBox="0 0 36 24" className="w-9 h-6" fill="none">
        <rect width="36" height="24" rx="3" fill="#f1f5f9" />
        <rect x="3" y="3" width="12" height="18" rx="2" fill="#cbd5e1" />
        <rect x="18" y="5" width="15" height="4" rx="1.5" fill="#94a3b8" />
        <rect x="18" y="12" width="11" height="3" rx="1.5" fill="#cbd5e1" />
      </svg>
    ),
  },
  {
    value: 'minimal',
    label: 'Minimal',
    description: 'Full-bleed thumbnail with centered play button',
    icon: (
      <svg viewBox="0 0 36 24" className="w-9 h-6" fill="none">
        <rect width="36" height="24" rx="3" fill="#cbd5e1" />
        <circle cx="18" cy="10" r="5" fill="white" fillOpacity="0.9" />
        <polygon points="16,8 16,12 21,10" fill="#1e293b" />
        <rect
          x="0"
          y="17"
          width="36"
          height="7"
          rx="3"
          fill="black"
          fillOpacity="0.55"
        />
        <rect
          x="3"
          y="19"
          width="14"
          height="2"
          rx="1"
          fill="white"
          fillOpacity="0.8"
        />
      </svg>
    ),
  },
  {
    value: 'small',
    label: 'Small',
    description:
      'Compact horizontal bar — thumbnail left, scrolling title right',
    icon: (
      <svg viewBox="0 0 36 24" className="w-9 h-6" fill="none">
        <rect width="36" height="24" rx="3" fill="#f1f5f9" />
        <rect x="3" y="4" width="10" height="16" rx="2" fill="#cbd5e1" />
        <rect x="16" y="8" width="17" height="3" rx="1.5" fill="#94a3b8" />
        <rect x="16" y="14" width="12" height="2" rx="1" fill="#cbd5e1" />
      </svg>
    ),
  },
];

// ---------------------------------------------------------------------------
// MusicSettings — back face
// ---------------------------------------------------------------------------

export const MusicSettings: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as MusicConfig;
  const { stations, isLoading } = useMusicStations();
  const { layout = 'default' } = config;

  const activeStation = stations.find((s) => s.id === config.stationId);
  const isSpotify = activeStation?.url
    ? buildSpotifyEmbedUrl(activeStation.url) !== null
    : false;

  return (
    <div className="space-y-5">
      {/* ── Layout selector ── */}
      <div className="space-y-2">
        <SettingsLabel icon={LayoutGrid}>Layout</SettingsLabel>
        <div className="grid grid-cols-3 gap-2">
          {LAYOUT_OPTIONS.map((opt) => {
            const isActive = layout === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() =>
                  updateWidget(widget.id, {
                    config: { ...config, layout: opt.value },
                  })
                }
                title={opt.description}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all text-center ${
                  isActive
                    ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                    : 'border-slate-100 hover:border-slate-300 bg-white'
                }`}
              >
                {opt.icon}
                <span
                  className={`text-xxs font-bold block w-full truncate ${isActive ? 'text-indigo-700' : 'text-slate-600'}`}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Station selector ── */}
      <div className="space-y-2 pt-1 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-4">
          Select a Station
        </p>

        {isLoading ? (
          <p className="text-xs text-slate-400 animate-pulse">
            Loading stations...
          </p>
        ) : stations.length === 0 ? (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <p className="text-xs text-slate-500">
              No stations available. An admin needs to add them in Admin
              Settings.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
            {stations.map((station) => {
              const isActive = config.stationId === station.id;
              return (
                <button
                  key={station.id}
                  onClick={() => {
                    const selectedIsSpotify =
                      buildSpotifyEmbedUrl(station.url) !== null;
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        stationId: station.id,
                        ...(selectedIsSpotify && config.syncWithTimeTool
                          ? { syncWithTimeTool: false }
                          : {}),
                      },
                    });
                  }}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${
                    isActive
                      ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                      : 'border-slate-100 hover:border-slate-300 bg-white'
                  }`}
                >
                  {station.thumbnail ? (
                    <div
                      className="w-10 h-10 rounded-full bg-cover bg-center shadow-sm"
                      style={{ backgroundImage: `url(${station.thumbnail})` }}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                      <Music className="w-4 h-4 text-slate-400" />
                    </div>
                  )}
                  <span className="text-xxs font-bold block w-full truncate text-slate-800">
                    {station.title}
                  </span>
                  {station.genre && (
                    <span className="text-xxs text-slate-400 font-normal truncate w-full">
                      {station.genre}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Nexus sync toggle ── */}
      <div className="pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">
            Sync with Time Tool
          </span>
          <Toggle
            checked={!!config.syncWithTimeTool}
            onChange={(checked: boolean) =>
              updateWidget(widget.id, {
                config: { ...config, syncWithTimeTool: checked },
              })
            }
            disabled={isSpotify}
            size="sm"
          />
        </div>
        <p className="text-xs text-slate-400 mt-1.5">
          {isSpotify
            ? 'Auto-sync is only available for YouTube stations due to Spotify browser restrictions.'
            : 'Music will automatically play and pause with your active Time Tool.'}
        </p>
      </div>
    </div>
  );
};

export const MusicAppearanceSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as MusicConfig;
  const { bgColor = '#ffffff', textColor = STANDARD_COLORS.slate } = config;

  const bgColors = [
    { hex: '#ffffff', label: 'White' },
    { hex: '#f8fafc', label: 'Slate' },
    { hex: '#1e293b', label: 'Dark' },
    { hex: 'transparent', label: 'Transparent' },
  ];

  const textColors = [...WIDGET_PALETTE, '#ffffff'];

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <SettingsLabel icon={Palette}>Background</SettingsLabel>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {bgColors.map((c) => (
            <button
              key={c.hex}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, bgColor: c.hex },
                })
              }
              className={`w-6 h-6 rounded-full border-2 transition-all ${
                bgColor === c.hex
                  ? 'border-indigo-500 scale-110 shadow-md'
                  : 'border-slate-200'
              }`}
              style={{
                backgroundColor: c.hex !== 'transparent' ? c.hex : undefined,
                backgroundImage:
                  c.hex === 'transparent' ? TRANSPARENT_BG_URL : undefined,
              }}
              title={c.label}
            />
          ))}
        </div>
      </div>
      <div>
        <SettingsLabel icon={Palette}>Text Color</SettingsLabel>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {textColors.map((c) => (
            <button
              key={c}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, textColor: c },
                })
              }
              className={`w-6 h-6 rounded-full border-2 transition-all ${
                textColor === c
                  ? 'border-indigo-500 scale-110 shadow-md'
                  : 'border-slate-200'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
