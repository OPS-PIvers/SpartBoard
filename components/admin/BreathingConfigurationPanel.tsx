import React, { useId } from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import {
  canonicalBuildingId,
  canonicalizeBuildingKeyedRecord,
} from '@/config/buildings';
import { BuildingSelector } from './BuildingSelector';
import {
  BreathingGlobalConfig,
  BuildingBreathingDefaults,
  BreathingConfig,
} from '@/types';
import { WIDGET_PALETTE } from '@/config/colors';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { Card } from '@/components/common/Card';
import { handleRadioGroupKeyDown } from '@/components/common/radioGroupKeyNav';

interface BreathingConfigurationPanelProps {
  config: BreathingGlobalConfig;
  onChange: (newConfig: BreathingGlobalConfig) => void;
}

const PATTERNS: {
  value: BreathingConfig['pattern'] | 'global';
  label: string;
}[] = [
  { value: 'global', label: 'Inherit (Default)' },
  { value: '4-4-4-4', label: 'Box Breathing' },
  { value: '4-7-8', label: 'Relaxing Breath' },
  { value: '5-5', label: 'Coherent Breath' },
];

const VISUALS: {
  value: BreathingConfig['visual'] | 'global';
  label: string;
}[] = [
  { value: 'global', label: 'Inherit (Default)' },
  { value: 'circle', label: 'Sphere' },
  { value: 'lotus', label: 'Lotus' },
  { value: 'wave', label: 'Ripple' },
];

export const BreathingConfigurationPanel: React.FC<
  BreathingConfigurationPanelProps
> = ({ config, onChange }) => {
  const BUILDINGS = useAdminBuildings();
  const [selectedBuildingId, setSelectedBuildingId] =
    useBuildingSelection(BUILDINGS);
  const patternLabelId = useId();
  const visualLabelId = useId();
  const colorLabelId = useId();

  // useAdminBuildings() can return a legacy long-form id; key buildingDefaults off the canonical id.
  const canonicalId = canonicalBuildingId(selectedBuildingId);

  const buildingDefaults = canonicalizeBuildingKeyedRecord(
    config.buildingDefaults ?? {}
  );
  const currentBuildingConfig: BuildingBreathingDefaults = buildingDefaults[
    canonicalId
  ] ?? {
    buildingId: canonicalId,
  };
  const hasColorSelected = WIDGET_PALETTE.some(
    (c) => c === currentBuildingConfig.color
  );

  const handleUpdateBuilding = (
    updates: Partial<BuildingBreathingDefaults>
  ) => {
    onChange({
      ...config,
      buildingDefaults: {
        ...buildingDefaults,
        [canonicalId]: {
          ...currentBuildingConfig,
          ...updates,
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <SettingsLabel>Configure Building Breathing Defaults</SettingsLabel>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      <Card rounded="xl" shadow="none" className="bg-slate-50 space-y-4">
        <p className="text-xxs text-slate-500 leading-tight">
          These defaults will pre-configure the Breathing widget when a teacher
          in <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b>{' '}
          adds it to their dashboard.
        </p>

        {/* Pattern Selection */}
        <div>
          <SettingsLabel as="span" id={patternLabelId} className="mb-1">
            Default Pattern
          </SettingsLabel>
          <div
            className="flex flex-wrap bg-white rounded-lg border border-slate-200 p-1 gap-1"
            role="radiogroup"
            aria-labelledby={patternLabelId}
            onKeyDown={(e) =>
              handleRadioGroupKeyDown(e, PATTERNS, (opt) =>
                handleUpdateBuilding({
                  pattern: opt.value === 'global' ? undefined : opt.value,
                })
              )
            }
          >
            {PATTERNS.map((opt) => {
              const checked =
                (currentBuildingConfig.pattern ?? 'global') === opt.value;
              return (
                <button
                  key={opt.value}
                  role="radio"
                  aria-checked={checked}
                  tabIndex={checked ? 0 : -1}
                  onClick={() =>
                    handleUpdateBuilding({
                      pattern: opt.value === 'global' ? undefined : opt.value,
                    })
                  }
                  className={`flex-1 py-1.5 px-2 text-xxs font-bold rounded transition-colors whitespace-nowrap ${
                    checked
                      ? 'bg-brand-blue-primary text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Visual Selection */}
        <div>
          <SettingsLabel as="span" id={visualLabelId} className="mb-1">
            Default Visual Style
          </SettingsLabel>
          <div
            className="flex flex-wrap bg-white rounded-lg border border-slate-200 p-1 gap-1"
            role="radiogroup"
            aria-labelledby={visualLabelId}
            onKeyDown={(e) =>
              handleRadioGroupKeyDown(e, VISUALS, (opt) =>
                handleUpdateBuilding({
                  visual: opt.value === 'global' ? undefined : opt.value,
                })
              )
            }
          >
            {VISUALS.map((opt) => {
              const checked =
                (currentBuildingConfig.visual ?? 'global') === opt.value;
              return (
                <button
                  key={opt.value}
                  role="radio"
                  aria-checked={checked}
                  tabIndex={checked ? 0 : -1}
                  onClick={() =>
                    handleUpdateBuilding({
                      visual: opt.value === 'global' ? undefined : opt.value,
                    })
                  }
                  className={`flex-1 py-1.5 px-2 text-xxs font-bold rounded transition-colors whitespace-nowrap ${
                    checked
                      ? 'bg-brand-blue-primary text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Color Theme */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <SettingsLabel as="span" id={colorLabelId} className="mb-0">
              Default Color Theme
            </SettingsLabel>
            {!currentBuildingConfig.color ? (
              <span className="text-xxs text-slate-400 italic">
                Inherit (Default)
              </span>
            ) : (
              <button
                onClick={() => handleUpdateBuilding({ color: undefined })}
                className="text-xxs text-slate-400 hover:text-red-500 font-bold transition-colors"
              >
                Clear Override
              </button>
            )}
          </div>
          <div
            className="flex flex-wrap gap-2 p-2 bg-white rounded-lg border border-slate-200"
            role="radiogroup"
            aria-labelledby={colorLabelId}
            onKeyDown={(e) =>
              handleRadioGroupKeyDown(e, WIDGET_PALETTE, (color) =>
                handleUpdateBuilding({ color })
              )
            }
          >
            {WIDGET_PALETTE.map((color, idx) => {
              const checked = currentBuildingConfig.color === color;
              const tabbable = checked || (!hasColorSelected && idx === 0);
              return (
                <button
                  key={color}
                  role="radio"
                  aria-checked={checked}
                  tabIndex={tabbable ? 0 : -1}
                  onClick={() => handleUpdateBuilding({ color })}
                  className={`w-6 h-6 rounded-full transition-all border-2 ${
                    checked
                      ? 'border-slate-800 scale-110 shadow-md'
                      : 'border-transparent hover:scale-105 shadow-sm'
                  }`}
                  style={{ backgroundColor: color }}
                  title={`Select color ${color}`}
                  aria-label={`Select color ${color}`}
                />
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
};
