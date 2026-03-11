import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  CalendarDays,
  Settings2,
  Save,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { BUILDINGS } from '@/config/buildings';
import {
  SpecialistScheduleGlobalConfig,
  SpecialistScheduleBuildingConfig,
  FeaturePermission,
} from '@/types';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { Toast } from '../common/Toast';
import { Button } from '../common/Button';

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

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig = useMemo(
    () =>
      buildingDefaults[selectedBuildingId] ?? {
        cycleLength: 6,
        startDate: toDateStr(new Date()),
        schoolDays: [],
        dayLabel: 'Day',
      },
    [buildingDefaults, selectedBuildingId]
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
    if (!currentBuildingConfig.schoolDays.length) return null;
    const sorted = [...currentBuildingConfig.schoolDays].sort();
    const todayStr = toDateStr(new Date());
    const index = sorted.indexOf(todayStr);
    if (index === -1) return 'No School';
    return (index % currentBuildingConfig.cycleLength) + 1;
  }, [currentBuildingConfig]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-white/20 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-10 h-10 text-teal-500 animate-spin" />
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                Loading Configuration...
              </p>
            </div>
          ) : (
            <>
              {/* Building Selector */}
              <section className="space-y-4">
                <div>
                  <label className="text-xxs font-black text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
                    <Settings2 className="w-3.5 h-3.5" /> Select Building to
                    Configure
                  </label>
                  <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                    {BUILDINGS.map((building) => (
                      <button
                        key={building.id}
                        onClick={() => setSelectedBuildingId(building.id)}
                        className={`px-4 py-2 text-xs font-black rounded-xl border whitespace-nowrap transition-all ${
                          selectedBuildingId === building.id
                            ? 'bg-teal-600 text-white border-teal-600 shadow-lg scale-105'
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {building.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-top-2 duration-300">
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
                            onClick={() => updateBuilding({ cycleLength: 6 })}
                            className={`px-3 py-1 text-xs font-bold rounded ${currentBuildingConfig.cycleLength === 6 ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                          >
                            6-Day
                          </button>
                          <button
                            onClick={() => updateBuilding({ cycleLength: 10 })}
                            className={`px-3 py-1 text-xs font-bold rounded ${currentBuildingConfig.cycleLength === 10 ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                          >
                            10-Block
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700">
                          Day Label
                        </span>
                        <input
                          type="text"
                          value={currentBuildingConfig.dayLabel}
                          onChange={(e) =>
                            updateBuilding({ dayLabel: e.target.value })
                          }
                          className="w-24 px-2 py-1 text-sm border border-slate-200 rounded-lg text-right font-bold text-teal-700 focus:ring-2 focus:ring-teal-500 outline-none"
                          placeholder="e.g. Day"
                        />
                      </div>

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
                    </div>

                    <div className="bg-teal-50 p-5 rounded-2xl border border-teal-100 space-y-2">
                      <h4 className="text-xs font-black text-teal-800 uppercase tracking-widest">
                        Current Summary
                      </h4>
                      <p className="text-xs text-teal-700/70">
                        {selectedBuildingId === 'schumann-elementary'
                          ? 'Schumann Elementary'
                          : 'Intermediate School'}{' '}
                        is currently using a{' '}
                        <strong>
                          {currentBuildingConfig.cycleLength}-
                          {currentBuildingConfig.dayLabel}
                        </strong>{' '}
                        rotation with{' '}
                        <strong>
                          {currentBuildingConfig.schoolDays.length}
                        </strong>{' '}
                        school days configured.
                      </p>
                      {currentPreviewDay && (
                        <div className="pt-2 flex items-center gap-2">
                          <span className="text-xxs font-bold text-teal-600 uppercase tracking-widest">
                            Today is:
                          </span>
                          <span className="bg-white px-2 py-0.5 rounded-lg border border-teal-200 text-teal-700 font-black text-xs">
                            {currentPreviewDay === 'No School'
                              ? 'Non-School Day'
                              : `${currentBuildingConfig.dayLabel} ${currentPreviewDay}`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Calendar Marking */}
                  <div className="space-y-4">
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
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
                          {['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'].map((d) => (
                            <div
                              key={d}
                              className="text-center text-[10px] font-black text-slate-400 uppercase"
                            >
                              {d}
                            </div>
                          ))}
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
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        className="flex-1 text-[10px]"
                        onClick={selectAllWeekdays}
                      >
                        Select M-F
                      </Button>
                      <Button
                        variant="secondary"
                        className="flex-1 text-[10px]"
                        onClick={clearMonth}
                      >
                        Clear Month
                      </Button>
                    </div>

                    <p className="text-[11px] text-slate-400 italic text-center px-4 leading-tight">
                      Click dates to mark them as school days. The rotation only
                      advances on marked days.
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
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
      </div>

      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
        />
      )}
    </div>
  );
};
