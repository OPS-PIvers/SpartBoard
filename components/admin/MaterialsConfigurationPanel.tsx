import React, { useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import { MaterialsGlobalConfig, BuildingMaterialsDefaults } from '@/types';
import { MATERIAL_ITEMS } from '../widgets/MaterialsWidget/constants';

interface MaterialsConfigurationPanelProps {
  config: MaterialsGlobalConfig;
  onChange: (newConfig: MaterialsGlobalConfig) => void;
}

export const MaterialsConfigurationPanel: React.FC<
  MaterialsConfigurationPanelProps
> = ({ config, onChange }) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingMaterialsDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
    selectedItems: [],
  };

  const selectedItems = new Set(currentBuildingConfig.selectedItems ?? []);

  const handleUpdateBuilding = (
    updates: Partial<BuildingMaterialsDefaults>
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

  const toggleItem = (id: string) => {
    const next = new Set(selectedItems);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    handleUpdateBuilding({ selectedItems: Array.from(next) });
  };

  const isAllSelected = selectedItems.size === MATERIAL_ITEMS.length;

  const toggleAll = () => {
    if (isAllSelected) {
      handleUpdateBuilding({ selectedItems: [] });
    } else {
      handleUpdateBuilding({
        selectedItems: MATERIAL_ITEMS.map((item) => item.id),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building Materials Defaults
        </label>
        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
          {BUILDINGS.map((building) => (
            <button
              key={building.id}
              onClick={() => setSelectedBuildingId(building.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border whitespace-nowrap transition-colors ${
                selectedBuildingId === building.id
                  ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {building.name}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
        <p className="text-xxs text-slate-500 leading-tight">
          These defaults will pre-select materials in the Materials widget when
          a teacher in{' '}
          <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b> adds
          it to their dashboard.
        </p>

        {/* Select All toggle */}
        <div className="flex items-center justify-between">
          <label className="text-xxs font-bold text-slate-500 uppercase block">
            Default Materials ({selectedItems.size}/{MATERIAL_ITEMS.length}{' '}
            selected)
          </label>
          <button
            onClick={toggleAll}
            className="text-xxs font-bold text-brand-blue-primary hover:text-brand-blue-dark transition-colors"
          >
            {isAllSelected ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        {/* Materials grid */}
        <div className="grid grid-cols-2 gap-1.5">
          {MATERIAL_ITEMS.map((item) => {
            const isSelected = selectedItems.has(item.id);
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-colors ${
                  isSelected
                    ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-xs font-bold truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        {selectedItems.size === 0 && (
          <p className="text-xxs text-slate-400 italic text-center">
            No materials selected. Teachers will see all materials by default.
          </p>
        )}
      </div>
    </div>
  );
};
