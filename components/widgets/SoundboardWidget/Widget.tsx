import React, { useMemo, useState } from 'react';
import {
  WidgetData,
  SoundboardConfig,
  SoundboardGlobalConfig,
  SoundboardSound,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { Volume2, Music } from 'lucide-react';
import { SOUND_LIBRARY } from '@/config/soundLibrary';

export const SoundboardWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as SoundboardConfig;
  const { selectedSoundIds = [] } = config;
  const [playingId, setPlayingId] = useState<string | null>(null);

  const { featurePermissions, selectedBuildings } = useAuth();
  const buildingId = selectedBuildings.length > 0 ? selectedBuildings[0] : null;

  const globalConfig = useMemo(() => {
    const perm = featurePermissions.find((p) => p.widgetType === 'soundboard');
    return perm?.config as SoundboardGlobalConfig | undefined;
  }, [featurePermissions]);

  const visibleSounds = useMemo(() => {
    let availableSounds: SoundboardSound[] = [];

    if (!buildingId) {
      // If no building selected, aggregate all available sounds from all building defaults
      const allDefaults = globalConfig?.buildingDefaults ?? {};
      availableSounds = Object.values(allDefaults).flatMap((d) => {
        const custom = d.availableSounds ?? [];
        const library = SOUND_LIBRARY.filter((s) =>
          d.enabledLibrarySoundIds?.includes(s.id)
        );
        return [...library, ...custom];
      });
    } else {
      const bConfig = globalConfig?.buildingDefaults?.[buildingId];
      const custom = bConfig?.availableSounds ?? [];
      const library = SOUND_LIBRARY.filter((s) =>
        bConfig?.enabledLibrarySoundIds?.includes(s.id)
      );
      availableSounds = [...library, ...custom];
    }

    // Deduplicate by ID just in case
    const seenIds = new Set<string>();
    const uniqueSounds = availableSounds.filter((s) => {
      if (seenIds.has(s.id)) return false;
      seenIds.add(s.id);
      return true;
    });

    return uniqueSounds.filter(
      (sound) =>
        selectedSoundIds.includes(sound.id) &&
        typeof sound.url === 'string' &&
        sound.url.trim() !== ''
    );
  }, [globalConfig, buildingId, selectedSoundIds]);

  const playSound = (id: string, url: string) => {
    if (!url) return;

    // Reset playing state if another sound is clicked
    setPlayingId(id);

    const audio = new Audio(url);

    // Some browsers require user interaction, which we have here (onClick)
    // but some URLs might fail due to CORS or format issues.
    void audio
      .play()
      .catch((err) => {
        console.error(`[Soundboard] Failed to play sound ${id}:`, err);
      })
      .finally(() => {
        // Small visual feedback duration
        setTimeout(() => setPlayingId(null), 800);
      });
  };

  if (visibleSounds.length === 0) {
    return (
      <ScaledEmptyState
        icon={Music}
        title="No Sounds Selected"
        subtitle="Flip to set up your board."
      />
    );
  }

  // Calculate grid layout based on number of items
  const columns =
    visibleSounds.length > 4 ? (visibleSounds.length > 9 ? 4 : 3) : 2;

  return (
    <WidgetLayout
      padding="p-[min(12px,2cqmin)]"
      content={
        <div
          className="w-full h-full grid"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: 'min(12px, 2cqmin)',
          }}
        >
          {visibleSounds.map((sound) => {
            const isPlaying = playingId === sound.id;
            return (
              <button
                key={sound.id}
                onClick={() => playSound(sound.id, sound.url)}
                className={`relative overflow-hidden rounded-[min(16px,3cqmin)] flex flex-col items-center justify-center transition-all active:scale-95 group shadow-sm hover:shadow-md border border-slate-200/50 ${
                  isPlaying
                    ? 'ring-2 ring-white ring-offset-2 scale-105 z-10'
                    : ''
                }`}
                style={{
                  backgroundColor: sound.color ?? '#6366f1', // default indigo-500
                }}
              >
                {/* Overlay for interaction state */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 group-active:bg-black/10 transition-colors" />

                <Volume2
                  className={`text-white drop-shadow-sm mb-[min(8px,1.5cqmin)] transition-transform ${
                    isPlaying ? 'scale-125' : ''
                  }`}
                  style={{
                    width: 'min(48px, 15cqmin)',
                    height: 'min(48px, 15cqmin)',
                  }}
                />
                <span
                  className="font-black text-white text-center px-[min(8px,1.5cqmin)] leading-tight drop-shadow-md break-words max-w-full"
                  style={{ fontSize: 'min(18px, 6cqmin)' }}
                >
                  {sound.label}
                </span>

                {/* Playing indicator pulse */}
                {isPlaying && (
                  <div className="absolute inset-0 bg-white/20 animate-pulse pointer-events-none" />
                )}
              </button>
            );
          })}
        </div>
      }
    />
  );
};
