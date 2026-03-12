import React, { useState, useMemo } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import {
  WidgetData,
  SpecialistScheduleConfig,
  SpecialistScheduleItem,
  SpecialistScheduleGlobalConfig,
} from '@/types';
import {
  Settings2,
  Clock,
  Plus,
  Trash2,
  X,
  Type,
  Palette,
  Save,
  Users,
} from 'lucide-react';
import { Button } from '@/components/common/Button';

const FONTS = [
  { id: 'global', label: 'Inherit', icon: 'G' },
  { id: 'font-mono', label: 'Digital', icon: '01' },
  { id: 'font-sans', label: 'Modern', icon: 'Aa' },
  { id: 'font-handwritten', label: 'School', icon: '✏️' },
];

export const SpecialistScheduleSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const { featurePermissions, selectedBuildings } = useAuth();
  const config = widget.config as SpecialistScheduleConfig;

  // Fetch Global Configuration to know current cycleLength and dayLabel
  const globalConfig = useMemo(() => {
    const perm = featurePermissions.find(
      (p) => p.widgetType === 'specialist-schedule'
    );
    return perm?.config as SpecialistScheduleGlobalConfig | undefined;
  }, [featurePermissions]);

  const buildingId = selectedBuildings[0] ?? 'schumann-elementary';
  const buildingConfig = globalConfig?.buildingDefaults?.[buildingId] ?? {
    cycleLength: 6,
    dayLabel: 'Day',
    customDayNames: {} as Record<number, string>,
  };

  const {
    cycleLength = 6,
    dayLabel = 'Day',
    customDayNames = {} as Record<number, string>,
  } = buildingConfig;

  const {
    cycleDays = [],
    fontFamily = 'global',
    cardColor = '#ffffff',
    cardOpacity = 1,
    specialistClass = '',
  } = config;

  const [activeTab, setActiveTab] = useState<'general' | 'schedules'>(
    'general'
  );
  const [selectedCycleDay, setSelectedCycleDay] = useState(1);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [tempItem, setTempItem] = useState<SpecialistScheduleItem | null>(null);

  // Schedule Item Helpers
  const currentDayConfig = cycleDays.find(
    (d) => d.dayNumber === selectedCycleDay
  ) ?? { dayNumber: selectedCycleDay, items: [] };
  const items = currentDayConfig.items;

  const startEditItem = (index: number) => {
    setEditingItemIndex(index);
    setTempItem({ ...items[index] });
  };

  const startAddItem = () => {
    setEditingItemIndex(-1);
    setTempItem({
      id: crypto.randomUUID(),
      startTime: '',
      endTime: '',
      task: '',
    });
  };

  const saveItem = () => {
    if (!tempItem) return;

    const newItems =
      editingItemIndex === -1
        ? [...items, tempItem]
        : items.map((it, i) => (i === editingItemIndex ? tempItem : it));

    // Sort items by time
    newItems.sort((a, b) => a.startTime.localeCompare(b.startTime));

    // Ensure we have entries for all cycle days
    const baseCycleDays = Array.from({ length: cycleLength }, (_, i) => {
      const existing = cycleDays.find((d) => d.dayNumber === i + 1);
      return existing ?? { dayNumber: i + 1, items: [] };
    });

    const newCycleDays = baseCycleDays.map((d) =>
      d.dayNumber === selectedCycleDay ? { ...d, items: newItems } : d
    );

    updateWidget(widget.id, {
      config: {
        ...config,
        cycleDays: newCycleDays,
      } as SpecialistScheduleConfig,
    });
    setEditingItemIndex(null);
    setTempItem(null);
  };

  const deleteItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    const newCycleDays = cycleDays.map((d) =>
      d.dayNumber === selectedCycleDay ? { ...d, items: newItems } : d
    );
    updateWidget(widget.id, {
      config: {
        ...config,
        cycleDays: newCycleDays,
      } as SpecialistScheduleConfig,
    });
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'general' ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          General
        </button>
        <button
          onClick={() => setActiveTab('schedules')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'schedules' ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          Schedules
        </button>
      </div>

      {activeTab === 'general' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <section className="space-y-3">
            <label className="text-xxs text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Users className="w-3 h-3" /> Class Config
            </label>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-4">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-700">
                  Specialist Class Name
                </span>
                <input
                  type="text"
                  value={specialistClass}
                  onChange={(e) =>
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        specialistClass: e.target.value,
                      } as SpecialistScheduleConfig,
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                  placeholder="e.g. 3A, Smith's Class"
                />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <label className="text-xxs text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Type className="w-3 h-3" /> Typography
            </label>
            <div className="grid grid-cols-4 gap-2">
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  onClick={() =>
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        fontFamily: f.id,
                      } as SpecialistScheduleConfig,
                    })
                  }
                  className={`p-2 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${
                    fontFamily === f.id
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <span className={`text-sm ${f.id} text-slate-900`}>
                    {f.icon}
                  </span>
                  <span className="text-xxxs uppercase text-slate-600">
                    {f.label}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <label className="text-xxs text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Palette className="w-3 h-3" /> Card Style
            </label>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">
                  Card Color
                </span>
                <input
                  type="color"
                  value={cardColor}
                  onChange={(e) =>
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        cardColor: e.target.value,
                      } as SpecialistScheduleConfig,
                    })
                  }
                  className="w-8 h-8 rounded cursor-pointer border border-slate-200 p-0.5"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">
                    Opacity
                  </span>
                  <span className="text-xs text-slate-500">
                    {Math.round(cardOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={cardOpacity}
                  onChange={(e) =>
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        cardOpacity: parseFloat(e.target.value),
                      } as SpecialistScheduleConfig,
                    })
                  }
                  className="w-full accent-teal-600"
                />
              </div>
            </div>
          </section>

          <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 flex gap-3">
            <Settings2 className="w-5 h-5 text-blue-500 shrink-0" />
            <p className="text-[11px] text-blue-700 leading-tight">
              <strong>Admin Config:</strong> The rotation ({cycleLength}-
              {dayLabel}) and school days are managed by school administrators.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'schedules' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {editingItemIndex === null ? (
            <>
              {/* Day Selector */}
              <div className="flex overflow-x-auto no-scrollbar gap-2 pb-2">
                {Array.from({ length: cycleLength }, (_, i) => i + 1).map(
                  (num) => {
                    const customName = customDayNames?.[num];
                    return (
                      <button
                        key={num}
                        onClick={() => setSelectedCycleDay(num)}
                        className={`
                      shrink-0 min-w-12 h-12 px-2 rounded-xl flex flex-col items-center justify-center transition-all border-2
                      ${selectedCycleDay === num ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'}
                    `}
                      >
                        {customName ? (
                          <span className="text-xs font-black truncate max-w-[80px]">
                            {customName}
                          </span>
                        ) : (
                          <>
                            <span className="text-[10px] font-black uppercase tracking-tighter">
                              {dayLabel}
                            </span>
                            <span className="text-lg font-black leading-none">
                              {num}
                            </span>
                          </>
                        )}
                      </button>
                    );
                  }
                )}
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xxs text-slate-400 uppercase tracking-widest block flex items-center gap-2">
                    <Clock className="w-3 h-3" />{' '}
                    {customDayNames?.[selectedCycleDay] ??
                      `${dayLabel} ${selectedCycleDay}`}{' '}
                    Schedule
                  </label>
                  <button
                    onClick={startAddItem}
                    className="text-xs font-bold text-teal-600 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Item
                  </button>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {items.map((item, i) => (
                    <div
                      key={item.id}
                      className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between group shadow-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-teal-600 tabular-nums">
                            {item.startTime}
                            {item.endTime ? ` - ${item.endTime}` : ''}
                          </span>
                        </div>
                        <div className="font-bold text-slate-700 truncate">
                          {item.task}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEditItem(i)}
                          className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded"
                        >
                          <Settings2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteItem(i)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="py-8 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400">
                      <Clock className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-xs italic">No items for this day.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4 animate-in slide-in-from-bottom-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-black text-slate-800 uppercase tracking-wider text-sm">
                  {editingItemIndex === -1 ? 'Add New Item' : 'Edit Item'}
                </h4>
                <button
                  onClick={() => setEditingItemIndex(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                    Activity Name
                  </label>
                  <input
                    type="text"
                    value={tempItem?.task}
                    onChange={(e) =>
                      setTempItem((prev) =>
                        prev ? { ...prev, task: e.target.value } : null
                      )
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
                    placeholder="e.g. Art, PE, Music"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={tempItem?.startTime}
                      onChange={(e) =>
                        setTempItem((prev) =>
                          prev ? { ...prev, startTime: e.target.value } : null
                        )
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={tempItem?.endTime}
                      onChange={(e) =>
                        setTempItem((prev) =>
                          prev ? { ...prev, endTime: e.target.value } : null
                        )
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setEditingItemIndex(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className="flex-1 bg-teal-600 hover:bg-teal-700 border-none"
                  onClick={saveItem}
                  disabled={!tempItem?.task || !tempItem?.startTime}
                >
                  <Save className="w-4 h-4 mr-2" /> Save
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
