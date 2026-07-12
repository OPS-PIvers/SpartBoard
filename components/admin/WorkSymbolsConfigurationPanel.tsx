import React from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import { BuildingSelector } from './BuildingSelector';
import {
  WorkSymbolsGlobalConfig,
  BuildingWorkSymbolsDefaults,
  TextSizePreset,
} from '@/types';
import { Card } from '@/components/common/Card';
import { FONTS } from '@/config/fonts';
import { HexColorField } from './HexColorField';

interface WorkSymbolsConfigurationPanelProps {
  config: WorkSymbolsGlobalConfig;
  onChange: (newConfig: WorkSymbolsGlobalConfig) => void;
}

const TEXT_SIZE_PRESET_OPTIONS: { value: TextSizePreset; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'x-large', label: 'Extra Large' },
];

const TITLE_POSITION_OPTIONS: {
  value: NonNullable<BuildingWorkSymbolsDefaults['titlePosition']>;
  label: string;
}[] = [
  { value: 'bottom', label: 'Bottom' },
  { value: 'top', label: 'Top' },
];

// Admin building-default panel for Work Symbols appearance fields (font family, text size, colour, title position); symbol library is configured separately in the surrounding modal.
export const WorkSymbolsConfigurationPanel: React.FC<
  WorkSymbolsConfigurationPanelProps
> = ({ config, onChange }) => {
  const BUILDINGS = useAdminBuildings();
  const [selectedBuildingId, setSelectedBuildingId] =
    useBuildingSelection(BUILDINGS);

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingWorkSymbolsDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
  };

  const handleUpdateBuilding = (
    updates: Partial<BuildingWorkSymbolsDefaults>
  ) => {
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

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building Work Symbols Defaults
        </label>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      <Card rounded="xl" shadow="none" className="bg-slate-50 space-y-4">
        <p className="text-xxs text-slate-500 leading-tight">
          These appearance defaults pre-populate the Work Symbols widget when a
          teacher in{' '}
          <b>
            {BUILDINGS.find((b) => b.id === selectedBuildingId)?.name ??
              'this building'}
          </b>{' '}
          adds it to their dashboard. Teachers can still override them
          per-instance from the widget&apos;s Appearance tab.
        </p>

        {/* Default Font Family */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
            Default Font Family
          </label>
          <select
            value={currentBuildingConfig.fontFamily ?? 'global'}
            onChange={(e) => {
              const selected = e.target.value;
              handleUpdateBuilding({
                // 'global' is the sentinel for "inherit the dashboard font" —
                // persist it as undefined so saved configs only ever hold a
                // concrete FONTS id (mirrors TypographySettings behaviour).
                fontFamily: selected === 'global' ? undefined : selected,
              });
            }}
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none bg-white"
          >
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.id === 'global'
                  ? 'Global (Dashboard default)'
                  : `${f.label} (${f.icon})`}
              </option>
            ))}
          </select>
        </div>

        {/* Default Text Size */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
            Default Text Size
          </label>
          <select
            value={currentBuildingConfig.textSizePreset ?? 'medium'}
            onChange={(e) =>
              handleUpdateBuilding({
                textSizePreset: e.target.value as TextSizePreset,
              })
            }
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none bg-white"
          >
            {TEXT_SIZE_PRESET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Default Text Colour */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
            Default Text Colour
          </label>
          <HexColorField
            value={currentBuildingConfig.fontColor}
            onChange={(fontColor) => handleUpdateBuilding({ fontColor })}
            fallback="#1e293b"
            ariaLabel="Pick default Work Symbols text colour"
          />
        </div>

        {/* Default Title Position */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
            Default Title Position
          </label>
          <select
            value={currentBuildingConfig.titlePosition ?? 'bottom'}
            onChange={(e) =>
              handleUpdateBuilding({
                titlePosition: e.target
                  .value as BuildingWorkSymbolsDefaults['titlePosition'],
              })
            }
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none bg-white"
          >
            {TITLE_POSITION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </Card>
    </div>
  );
};
