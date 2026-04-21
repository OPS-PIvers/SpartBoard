import React from 'react';
import {
  SmartNotebookGlobalConfig,
  BuildingSmartNotebookDefaults,
} from '@/types';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
interface Props {
  config: SmartNotebookGlobalConfig;
  onChange: (newConfig: SmartNotebookGlobalConfig) => void;
}

export const SmartNotebookConfigurationPanel: React.FC<Props> = ({
  config,
  onChange,
}) => {
  const BUILDINGS = useAdminBuildings();
  const [activeBuildingId, setActiveBuildingId] =
    useBuildingSelection(BUILDINGS);

  const activeBuildingConfig =
    config.buildingDefaults?.[activeBuildingId] ??
    ({} as Partial<BuildingSmartNotebookDefaults>);

  const handleUpdate = (updates: Partial<BuildingSmartNotebookDefaults>) => {
    onChange({
      ...config,
      buildingDefaults: {
        ...config.buildingDefaults,
        [activeBuildingId]: {
          ...activeBuildingConfig,
          buildingId: activeBuildingId,
          ...updates,
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center text-green-600">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm tracking-wide">
              SMART NOTEBOOK DEFAULTS
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure notebook storage limits and dock defaults per building.
            </p>
          </div>
        </div>

        {/* Building Selector */}
        <div
          className="flex overflow-x-auto border-b border-slate-100 bg-slate-50/50 p-2 gap-2"
          role="tablist"
        >
          {BUILDINGS.map((building) => (
            <button
              key={building.id}
              onClick={() => setActiveBuildingId(building.id)}
              role="tab"
              aria-selected={activeBuildingId === building.id}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeBuildingId === building.id
                  ? 'bg-white text-green-700 shadow-sm border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'
              }`}
            >
              {building.name}
            </button>
          ))}
        </div>

        {/* Configuration Body */}
        <div className="p-5 space-y-8" role="tabpanel">
          {/* Storage Limit Section */}
          <section className="space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                File Upload Limits
              </h4>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <label className="text-sm font-bold text-slate-700 block mb-1">
                    File Upload Size Limit (MB)
                  </label>
                  <p className="text-xs text-slate-500">
                    Maximum allowed file size for imported notebooks. Set to 0
                    to disable limit.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="500"
                    value={activeBuildingConfig.storageLimitMb ?? 50}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw.trim() === '') {
                        handleUpdate({ storageLimitMb: undefined });
                        return;
                      }
                      const parsed = Number(raw);
                      if (Number.isNaN(parsed)) {
                        handleUpdate({ storageLimitMb: undefined });
                        return;
                      }
                      const clamped = Math.min(500, Math.max(0, parsed));
                      handleUpdate({
                        storageLimitMb: clamped,
                      });
                    }}
                    className="w-20 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <span className="text-xs font-medium text-slate-500">MB</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
