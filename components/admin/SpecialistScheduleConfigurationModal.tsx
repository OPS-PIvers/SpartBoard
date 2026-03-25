import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  CalendarDays,
  Settings2,
  Save,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
} from 'lucide-react';
import { BUILDINGS } from '@/config/buildings';
import { BuildingSelector } from './BuildingSelector';
import {
  SpecialistScheduleGlobalConfig,
  SpecialistScheduleBuildingConfig,
  FeaturePermission,
} from '@/types';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { Toast } from '../common/Toast';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Card } from '@/components/common/Card';
import { DockDefaultsPanel } from './DockDefaultsPanel';

interface SpecialistScheduleConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const toDateStr = (d: Date): string => {
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const SCHUMANN_DEFAULT_OPTIONS = [
  '🎵 Music',
  '👟 PE',
  '🎨 Art',
  '🌐 Spanish',
  '📖 Media',
];
const INTERMEDIATE_DEFAULT_OPTIONS = [
  '🎵 Music',
  '👟 PE',
  '🎨 Art',
  '🌐 Spanish',
];

export const SpecialistScheduleConfigurationModal: React.FC<
  SpecialistScheduleConfigurationModalProps
> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState<SpecialistScheduleGlobalConfig>({
    buildingDefaults: {},
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [newOption, setNewOption] = useState('');

  const fetchConfig = useCallback(async () => {
    if (isAuthBypass) {
      setLoading(false);
      return;
    }
    try {
      const docRef = doc(db, 'feature_permissions', 'specialist-schedule');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as FeaturePermission;
        if (data.config) {
          setConfig(data.config as unknown as SpecialistScheduleGlobalConfig);
        }
      }
    } catch (err) {
      console.error('Failed to fetch specialist schedule config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void fetchConfig();
    }
  }, [isOpen, fetchConfig]);

  const handleSave = async (updatedConfig?: SpecialistScheduleGlobalConfig) => {
    if (isAuthBypass) return;
    setSaving(true);
    try {
      const docRef = doc(db, 'feature_permissions', 'specialist-schedule');
      await setDoc(
        docRef,
        {
          type: 'specialist-schedule',
          config: (updatedConfig ?? config) as unknown as Record<
            string,
            unknown
          >,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      if (!updatedConfig) {
        setMessage({
          text: 'Specialist schedule configuration saved!',
          type: 'success',
        });
      }
    } catch (err) {
      console.error('Failed to save specialist schedule config:', err);
      setMessage({ text: 'Failed to save configuration.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const currentBuildingConfig = useMemo(
    () =>
      config.buildingDefaults?.[selectedBuildingId] ?? {
        cycleLength: 6,
        startDate: toDateStr(new Date()),
        schoolDays: [],
        dayLabel: 'Day',
        customDayNames: {},
        blocks: [],
        specialistOptions:
          selectedBuildingId === 'schumann-elementary'
            ? SCHUMANN_DEFAULT_OPTIONS
            : selectedBuildingId === 'orono-intermediate-school'
              ? INTERMEDIATE_DEFAULT_OPTIONS
              : [],
      },
    [config.buildingDefaults, selectedBuildingId]
  );

  const updateBuilding = (
    updates: Partial<SpecialistScheduleBuildingConfig>
  ) => {
    setConfig((prev) => ({
      ...prev,
      buildingDefaults: {
        ...prev.buildingDefaults,
        [selectedBuildingId]: {
          ...currentBuildingConfig,
          ...updates,
        },
      },
    }));
  };

  const updateBlock = (
    index: number,
    field: 'startDate' | 'endDate' | 'dayNumber',
    value: string | number
  ) => {
    const newBlocks = [...(currentBuildingConfig.blocks ?? [])];
    if (newBlocks.length < 10) {
      // Initialize blocks if empty
      for (let i = 0; i < 10; i++) {
        if (!newBlocks[i]) {
          newBlocks[i] = { dayNumber: i + 1, startDate: '', endDate: '' };
        }
      }
    }
    newBlocks[index] = { ...newBlocks[index], [field]: value };
    updateBuilding({ blocks: newBlocks });
  };

  const updateDayName = (dayNumber: number, name: string) => {
    const newNames = { ...(currentBuildingConfig.customDayNames ?? {}) };
    newNames[dayNumber] = name;
    updateBuilding({ customDayNames: newNames });
  };

  const addOption = () => {
    if (!newOption.trim()) return;
    const currentOptions = currentBuildingConfig.specialistOptions ?? [];
    if (currentOptions.includes(newOption.trim())) {
      setNewOption('');
      return;
    }
    updateBuilding({
      specialistOptions: [...currentOptions, newOption.trim()],
    });
    setNewOption('');
  };

  const removeOption = (option: string) => {
    const currentOptions = currentBuildingConfig.specialistOptions ?? [];
    updateBuilding({
      specialistOptions: currentOptions.filter((o) => o !== option),
    });
  };

  // Calendar Helpers
  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const days = [];
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  }, [currentMonth]);

  const toggleSchoolDay = (date: Date) => {
    const dateStr = toDateStr(date);
    const newSchoolDays = currentBuildingConfig.schoolDays.includes(dateStr)
      ? currentBuildingConfig.schoolDays.filter((d) => d !== dateStr)
      : [...currentBuildingConfig.schoolDays, dateStr];

    updateBuilding({ schoolDays: newSchoolDays });
  };

  const selectAllWeekdays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();

    const newDates = [];
    for (let i = 1; i <= lastDay; i++) {
      const d = new Date(year, month, i);
      const dayOfWeek = d.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        newDates.push(toDateStr(d));
      }
    }

    const merged = Array.from(
      new Set([...currentBuildingConfig.schoolDays, ...newDates])
    );
    updateBuilding({ schoolDays: merged });
  };

  const clearMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const monthPrefix = `${year}-${(month + 1).toString().padStart(2, '0')}-`;

    const filtered = currentBuildingConfig.schoolDays.filter(
      (d) => !d.startsWith(monthPrefix)
    );
    updateBuilding({ schoolDays: filtered });
  };

  // Rotation Preview
  const currentPreviewDay = useMemo(() => {
    const todayStr = toDateStr(new Date());

    // Check blocks first (Intermediate)
    if (currentBuildingConfig.blocks?.length) {
      const activeBlock = currentBuildingConfig.blocks.find(
        (b) => todayStr >= b.startDate && todayStr <= b.endDate
      );
      if (activeBlock) {
        const customName =
          currentBuildingConfig.customDayNames?.[activeBlock.dayNumber];
        return (
          customName ??
          `${currentBuildingConfig.dayLabel} ${activeBlock.dayNumber}`
        );
      }
    }

    if (!currentBuildingConfig.schoolDays.length) return null;
    const sorted = [...currentBuildingConfig.schoolDays].sort();
    const index = sorted.indexOf(todayStr);
    if (index === -1) return 'No School';

    const dayNumber = (index % currentBuildingConfig.cycleLength) + 1;
    const customName = currentBuildingConfig.customDayNames?.[dayNumber];
    return customName ?? `${currentBuildingConfig.dayLabel} ${dayNumber}`;
  }, [currentBuildingConfig]);

  if (!isOpen) return null;

  const header = (
    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-teal-50 rounded-xl text-teal-600">
          <CalendarDays className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-800 tracking-tight">
            Specialist Schedule Administration
          </h2>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
            Managed Rotation & Calendar Defaults
          </p>
        </div>
      </div>
      <button
        onClick={onClose}
        className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
      >
        <X className="w-6 h-6" />
      </button>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between w-full">
      <p className="text-xxs text-slate-400 font-bold uppercase tracking-widest">
        Building: {BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}
      </p>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="px-6 py-2.5 rounded-2xl text-sm font-black text-slate-500 hover:bg-white transition-all border border-transparent hover:border-slate-200"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="px-8 py-2.5 bg-teal-600 text-white rounded-2xl text-sm font-black shadow-lg shadow-teal-500/20 hover:bg-teal-700 transition-all flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> Save Configuration
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="max-w-5xl"
        customHeader={header}
        footer={footer}
        className="!p-0"
        contentClassName=""
        footerClassName="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between w-full shrink-0"
      >
        <div className="p-6 space-y-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-10 h-10 text-teal-500 animate-spin" />
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                Loading Configuration...
              </p>
            </div>
          ) : (
            <>
              {/* Dock Defaults */}
              <DockDefaultsPanel
                config={{ dockDefaults: config.dockDefaults ?? {} }}
                onChange={(d) =>
                  setConfig((prev) => ({ ...prev, dockDefaults: d }))
                }
              />

              {/* Building Selector */}
              <section className="space-y-4">
                <div>
                  <label className="text-xxs font-black text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
                    <Settings2 className="w-3.5 h-3.5" /> Select Building to
                    Configure
                  </label>
                  <BuildingSelector
                    selectedId={selectedBuildingId}
                    onSelect={setSelectedBuildingId}
                    activeClassName="bg-teal-500 text-white border-teal-500 shadow-sm"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 animate-in fade-in slide-in-from-top-2 duration-300">
                  {/* Left: Rotation Settings */}
                  <div className="space-y-6">
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-6">
                      <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-teal-500" /> Rotation
                        Settings
                      </h4>

                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700">
                          Rotation Cycle
                        </span>
                        <div className="flex bg-white rounded-lg p-1 border border-slate-200">
                          <button
                            onClick={() =>
                              updateBuilding({
                                cycleLength: 6,
                                dayLabel: 'Day',
                                blocks: [],
                              })
                            }
                            className={`px-3 py-1 text-xs font-bold rounded ${currentBuildingConfig.cycleLength === 6 ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                          >
                            6-Day
                          </button>
                          <button
                            onClick={() =>
                              updateBuilding({
                                cycleLength: 10,
                                dayLabel: 'Block',
                                blocks:
                                  currentBuildingConfig.blocks?.length === 10
                                    ? currentBuildingConfig.blocks
                                    : Array.from({ length: 10 }, (_, i) => ({
                                        dayNumber: i + 1,
                                        startDate: '',
                                        endDate: '',
                                      })),
                              })
                            }
                            className={`px-3 py-1 text-xs font-bold rounded ${currentBuildingConfig.cycleLength === 10 ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                          >
                            10-Block
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700">
                          Default Day Label
                        </span>
                        <input
                          type="text"
                          value={currentBuildingConfig.dayLabel ?? ''}
                          onChange={(e) =>
                            updateBuilding({ dayLabel: e.target.value })
                          }
                          className="w-24 px-2 py-1 text-sm border border-slate-200 rounded-lg text-right font-bold text-teal-700 focus:ring-2 focus:ring-teal-500 outline-none"
                          placeholder="e.g. Day"
                        />
                      </div>

                      {currentBuildingConfig.cycleLength === 6 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-700">
                            Start Date
                          </span>
                          <input
                            type="date"
                            value={currentBuildingConfig.startDate}
                            onChange={(e) =>
                              updateBuilding({ startDate: e.target.value })
                            }
                            className="px-2 py-1 text-sm border border-slate-200 rounded-lg font-bold text-teal-700 focus:ring-2 focus:ring-teal-500 outline-none"
                          />
                        </div>
                      )}
                    </div>

                    {/* Custom Day Names */}
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                      <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-teal-500" /> Custom
                        Day Names
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {Array.from(
                          { length: currentBuildingConfig.cycleLength },
                          (_, i) => i + 1
                        ).map((num) => (
                          <div
                            key={num}
                            className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-100"
                          >
                            <span className="text-xxs font-black text-slate-400 w-4">
                              {num}
                            </span>
                            <input
                              type="text"
                              value={
                                currentBuildingConfig.customDayNames?.[num] ??
                                ''
                              }
                              onChange={(e) =>
                                updateDayName(num, e.target.value)
                              }
                              placeholder={`${currentBuildingConfig.dayLabel ?? 'Day'} ${num}`}
                              className="flex-1 text-xs font-bold text-slate-700 focus:outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Middle: Specialist Options */}
                  <div className="space-y-6">
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4 h-full flex flex-col">
                      <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-teal-500" />{' '}
                        Specialist Classes
                      </h4>
                      <p className="text-xxs text-slate-400 font-bold uppercase">
                        Predefined options for teachers
                      </p>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newOption}
                          onChange={(e) => setNewOption(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addOption()}
                          placeholder="e.g. 🎨 Art"
                          className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none font-bold"
                        />
                        <button
                          onClick={addOption}
                          className="p-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1 min-h-[200px]">
                        {(currentBuildingConfig.specialistOptions ?? []).map(
                          (option) => (
                            <div
                              key={option}
                              className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-100 group"
                            >
                              <span className="text-xs font-bold text-slate-700">
                                {option}
                              </span>
                              <button
                                onClick={() => removeOption(option)}
                                className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )
                        )}
                        {(currentBuildingConfig.specialistOptions ?? [])
                          .length === 0 && (
                          <div className="text-center py-8 text-slate-300 italic text-xs">
                            No options added.
                          </div>
                        )}
                      </div>

                      <div className="bg-teal-50 p-4 rounded-xl border border-teal-100 space-y-2 shrink-0">
                        <h4 className="text-xs font-black text-teal-800 uppercase tracking-widest">
                          Current Summary
                        </h4>
                        <p className="text-xs text-teal-700/70">
                          {BUILDINGS.find((b) => b.id === selectedBuildingId)
                            ?.name ?? 'Selected Building'}{' '}
                          is currently using a{' '}
                          <strong>
                            {currentBuildingConfig.cycleLength}-
                            {currentBuildingConfig.dayLabel}
                          </strong>{' '}
                          rotation.
                        </p>
                        {currentPreviewDay && (
                          <div className="pt-1 flex items-center gap-2">
                            <span className="text-xxs font-bold text-teal-600 uppercase tracking-widest">
                              Today is:
                            </span>
                            <span className="bg-white px-2 py-0.5 rounded-lg border border-teal-200 text-teal-700 font-black text-xs">
                              {currentPreviewDay === 'No School'
                                ? 'Non-School Day'
                                : currentPreviewDay}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Calendar Marking or Block Selection */}
                  <div className="space-y-4">
                    {currentBuildingConfig.cycleLength === 10 ? (
                      <Card
                        rounded="2xl"
                        padding="none"
                        className="overflow-hidden flex flex-col h-full max-h-[500px]"
                      >
                        <div className="bg-slate-50 p-4 border-b border-slate-200">
                          <h4 className="font-black text-slate-700 uppercase tracking-widest text-xs flex items-center gap-2">
                            <CalendarDays className="w-4 h-4 text-teal-500" />{' '}
                            Block Date Ranges
                          </h4>
                          <p className="text-xxs text-slate-400 font-bold mt-1 uppercase">
                            Configure explicit windows for each block
                          </p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                          {Array.from({ length: 10 }, (_, i) => i + 1).map(
                            (num, i) => (
                              <div
                                key={num}
                                className="flex flex-col gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-black text-teal-700 uppercase tracking-widest">
                                    {currentBuildingConfig.customDayNames?.[
                                      num
                                    ] ?? `Block ${num}`}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                      Start Date
                                    </label>
                                    <input
                                      type="date"
                                      value={
                                        currentBuildingConfig.blocks?.[i]
                                          ?.startDate ?? ''
                                      }
                                      onChange={(e) =>
                                        updateBlock(
                                          i,
                                          'startDate',
                                          e.target.value
                                        )
                                      }
                                      className="w-full px-2 py-1 text-xs border border-slate-200 rounded font-bold text-slate-600 focus:ring-1 focus:ring-teal-500 outline-none"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                      End Date
                                    </label>
                                    <input
                                      type="date"
                                      value={
                                        currentBuildingConfig.blocks?.[i]
                                          ?.endDate ?? ''
                                      }
                                      onChange={(e) =>
                                        updateBlock(
                                          i,
                                          'endDate',
                                          e.target.value
                                        )
                                      }
                                      className="w-full px-2 py-1 text-xs border border-slate-200 rounded font-bold text-slate-600 focus:ring-1 focus:ring-teal-500 outline-none"
                                    />
                                  </div>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </Card>
                    ) : (
                      <Card
                        rounded="2xl"
                        padding="none"
                        className="overflow-hidden"
                      >
                        <div className="bg-slate-50 p-3 flex items-center justify-between border-b border-slate-200">
                          <button
                            onClick={() =>
                              setCurrentMonth(
                                new Date(
                                  currentMonth.getFullYear(),
                                  currentMonth.getMonth() - 1,
                                  1
                                )
                              )
                            }
                            className="p-1 hover:bg-slate-200 rounded-lg transition-colors"
                          >
                            <ChevronLeft className="w-5 h-5 text-slate-600" />
                          </button>
                          <h4 className="font-bold text-slate-700">
                            {currentMonth.toLocaleDateString(undefined, {
                              month: 'long',
                              year: 'numeric',
                            })}
                          </h4>
                          <button
                            onClick={() =>
                              setCurrentMonth(
                                new Date(
                                  currentMonth.getFullYear(),
                                  currentMonth.getMonth() + 1,
                                  1
                                )
                              )
                            }
                            className="p-1 hover:bg-slate-200 rounded-lg transition-colors"
                          >
                            <ChevronRight className="w-5 h-5 text-slate-600" />
                          </button>
                        </div>

                        <div className="p-3">
                          <div className="grid grid-cols-7 mb-2">
                            {['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'].map(
                              (d) => (
                                <div
                                  key={d}
                                  className="text-center text-xxs font-black text-slate-400 uppercase"
                                >
                                  {d}
                                </div>
                              )
                            )}
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                            {daysInMonth.map((date, i) => {
                              if (!date) return <div key={`pad-${i}`} />;
                              const dateStr = toDateStr(date);
                              const isSelected =
                                currentBuildingConfig.schoolDays.includes(
                                  dateStr
                                );
                              const isToday = dateStr === toDateStr(new Date());

                              return (
                                <button
                                  key={dateStr}
                                  onClick={() => toggleSchoolDay(date)}
                                  className={`
                                  aspect-square flex items-center justify-center text-xs rounded-lg font-bold transition-all
                                  ${isSelected ? 'bg-teal-600 text-white shadow-sm scale-105' : 'hover:bg-slate-100 text-slate-600'}
                                  ${isToday ? 'ring-2 ring-teal-200' : ''}
                                `}
                                >
                                  {date.getDate()}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </Card>
                    )}

                    {currentBuildingConfig.cycleLength !== 10 && (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          className="flex-1 text-xxs"
                          onClick={selectAllWeekdays}
                        >
                          Select M-F
                        </Button>
                        <Button
                          variant="secondary"
                          className="flex-1 text-xxs"
                          onClick={clearMonth}
                        >
                          Clear Month
                        </Button>
                      </div>
                    )}

                    <p className="text-[11px] text-slate-400 italic text-center px-4 leading-tight">
                      {currentBuildingConfig.cycleLength === 10
                        ? 'Set explicit date ranges for each of the 10 rotation blocks.'
                        : 'Click dates to mark them as school days. The rotation only advances on marked days.'}
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </Modal>

      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
        />
      )}
    </>
  );
};
