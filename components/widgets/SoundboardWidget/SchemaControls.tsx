import React, { useMemo } from 'react';
import { WidgetData, SoundboardConfig, SoundboardGlobalConfig } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { Toggle } from '@/components/common/Toggle';
import { getAvailableSoundboardSounds } from '@/utils/soundboardConfig';

export const SoundboardSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as SoundboardConfig;
  const { selectedSoundIds = [] } = config;

  const { featurePermissions } = useAuth();
  const buildingId = useWidgetBuildingId(widget) ?? null;

  const globalConfig = useMemo(() => {
    const perm = featurePermissions.find((p) => p.widgetType === 'soundboard');
    return perm?.config as SoundboardGlobalConfig | undefined;
  }, [featurePermissions]);

  const availableSounds = useMemo(
    () => getAvailableSoundboardSounds(globalConfig, buildingId),
    [globalConfig, buildingId]
  );

  const handleToggleSound = (id: string, isSelected: boolean) => {
    let newSelection = [...selectedSoundIds];
    if (isSelected && !newSelection.includes(id)) {
      newSelection.push(id);
    } else if (!isSelected) {
      newSelection = newSelection.filter((sid) => sid !== id);
    }
    updateWidget(widget.id, {
      config: { ...config, selectedSoundIds: newSelection },
    });
  };

  return (
    <div className="p-4 space-y-6">
      <div>
        <label className="block text-xs font-bold text-slate-600 mb-4 uppercase tracking-wider">
          Available Sounds
        </label>

        {availableSounds.length === 0 ? (
          <div className="text-sm text-slate-500 italic p-4 bg-slate-50 rounded-xl border border-slate-100 text-center">
            No sounds have been configured for your building. Contact an
            administrator.
          </div>
        ) : (
          <div className="space-y-3">
            {availableSounds.map((sound) => {
              const isSelected = selectedSoundIds.includes(sound.id);
              return (
                <div
                  key={sound.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg shadow-inner flex-shrink-0"
                      style={{ backgroundColor: sound.color ?? '#6366f1' }}
                    />
                    <div className="flex flex-col">
                      <button
                        type="button"
                        className="text-sm font-bold text-slate-700 cursor-pointer bg-transparent p-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded-md"
                        onClick={() => handleToggleSound(sound.id, !isSelected)}
                      >
                        {sound.label}
                      </button>
                    </div>
                  </div>
                  <Toggle
                    checked={isSelected}
                    onChange={(checked) => handleToggleSound(sound.id, checked)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-xs text-slate-400 mt-4 leading-relaxed bg-blue-50/50 p-3 rounded-xl">
        Select which sounds you want to appear as buttons on your board. Only
        the sounds selected above will be visible on the widget.
      </div>
    </div>
  );
};
