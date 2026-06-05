import React from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import { BuildingSelector } from './BuildingSelector';
import { StationsGlobalConfig, BuildingStationsDefaults } from '@/types';
import { Card } from '@/components/common/Card';
import { FONTS } from '@/config/fonts';
import { HexColorField } from './HexColorField';

interface StationsConfigurationPanelProps {
  config: StationsGlobalConfig;
  onChange: (newConfig: StationsGlobalConfig) => void;
}

/**
 * Admin building-default panel for the Stations widget. Exposes the four
 * appearance fields the widget actually consumes (font family, text colour,
 * card surface colour, card opacity). `fontFamily` is stored in the shared
 * `TypographySettings` value space (`FONTS` ids like `'font-sans'`), so the
 * value seeded into a new widget instance matches what the teacher's own
 * Appearance tab would write — keeping the in-widget font selector in sync.
 */
export const StationsConfigurationPanel: React.FC<
  StationsConfigurationPanelProps
> = ({ config, onChange }) => {
  const BUILDINGS = useAdminBuildings();
  const [selectedBuildingId, setSelectedBuildingId] =
    useBuildingSelection(BUILDINGS);

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingStationsDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
  };

  const handleUpdateBuilding = (updates: Partial<BuildingStationsDefaults>) => {
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

  const cardOpacity = currentBuildingConfig.cardOpacity ?? 1;

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building Stations Defaults
        </label>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      <Card rounded="xl" shadow="none" className="bg-slate-50 space-y-4">
        <p className="text-xxs text-slate-500 leading-tight">
          These appearance defaults pre-populate the Stations widget when a
          teacher in{' '}
          <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b> adds
          it to their dashboard. Teachers can still override them per-instance
          from the widget&apos;s Appearance tab.
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

        {/* Default Text Colour */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
            Default Text Colour
          </label>
          <HexColorField
            value={currentBuildingConfig.fontColor}
            onChange={(fontColor) => handleUpdateBuilding({ fontColor })}
            fallback="#334155"
            ariaLabel="Pick default stations text colour"
          />
        </div>

        {/* Default Surface Colour */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
            Default Surface Colour
          </label>
          <HexColorField
            value={currentBuildingConfig.cardColor}
            onChange={(cardColor) => handleUpdateBuilding({ cardColor })}
            fallback="#ffffff"
            ariaLabel="Pick default stations surface colour"
          />
        </div>

        {/* Default Surface Opacity */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
            Default Surface Opacity ({Math.round(cardOpacity * 100)}%)
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={cardOpacity}
            onChange={(e) =>
              handleUpdateBuilding({
                cardOpacity: parseFloat(e.target.value),
              })
            }
            className="w-full accent-brand-blue-primary"
            aria-label="Default stations surface opacity"
          />
        </div>
      </Card>
    </div>
  );
};
