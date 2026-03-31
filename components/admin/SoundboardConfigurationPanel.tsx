import React, { useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import { BuildingSelector } from './BuildingSelector';
import {
  SoundboardGlobalConfig,
  SoundboardBuildingConfig,
  SoundboardSound,
} from '@/types';
import { Button } from '@/components/common/Button';
import { Plus, Trash2 } from 'lucide-react';

interface SoundboardConfigurationPanelProps {
  config: SoundboardGlobalConfig;
  onChange: (newConfig: SoundboardGlobalConfig) => void;
}

export const SoundboardConfigurationPanel: React.FC<
  SoundboardConfigurationPanelProps
> = ({ config, onChange }) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: SoundboardBuildingConfig = buildingDefaults[
    selectedBuildingId
  ] ?? {
    availableSounds: [],
  };

  const handleUpdateBuilding = (updates: Partial<SoundboardBuildingConfig>) => {
    onChange({
      ...config,
      buildingDefaults: {
        ...buildingDefaults,
        [selectedBuildingId]: {
          ...currentBuildingConfig,
          ...updates,
        },
      },
    });
  };

  const sounds = currentBuildingConfig.availableSounds || [];

  const addSound = () => {
    const newSound: SoundboardSound = {
      id: crypto.randomUUID(),
      label: 'New Sound',
      url: '',
      color: '#6366f1',
    };
    handleUpdateBuilding({ availableSounds: [...sounds, newSound] });
  };

  const updateSound = (index: number, updates: Partial<SoundboardSound>) => {
    const newSounds = [...sounds];
    newSounds[index] = { ...newSounds[index], ...updates };
    handleUpdateBuilding({ availableSounds: newSounds });
  };

  const removeSound = (index: number) => {
    const newSounds = sounds.filter((_, i) => i !== index);
    handleUpdateBuilding({ availableSounds: newSounds });
  };

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building Defaults
        </label>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
        <div className="flex justify-between items-center mb-4">
          <p className="text-xxs text-slate-500 leading-tight">
            These are the sounds that teachers in{' '}
            <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b>{' '}
            can choose to add to their Soundboard widget.
          </p>
          <Button size="sm" onClick={addSound} className="flex-shrink-0">
            <Plus size={16} className="mr-1.5" />
            Add Sound
          </Button>
        </div>

        {sounds.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400 italic border-2 border-dashed border-slate-200 rounded-xl">
            No sounds added yet. Click &quot;Add Sound&quot; to begin.
          </div>
        ) : (
          <div className="space-y-3">
            {sounds.map((sound, index) => (
              <div
                key={sound.id}
                className="bg-white p-3 rounded-xl border border-slate-200 flex items-start gap-4"
              >
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xxs font-bold text-slate-500 uppercase mb-1">
                        Button Label
                      </label>
                      <input
                        type="text"
                        value={sound.label}
                        onChange={(e) =>
                          updateSound(index, { label: e.target.value })
                        }
                        className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue-primary outline-none"
                        placeholder="e.g., Applause"
                      />
                    </div>
                    <div>
                      <label className="block text-xxs font-bold text-slate-500 uppercase mb-1">
                        Button Color
                      </label>
                      <div className="flex gap-2 items-center">
                        <input
                          type="color"
                          value={sound.color ?? '#6366f1'}
                          onChange={(e) =>
                            updateSound(index, { color: e.target.value })
                          }
                          className="h-8 w-8 rounded cursor-pointer border-0 p-0"
                        />
                        <input
                          type="text"
                          value={sound.color ?? '#6366f1'}
                          onChange={(e) =>
                            updateSound(index, { color: e.target.value })
                          }
                          className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue-primary outline-none"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xxs font-bold text-slate-500 uppercase mb-1">
                      Audio URL (mp3/wav)
                    </label>
                    <input
                      type="url"
                      value={sound.url}
                      onChange={(e) =>
                        updateSound(index, { url: e.target.value })
                      }
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue-primary outline-none"
                      placeholder="https://example.com/sound.mp3"
                    />
                  </div>
                </div>

                <button
                  onClick={() => removeSound(index)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-6"
                  title="Remove sound"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
