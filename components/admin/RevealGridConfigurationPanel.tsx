import React from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import { RevealGridGlobalConfig, GlobalFontFamily } from '@/types';

interface RevealGridConfigurationPanelProps {
  config: Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}

export const RevealGridConfigurationPanel: React.FC<
  RevealGridConfigurationPanelProps
> = ({ config, onChange }) => {
  const BUILDINGS = useAdminBuildings();
  const [activeBuildingId, setActiveBuildingId] =
    useBuildingSelection(BUILDINGS);

  // Cast the incoming config to our typed interface.
  const typedConfig = config as unknown as RevealGridGlobalConfig;
  const buildingDefaults = typedConfig.buildingDefaults || {};
  const currentDefaults = buildingDefaults[activeBuildingId] || {
    buildingId: activeBuildingId,
  };

  const DEFAULT_COLUMNS = 3;
  const DEFAULT_REVEAL_MODE = 'flip';
  const DEFAULT_CARD_COLOR = '#dbeafe';
  const DEFAULT_CARD_BACK_COLOR = '#dcfce7';

  const updateBuildingDefaults = (updates: Partial<typeof currentDefaults>) => {
    onChange({
      ...typedConfig,
      buildingDefaults: {
        ...buildingDefaults,
        [activeBuildingId]: {
          ...currentDefaults,
          ...updates,
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex border-b border-slate-200 overflow-x-auto custom-scrollbar">
        {BUILDINGS.map((building) => (
          <button
            key={building.id}
            onClick={() => setActiveBuildingId(building.id)}
            className={`px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
              activeBuildingId === building.id
                ? 'border-brand-blue-primary text-brand-blue-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            {building.name}
          </button>
        ))}
      </div>

      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-6">
        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">
          Default Reveal Grid Settings
        </h3>

        {/* Columns */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
            Columns
          </label>
          <div className="flex bg-white p-1 rounded-xl border border-slate-200">
            {([2, 3, 4, 5] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => updateBuildingDefaults({ columns: n })}
                className={`flex-1 py-1.5 text-xs font-black rounded-lg transition-all ${
                  (currentDefaults.columns ?? DEFAULT_COLUMNS) === n
                    ? 'bg-brand-blue-primary shadow-sm text-white'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Reveal Mode */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
            Reveal Mode
          </label>
          <div className="flex bg-white p-1 rounded-xl border border-slate-200">
            {(['flip', 'fade'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => updateBuildingDefaults({ revealMode: mode })}
                className={`flex-1 py-1.5 text-xs font-black uppercase rounded-lg transition-all ${
                  (currentDefaults.revealMode ?? DEFAULT_REVEAL_MODE) === mode
                    ? 'bg-brand-blue-primary shadow-sm text-white'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Font Family */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
            Font Family
          </label>
          <select
            value={currentDefaults.fontFamily ?? 'global'}
            onChange={(e) =>
              updateBuildingDefaults({
                fontFamily:
                  e.target.value === 'global'
                    ? undefined
                    : (e.target.value as GlobalFontFamily),
              })
            }
            className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-blue-primary outline-none font-bold"
          >
            <option value="global">Use Dashboard Default</option>
            <option value="sans">Sans Serif</option>
            <option value="serif">Serif</option>
            <option value="mono">Monospace</option>
            <option value="comic">Comic</option>
            <option value="handwritten">Handwritten</option>
            <option value="rounded">Rounded</option>
            <option value="fun">Fun</option>
            <option value="slab">Slab</option>
            <option value="retro">Retro</option>
            <option value="marker">Marker</option>
          </select>
        </div>

        {/* Default Card Front Color */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
            Default Card Front Color
          </label>
          <div className="bg-white p-3 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">
                Applied to all new cards
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {currentDefaults.defaultCardColor ?? DEFAULT_CARD_COLOR}
              </span>
            </div>
            <input
              type="color"
              value={currentDefaults.defaultCardColor ?? DEFAULT_CARD_COLOR}
              onChange={(e) =>
                updateBuildingDefaults({ defaultCardColor: e.target.value })
              }
              className="w-full h-8 rounded cursor-pointer border border-slate-200"
            />
          </div>
        </div>

        {/* Default Card Back Color */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
            Default Card Back Color
          </label>
          <div className="bg-white p-3 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">
                Background color for revealed cards
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {currentDefaults.defaultCardBackColor ??
                  DEFAULT_CARD_BACK_COLOR}
              </span>
            </div>
            <input
              type="color"
              value={
                currentDefaults.defaultCardBackColor ?? DEFAULT_CARD_BACK_COLOR
              }
              onChange={(e) =>
                updateBuildingDefaults({ defaultCardBackColor: e.target.value })
              }
              className="w-full h-8 rounded cursor-pointer border border-slate-200"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
