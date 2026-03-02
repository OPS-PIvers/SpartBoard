import React, { useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import {
  ScheduleGlobalConfig,
  BuildingScheduleDefaults,
  ScheduleItem,
} from '@/types';
import { Plus, Trash2, Clock, Settings2, GripVertical } from 'lucide-react';

interface ScheduleConfigurationPanelProps {
  config: ScheduleGlobalConfig;
  onChange: (newConfig: ScheduleGlobalConfig) => void;
}

export const ScheduleConfigurationPanel: React.FC<
  ScheduleConfigurationPanelProps
> = ({ config, onChange }) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig = buildingDefaults[selectedBuildingId] ?? {
    buildingId: selectedBuildingId,
    items: [],
  };

  const handleUpdateBuilding = (updates: Partial<BuildingScheduleDefaults>) => {
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

  const addDefaultItem = () => {
    const newItem: ScheduleItem = {
      id: crypto.randomUUID(),
      task: 'New Default Task',
      startTime: '08:00',
      endTime: '09:00',
      mode: 'clock',
    };
    handleUpdateBuilding({
      items: [...currentBuildingConfig.items, newItem],
    });
  };

  const updateDefaultItem = (
    itemId: string,
    updates: Partial<ScheduleItem>
  ) => {
    const newItems = currentBuildingConfig.items.map((item) =>
      item.id === itemId ? { ...item, ...updates } : item
    );
    handleUpdateBuilding({ items: newItems });
  };

  const removeDefaultItem = (itemId: string) => {
    handleUpdateBuilding({
      items: currentBuildingConfig.items.filter((item) => item.id !== itemId),
    });
  };

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block flex items-center gap-2">
          <Settings2 className="w-3 h-3" /> Configure Building Schedule Defaults
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

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        {/* Building Defaults (A/B Schedule) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" /> Default Schedule Items
            </h5>
            <button
              onClick={addDefaultItem}
              className="text-xxs font-bold text-brand-blue-primary hover:text-brand-blue-dark flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add Item
            </button>
          </div>
          <p className="text-xxs text-slate-500 mb-4 leading-tight">
            These items will pre-populate the widget when a teacher in{' '}
            <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b>{' '}
            instantiates it.
          </p>

          <div className="space-y-2">
            {currentBuildingConfig.items.map((item) => (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-lg p-2 flex items-center gap-3 shadow-sm"
              >
                <GripVertical className="w-4 h-4 text-slate-300 shrink-0" />
                <div className="flex-1 grid grid-cols-12 gap-2">
                  <div className="col-span-6">
                    <input
                      type="text"
                      value={item.task}
                      onChange={(e) =>
                        item.id &&
                        updateDefaultItem(item.id, { task: e.target.value })
                      }
                      placeholder="Task Name"
                      className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:border-brand-blue-primary outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="time"
                      value={item.startTime}
                      onChange={(e) =>
                        item.id &&
                        updateDefaultItem(item.id, {
                          startTime: e.target.value,
                        })
                      }
                      className="w-full px-1 py-1 text-xs border border-slate-200 rounded outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="time"
                      value={item.endTime}
                      onChange={(e) =>
                        item.id &&
                        updateDefaultItem(item.id, { endTime: e.target.value })
                      }
                      className="w-full px-1 py-1 text-xs border border-slate-200 rounded outline-none"
                    />
                  </div>
                  <div className="col-span-2 flex items-center justify-end">
                    <button
                      onClick={() => item.id && removeDefaultItem(item.id)}
                      className="text-red-400 hover:text-red-600 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {currentBuildingConfig.items.length === 0 && (
              <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xxs italic">
                No default items configured for this building.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
