import React from 'react';
import { ConceptWebGlobalConfig, GlobalFontFamily } from '@/types';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import {
  canonicalBuildingId,
  canonicalizeBuildingKeyedRecord,
} from '@/config/buildings';
import { BuildingSelector } from './BuildingSelector';
import { HexColorField } from './HexColorField';
interface Props {
  config: Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}

export const ConceptWebConfigurationPanel: React.FC<Props> = ({
  config: baseConfig,
  onChange,
}) => {
  const BUILDINGS = useAdminBuildings();
  const config = (baseConfig as unknown as ConceptWebGlobalConfig) ?? {
    buildingDefaults: {},
  };
  const [activeBuildingId, setActiveBuildingId] =
    useBuildingSelection(BUILDINGS);
  // useAdminBuildings() can return a legacy long-form id; key buildingDefaults off the canonical id.
  const canonicalId = canonicalBuildingId(activeBuildingId);
  const buildingDefaults = canonicalizeBuildingKeyedRecord(
    config.buildingDefaults ?? {}
  );

  const buildingConfig = buildingDefaults[canonicalId] ?? {
    buildingId: canonicalId,
  };

  const updateBuildingConfig = (updates: Partial<typeof buildingConfig>) => {
    onChange({
      ...config,
      buildingDefaults: {
        ...buildingDefaults,
        [canonicalId]: {
          ...buildingConfig,
          ...updates,
        },
      },
    } as unknown as Record<string, unknown>);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Building Tabs */}
      <BuildingSelector
        selectedId={activeBuildingId}
        onSelect={setActiveBuildingId}
      />

      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-6">
        <div>
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">
            Default Node Dimensions
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-2">
                Width (%)
              </label>
              <input
                type="number"
                min="5"
                max="50"
                value={buildingConfig.defaultNodeWidth ?? 15}
                onChange={(e) => {
                  const value = e.target.valueAsNumber;
                  updateBuildingConfig({
                    defaultNodeWidth: Number.isFinite(value)
                      ? Math.max(5, Math.min(50, Math.round(value)))
                      : undefined,
                  });
                }}
                className="w-full px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-blue-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-2">
                Height (%)
              </label>
              <input
                type="number"
                min="5"
                max="50"
                value={buildingConfig.defaultNodeHeight ?? 15}
                onChange={(e) => {
                  const value = e.target.valueAsNumber;
                  updateBuildingConfig({
                    defaultNodeHeight: Number.isFinite(value)
                      ? Math.max(5, Math.min(50, Math.round(value)))
                      : undefined,
                  });
                }}
                className="w-full px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-blue-primary outline-none"
              />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">
            Default Font Family
          </h3>
          <select
            value={buildingConfig.fontFamily ?? 'global'}
            onChange={(e) => {
              const selected = e.target.value;
              const fontFamily =
                selected === 'global'
                  ? undefined
                  : (selected as GlobalFontFamily);
              updateBuildingConfig({ fontFamily });
            }}
            className="w-full px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-blue-primary outline-none"
          >
            <option value="global">Global (Dashboard default)</option>
            <option value="sans">Sans Serif</option>
            <option value="serif">Serif</option>
            <option value="mono">Monospace</option>
            <option value="comic">Comic</option>
            <option value="handwritten">Handwritten</option>
          </select>
        </div>

        <div className="border-t border-slate-200 pt-5">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">
            Appearance Defaults
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-2">
                Default Surface Colour
              </label>
              <HexColorField
                value={buildingConfig.cardColor}
                onChange={(cardColor) => updateBuildingConfig({ cardColor })}
                fallback="#ffffff"
                ariaLabel="Pick default node surface colour"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-2">
                Default Surface Opacity (
                {Math.round((buildingConfig.cardOpacity ?? 1) * 100)}%)
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={buildingConfig.cardOpacity ?? 1}
                onChange={(e) =>
                  updateBuildingConfig({
                    cardOpacity: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-brand-blue-primary"
                aria-label="Default node surface opacity"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
