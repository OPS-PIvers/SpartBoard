import React, { useState } from 'react';
import { ConceptWebGlobalConfig, GlobalFontFamily } from '@/types';
import { BUILDINGS } from '@/config/buildings';

interface Props {
  config: Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}

export const ConceptWebConfigurationPanel: React.FC<Props> = ({
  config: baseConfig,
  onChange,
}) => {
  const config = (baseConfig as unknown as ConceptWebGlobalConfig) ?? {
    buildingDefaults: {},
  };
  const [activeBuildingId, setActiveBuildingId] = useState(BUILDINGS[0].id);

  const buildingConfig = config.buildingDefaults?.[activeBuildingId] ?? {
    buildingId: activeBuildingId,
  };

  const updateBuildingConfig = (
    updates: Partial<typeof buildingConfig>
  ) => {
    onChange({
      ...config,
      buildingDefaults: {
        ...(config.buildingDefaults ?? {}),
        [activeBuildingId]: {
          ...buildingConfig,
          ...updates,
        },
      },
    } as unknown as Record<string, unknown>);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Building Tabs */}
      <div className="flex overflow-x-auto gap-2 pb-2 custom-scrollbar">
        {BUILDINGS.map((building) => (
          <button
            key={building.id}
            onClick={() => setActiveBuildingId(building.id)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-colors ${
              activeBuildingId === building.id
                ? 'bg-brand-blue-primary text-white shadow-sm'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {building.name}
          </button>
        ))}
      </div>

      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-6">
        <div>
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-1">
            Default Node Dimensions
          </h3>
          <p className="text-xs text-slate-500 mb-4 font-bold">
            Set the default width and height (as a percentage of the widget) for new nodes created in this building.
          </p>
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
                  const value = parseInt(e.target.value, 10);
                  updateBuildingConfig({
                    defaultNodeWidth: !isNaN(value) ? value : undefined,
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
                  const value = parseInt(e.target.value, 10);
                  updateBuildingConfig({
                    defaultNodeHeight: !isNaN(value) ? value : undefined,
                  });
                }}
                className="w-full px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-blue-primary outline-none"
              />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-1">
            Default Font Family
          </h3>
          <p className="text-xs text-slate-500 mb-4 font-bold">
            Set the default font style for text inside nodes.
          </p>
          <select
            value={buildingConfig.fontFamily ?? 'global'}
            onChange={(e) => {
              const selected = e.target.value;
              const fontFamily =
                selected === 'global' ? undefined : (selected as GlobalFontFamily);
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
      </div>
    </div>
  );
};
