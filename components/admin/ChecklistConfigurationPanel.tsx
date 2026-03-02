import React, { useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import {
  ChecklistGlobalConfig,
  BuildingChecklistDefaults,
  ChecklistDefaultItem,
} from '@/types';
import { Plus, Trash2, GripVertical } from 'lucide-react';

interface ChecklistConfigurationPanelProps {
  config: ChecklistGlobalConfig;
  onChange: (newConfig: ChecklistGlobalConfig) => void;
}

export const ChecklistConfigurationPanel: React.FC<
  ChecklistConfigurationPanelProps
> = ({ config, onChange }) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );
  const [newItemText, setNewItemText] = useState('');

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingChecklistDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
    items: [],
  };

  const items: ChecklistDefaultItem[] = currentBuildingConfig.items ?? [];

  const handleUpdateBuilding = (
    updates: Partial<BuildingChecklistDefaults>
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

  const handleAddItem = () => {
    const text = newItemText.trim();
    if (!text) return;
    handleUpdateBuilding({
      items: [...items, { id: crypto.randomUUID(), text }],
    });
    setNewItemText('');
  };

  const handleUpdateItem = (id: string, value: string) => {
    handleUpdateBuilding({
      items: items.map((item) =>
        item.id === id ? { ...item, text: value } : item
      ),
    });
  };

  const handleRemoveItem = (id: string) => {
    handleUpdateBuilding({ items: items.filter((item) => item.id !== id) });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddItem();
    }
  };

  const scaleMultiplier = currentBuildingConfig.scaleMultiplier ?? 1;

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building Checklist Defaults
        </label>
        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
          {BUILDINGS.map((building) => (
            <button
              key={building.id}
              onClick={() => {
                setSelectedBuildingId(building.id);
                setNewItemText('');
              }}
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
          These defaults will pre-populate the Checklist widget when a teacher
          in <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b>{' '}
          adds it to their dashboard.
        </p>

        {/* Default Text Scale */}
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
            Default Text Scale ({scaleMultiplier.toFixed(1)}x)
          </label>
          <input
            type="range"
            min="0.5"
            max="2.5"
            step="0.1"
            value={scaleMultiplier}
            onChange={(e) =>
              handleUpdateBuilding({
                scaleMultiplier: parseFloat(e.target.value),
              })
            }
            className="w-full accent-brand-blue-primary"
          />
          <div className="flex justify-between text-xxs text-slate-400 mt-0.5">
            <span>0.5x (Small)</span>
            <span>1.0x (Normal)</span>
            <span>2.5x (Large)</span>
          </div>
        </div>

        {/* Default Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xxs font-bold text-slate-500 uppercase block">
              Default Checklist Items
            </label>
            <span className="text-xxs text-slate-400">
              {items.length} item{items.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="space-y-1.5 mb-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 flex items-center gap-2 shadow-sm"
              >
                <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                <input
                  type="text"
                  value={item.text}
                  onChange={(e) => handleUpdateItem(item.id, e.target.value)}
                  className="flex-1 text-xs border-none outline-none bg-transparent"
                  placeholder="Item text..."
                />
                <button
                  onClick={() => handleRemoveItem(item.id)}
                  className="text-red-400 hover:text-red-600 p-0.5 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {items.length === 0 && (
              <div className="text-center py-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xxs italic">
                No default items configured. Add items below.
              </div>
            )}
          </div>

          {/* Add new item */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="New default item..."
              className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none bg-white"
            />
            <button
              onClick={handleAddItem}
              disabled={!newItemText.trim()}
              className="flex items-center gap-1 px-3 py-1.5 text-xxs font-bold bg-brand-blue-primary text-white rounded hover:bg-brand-blue-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
