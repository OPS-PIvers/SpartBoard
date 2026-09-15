import React, { useMemo } from 'react';
import { Toggle } from '@/components/common/Toggle';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { useAuth } from '@/context/useAuth';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import type { SoundboardConfig, SoundboardGlobalConfig } from '@/types';
import { getAvailableSoundboardSounds } from '@/utils/soundboardConfig';

export const SoundboardSoundPickerField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const config = ctx.config as unknown as SoundboardConfig;
  const selectedSoundIds = config.selectedSoundIds ?? [];
  const { featurePermissions } = useAuth();
  const buildingId = useWidgetBuildingId(ctx.widget) ?? null;

  const globalConfig = useMemo(() => {
    const permission = featurePermissions.find(
      (candidate) => candidate.widgetType === 'soundboard'
    );
    return permission?.config as SoundboardGlobalConfig | undefined;
  }, [featurePermissions]);
  const availableSounds = useMemo(
    () => getAvailableSoundboardSounds(globalConfig, buildingId),
    [globalConfig, buildingId]
  );

  const toggleSound = (id: string, selected: boolean) => {
    const next = selected
      ? Array.from(new Set([...selectedSoundIds, id]))
      : selectedSoundIds.filter((soundId) => soundId !== id);
    ctx.updateConfig({ selectedSoundIds: next });
  };

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-2"
    >
      {availableSounds.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-center text-sm italic text-slate-500">
          {ctx.t('widgetSettings.soundboard.noSounds')}
        </p>
      ) : (
        availableSounds.map((sound) => {
          const selected = selectedSoundIds.includes(sound.id);
          return (
            <div
              key={sound.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="h-8 w-8 shrink-0 rounded-lg shadow-inner"
                  style={{ backgroundColor: sound.color ?? '#6366f1' }}
                />
                <span className="truncate text-sm font-bold text-slate-700">
                  {sound.label}
                </span>
              </span>
              <Toggle
                checked={selected}
                onChange={(checked) => toggleSound(sound.id, checked)}
                label={sound.label}
                showLabels={false}
              />
            </div>
          );
        })
      )}
    </div>
  );
};
