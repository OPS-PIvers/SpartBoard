import React from 'react';
import { LayoutGrid, Music, Music2, Palette, Radio } from 'lucide-react';
import { WidgetData, MusicConfig, MusicLayout, MusicSource } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useMusicStations } from '@/hooks/useMusicStations';
import { Toggle } from '@/components/common/Toggle';
import {
  WIDGET_PALETTE,
  STANDARD_COLORS,
  TRANSPARENT_BG_URL,
} from '@/config/colors';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { buildSpotifyEmbedUrl } from './utils';
import { PersonalSpotifyPanel } from './PersonalSpotifyPanel';

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

const SOURCE_OPTIONS: {
  value: MusicSource;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    value: 'curated',
    label: 'Curated stations',
    description: 'Pick from stations your admin has added.',
    icon: Radio,
  },
  {
    value: 'personal',
    label: 'My Spotify',
    description: 'Connect your own Spotify account (Premium recommended).',
    icon: Music2,
  },
];

export const MusicSettings: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const { canAccessFeature, profileLoaded } = useAuth();
  // While the profile is loading, optimistically show the source toggle (matches
  // what gated-in users see). Only hide it once profileLoaded is true AND the
  // gate explicitly denies — prevents a brief flicker that would unmount the
  // settings UI for users who do have access.
  const gateDenied = profileLoaded && !canAccessFeature('personal-spotify');
  const canUsePersonal = !gateDenied;
  const config = widget.config as MusicConfig;
  const { stations, isLoading } = useMusicStations();
  const { layout = 'default', source = 'curated' } = config;

  const activeStation = stations.find((s) => s.id === config.stationId);
  const isCuratedSpotify = activeStation?.url
    ? buildSpotifyEmbedUrl(activeStation.url) !== null
    : false;
  // The Time-Tool sync depends on the YouTube IFrame API; it's never available
  // for Spotify content (curated or personal) because Spotify embeds and the
  // Web Playback SDK don't expose the same hooks.
  const syncDisabled = isCuratedSpotify || source === 'personal';

  return (
    <div className="space-y-5">
      {/* ── Source selector (gated behind personal-spotify feature) ── */}
      {canUsePersonal && (
        <div className="space-y-2">
          <SettingsLabel icon={Music2}>Source</SettingsLabel>
          <div className="grid grid-cols-2 gap-2">
            {SOURCE_OPTIONS.map((opt) => {
              const isActive = source === opt.value;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        source: opt.value,
                        // Disable Time-Tool sync when switching to Spotify-based source.
                        ...(opt.value === 'personal' && config.syncWithTimeTool
                          ? { syncWithTimeTool: false }
                          : {}),
                      },
                    })
                  }
                  title={opt.description}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-left ${
                    isActive
                      ? 'border-green-500 bg-green-50 shadow-sm'
                      : 'border-slate-100 hover:border-slate-300 bg-white'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${isActive ? 'text-green-700' : 'text-slate-500'}`}
                  />
                  <span
                    className={`text-xs font-bold truncate ${isActive ? 'text-green-800' : 'text-slate-700'}`}
                  >
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Layout selector ── */}
      <div className="space-y-2 pt-1 border-t border-slate-100">
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

      {/* ── Source-specific body ── */}
      {source === 'personal' && canUsePersonal ? (
        <div className="pt-1 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-4 pb-2">
            Personal Spotify
          </p>
          <PersonalSpotifyPanel widget={widget} />
        </div>
      ) : (
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
                        style={{
                          backgroundImage: `url(${station.thumbnail})`,
                        }}
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
      )}

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
            disabled={syncDisabled}
            size="sm"
          />
        </div>
        <p className="text-xs text-slate-400 mt-1.5">
          {syncDisabled
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
