import React from 'react';
import { SeatingChartGlobalConfig } from '@/types';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
interface SeatingChartConfigurationPanelProps {
  config: Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}

export const SeatingChartConfigurationPanel: React.FC<
  SeatingChartConfigurationPanelProps
> = ({ config, onChange }) => {
  const BUILDINGS = useAdminBuildings();
  const [activeBuildingId, setActiveBuildingId] =
    useBuildingSelection(BUILDINGS);

  if (!activeBuildingId) {
    return (
      <div className="p-4 text-sm text-slate-500">No buildings configured.</div>
    );
  }

  // Cast the generic config to our specific type
  const globalConfig = config as unknown as SeatingChartGlobalConfig;
  const buildingDefaults = globalConfig.buildingDefaults ?? {};
  const currentDefaults = buildingDefaults[activeBuildingId] ?? {
    buildingId: activeBuildingId,
    rosterMode: 'class',
  };

  const updateCurrentDefaults = (updates: Partial<typeof currentDefaults>) => {
    const newDefaults = {
      ...currentDefaults,
      ...updates,
      buildingId: activeBuildingId,
    };

    onChange({
      ...globalConfig,
      buildingDefaults: {
        ...buildingDefaults,
        [activeBuildingId]: newDefaults,
      },
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Building Tabs */}
      <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50 custom-scrollbar">
        {BUILDINGS.map((building) => (
          <button
            key={building.id}
            onClick={() => setActiveBuildingId(building.id)}
            className={`px-4 py-3 text-xs font-bold whitespace-nowrap transition-colors ${
              activeBuildingId === building.id
                ? 'bg-white text-brand-blue-primary border-b-2 border-brand-blue-primary'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            {building.name}
          </button>
        ))}
      </div>

      <div className="p-5 space-y-6">
        <div className="space-y-4">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">
            Seating Chart Building Defaults
          </h3>
          <p className="text-xs text-slate-500">
            Configure the default settings that are applied when a teacher in
            this building adds the Seating Chart widget to their dashboard.
          </p>

          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-5">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-2">
                Default Roster Source
              </label>
              <select
                value={currentDefaults.rosterMode ?? 'class'}
                onChange={(e) => {
                  const newRosterMode = e.target.value as 'class' | 'custom';
                  const updates: Partial<typeof currentDefaults> = {
                    rosterMode: newRosterMode,
                  };
                  updateCurrentDefaults(updates);
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-blue-primary outline-none font-bold bg-white"
              >
                <option value="class">ClassLink Roster</option>
                <option value="custom">Custom Roster</option>
              </select>
            </div>

            {currentDefaults.rosterMode === 'custom' && (
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 flex gap-3 text-blue-700">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 mt-0.5"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" x2="12" y1="8" y2="12" />
                  <line x1="12" x2="12.01" y1="16" y2="16" />
                </svg>
                <p className="text-xs leading-relaxed">
                  <strong>Privacy Note:</strong> Default custom roster names
                  cannot be configured globally to prevent exposing Personally
                  Identifiable Information (PII) to unauthorized users. Teachers
                  will start with a blank list and enter names manually.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
