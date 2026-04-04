import React, { useState } from 'react';
import { CountdownBuildingConfig } from '@/types';
import { BUILDINGS } from '@/config/buildings';
import { Toggle } from '@/components/common/Toggle';
import { Plus, Trash2, CalendarIcon } from 'lucide-react';

interface CountdownConfigurationPanelProps {
  config: Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}

export const CountdownConfigurationPanel: React.FC<
  CountdownConfigurationPanelProps
> = ({ config, onChange }) => {
  const [activeTab, setActiveTab] = useState(BUILDINGS[0].id);

  const buildingDefaults =
    (config.buildingDefaults as Record<string, CountdownBuildingConfig>) || {};
  const currentDefaults = buildingDefaults[activeTab] || {};

  const handleUpdate = (updates: Partial<CountdownBuildingConfig>) => {
    onChange({
      ...config,
      buildingDefaults: {
        ...buildingDefaults,
        [activeTab]: {
          ...currentDefaults,
          ...updates,
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Building Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto custom-scrollbar">
        {BUILDINGS.map((building) => (
          <button
            key={building.id}
            onClick={() => setActiveTab(building.id)}
            className={`px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap border-b-2 transition-colors ${
              activeTab === building.id
                ? 'border-brand-blue-primary text-brand-blue-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {building.name}
          </button>
        ))}
      </div>

      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-5">
        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">
          Building Defaults
        </h3>
        <p className="text-xs text-slate-500">
          Set the default configuration for the Countdown widget when a user in
          this building first adds it to their board.
        </p>

        <div className="space-y-4 pt-2">
          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
              Default Event Title
            </label>
            <input
              type="text"
              value={currentDefaults.title ?? ''}
              onChange={(e) => handleUpdate({ title: e.target.value })}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-blue-primary outline-none font-bold"
              placeholder="e.g. Summer Break"
            />
          </div>

          {/* View Mode */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">
              Default View Mode
            </label>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => handleUpdate({ viewMode: 'number' })}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  currentDefaults.viewMode === 'number' ||
                  !currentDefaults.viewMode
                    ? 'bg-white shadow text-brand-blue-primary'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Number
              </button>
              <button
                onClick={() => handleUpdate({ viewMode: 'grid' })}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  currentDefaults.viewMode === 'grid'
                    ? 'bg-white shadow text-brand-blue-primary'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Grid
              </button>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-200">
            {/* Include Weekends Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-700 block">
                  Include Weekends by Default
                </span>
                <span className="text-xxs text-slate-500">
                  Whether weekends are included in the countdown calculation.
                </span>
              </div>
              <Toggle
                checked={currentDefaults.includeWeekends ?? true}
                onChange={(checked) =>
                  handleUpdate({ includeWeekends: checked })
                }
              />
            </div>

            {/* Count Today Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-700 block">
                  Count Today by Default
                </span>
                <span className="text-xxs text-slate-500">
                  Whether today should be counted as a remaining day.
                </span>
              </div>
              <Toggle
                checked={currentDefaults.countToday ?? true}
                onChange={(checked) => handleUpdate({ countToday: checked })}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-5 mt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-brand-blue-primary" />
              Pre-defined Events
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Add specific events (like breaks or holidays) that users can
              easily import into their countdown widgets.
            </p>
          </div>
          <button
            onClick={() => {
              const currentEvents = currentDefaults.events ?? [];
              handleUpdate({
                events: [
                  ...currentEvents,
                  {
                    id: crypto.randomUUID(),
                    title: '',
                    date: new Date().toISOString(),
                  },
                ],
              });
            }}
            className="flex items-center gap-2 px-3 py-1.5 bg-white text-brand-blue-primary border border-slate-200 rounded-xl text-xs font-black hover:bg-blue-50 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> Add Event
          </button>
        </div>

        <div className="space-y-3">
          {(currentDefaults.events ?? []).length === 0 ? (
            <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xxs italic">
              No pre-defined events configured.
            </div>
          ) : (
            (currentDefaults.events ?? []).map((event, index) => (
              <div
                key={event.id}
                className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-4 shadow-sm"
              >
                <div className="flex-1 grid grid-cols-12 gap-3">
                  <div className="col-span-7">
                    <input
                      type="text"
                      value={event.title}
                      onChange={(e) => {
                        const newEvents = [...(currentDefaults.events ?? [])];
                        newEvents[index] = { ...event, title: e.target.value };
                        handleUpdate({ events: newEvents });
                      }}
                      className="w-full px-3 py-1.5 text-xs font-bold text-slate-700 bg-transparent border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue-primary outline-none"
                      placeholder="Event Title"
                    />
                  </div>
                  <div className="col-span-5">
                    <input
                      type="date"
                      value={
                        event.date
                          ? (() => {
                              const d = new Date(event.date);
                              const year = d.getFullYear();
                              const month = String(d.getMonth() + 1).padStart(
                                2,
                                '0'
                              );
                              const day = String(d.getDate()).padStart(2, '0');
                              return `${year}-${month}-${day}`;
                            })()
                          : ''
                      }
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const [year, month, day] = e.target.value
                          .split('-')
                          .map(Number);
                        const localDate = new Date(year, month - 1, day, 12);
                        const newEvents = [...(currentDefaults.events ?? [])];
                        newEvents[index] = {
                          ...event,
                          date: localDate.toISOString(),
                        };
                        handleUpdate({ events: newEvents });
                      }}
                      className="w-full px-3 py-1.5 text-xs font-bold text-slate-700 bg-transparent border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue-primary outline-none"
                    />
                  </div>
                </div>
                <button
                  onClick={() => {
                    const newEvents = [...(currentDefaults.events ?? [])];
                    newEvents.splice(index, 1);
                    handleUpdate({ events: newEvents });
                  }}
                  className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
