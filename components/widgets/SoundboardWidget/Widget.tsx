import React, { useMemo } from 'react';
import {
  WidgetData,
  SoundboardConfig,
  SoundboardGlobalConfig,
  SoundboardSound,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { Volume2 } from 'lucide-react';

export const SoundboardWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as SoundboardConfig;
  const { selectedSoundIds = [] } = config;

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
      availableSounds = Object.values(allDefaults).flatMap(
        (d) => d.availableSounds ?? []
      );
    } else {
      availableSounds =
        globalConfig?.buildingDefaults?.[buildingId]?.availableSounds ?? [];
    }

    return availableSounds.filter(
      (sound) =>
        selectedSoundIds.includes(sound.id) &&
        typeof sound.url === 'string' &&
        sound.url.trim() !== ''
    );
  }, [globalConfig, buildingId, selectedSoundIds]);

  const playSound = (url: string) => {
    if (!url) return;
    const audio = new Audio(url);
    audio.play().catch(() => {
      /* silent */
    });
  };

  if (visibleSounds.length === 0) {
    return (
      <ScaledEmptyState
        icon={Volume2}
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
          {visibleSounds.map((sound) => (
            <button
              key={sound.id}
              onClick={() => playSound(sound.url)}
              className="relative overflow-hidden rounded-[min(16px,3cqmin)] flex flex-col items-center justify-center transition-transform active:scale-95 group shadow-sm hover:shadow-md border border-slate-200/50"
              style={{
                backgroundColor: sound.color ?? '#6366f1', // default indigo-500
              }}
            >
              {/* Overlay for interaction state */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 group-active:bg-black/10 transition-colors" />

              <Volume2
                className="text-white drop-shadow-sm mb-[min(8px,1.5cqmin)]"
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
            </button>
          ))}
        </div>
      }
    />
  );
};
