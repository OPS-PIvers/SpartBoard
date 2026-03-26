import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  ExternalLink,
  Ban,
  Settings2,
  Save,
  Loader2,
  RefreshCw,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { BUILDINGS } from '@/config/buildings';
import { BuildingSelector } from './BuildingSelector';
import {
  CalendarGlobalConfig,
  BuildingCalendarDefaults,
  CalendarEvent,
  FeaturePermission,
} from '@/types';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { Toast } from '../common/Toast';
import { Modal } from '../common/Modal';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { DockDefaultsPanel } from './DockDefaultsPanel';

interface CalendarConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CalendarConfigurationModal: React.FC<
  CalendarConfigurationModalProps
> = ({ isOpen, onClose }) => {
  const { calendarService, isConnected, refreshGoogleToken } =
    useGoogleCalendar();
  const [config, setConfig] = useState<CalendarGlobalConfig>({
    blockedDates: [],
    buildingDefaults: {},
    updateFrequencyHours: 4,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );

  const fetchConfig = useCallback(async () => {
    if (isAuthBypass) {
      setLoading(false);
      return;
    }
    try {
      const docRef = doc(db, 'feature_permissions', 'calendar');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as FeaturePermission;
        if (data.config) {
          setConfig(data.config as unknown as CalendarGlobalConfig);
        }
      }
    } catch (err) {
      console.error('Failed to fetch calendar config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void fetchConfig();
    }
  }, [isOpen, fetchConfig]);

  const handleSave = async (updatedConfig?: CalendarGlobalConfig) => {
    if (isAuthBypass) return;
    setSaving(true);
    try {
      const docRef = doc(db, 'feature_permissions', 'calendar');
      await setDoc(
        docRef,
        {
          type: 'calendar',
          config: (updatedConfig ?? config) as unknown as Record<
            string,
            unknown
          >,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      if (!updatedConfig) {
        setMessage({ text: 'Calendar configuration saved!', type: 'success' });
      }
    } catch (err) {
      console.error('Failed to save calendar config:', err);
      setMessage({ text: 'Failed to save configuration.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSyncAll = async () => {
    if (!calendarService || !isConnected) {
      setMessage({
        text: 'Please sign in with Google to sync calendars.',
        type: 'error',
      });
      return;
    }

    setSyncing(true);
    try {
      const now = new Date();
      const timeMin = new Date(now.setHours(0, 0, 0, 0)).toISOString();
      const timeMax = new Date(now.setDate(now.getDate() + 30)).toISOString();

      const nextBuildingDefaults = { ...config.buildingDefaults };

      for (const building of BUILDINGS) {
        const bConfig = nextBuildingDefaults[building.id];
        const ids = bConfig?.googleCalendarIds ?? [];

        if (ids.length === 0) continue;

        try {
          const allPromises = ids.map((id) =>
            calendarService.getEvents(id, timeMin, timeMax)
          );
          const results = await Promise.all(allPromises);
          const merged = results
            .flat()
            .sort((a, b) => a.date.localeCompare(b.date));

          nextBuildingDefaults[building.id] = {
            ...bConfig,
            cachedEvents: merged,
            lastProxySync: Date.now(),
          };
        } catch (err) {
          console.error(`Failed to sync building ${building.name}:`, err);
        }
      }

      const nextConfig = {
        ...config,
        buildingDefaults: nextBuildingDefaults,
      };
      setConfig(nextConfig);
      await handleSave(nextConfig);
      setMessage({ text: 'All building calendars synced!', type: 'success' });
    } catch (err) {
      console.error('Global sync failed:', err);
      setMessage({ text: 'Failed to sync all calendars.', type: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig = buildingDefaults[selectedBuildingId] ?? {
    buildingId: selectedBuildingId,
    events: [],
    googleCalendarIds: [],
  };

  const updateGlobal = (updates: Partial<CalendarGlobalConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  };

  const updateBuilding = (updates: Partial<BuildingCalendarDefaults>) => {
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

  const addBlockedDate = () => {
    const today = new Date().toISOString().split('T')[0];
    if (!config.blockedDates.includes(today)) {
      updateGlobal({ blockedDates: [...config.blockedDates, today] });
    }
  };

  const addDefaultEvent = () => {
    const newEvent: CalendarEvent = {
      date: new Date().toISOString().split('T')[0],
      title: 'New Default Event',
    };
    updateBuilding({
      events: [...currentBuildingConfig.events, newEvent],
    });
  };

  if (!isOpen) return null;

  const header = (
    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-rose-50 rounded-xl text-rose-600">
          <CalendarIcon className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-800 tracking-tight">
            Calendar Administration
          </h2>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
            Managed Proxy & Building Defaults
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!isConnected && (
          <button
            onClick={() => void refreshGoogleToken()}
            className="text-xxs font-black text-rose-500 hover:text-rose-600 uppercase tracking-widest px-3 py-1 bg-rose-50 rounded-lg transition-colors border border-rose-100 mr-2"
          >
            Reconnect Google
          </button>
        )}
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between w-full">
      <p className="text-xxs text-slate-400 font-bold uppercase tracking-widest">
        {config.blockedDates.length} Blocked Dates •{' '}
        {currentBuildingConfig.events.length} Default Events
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
          className="px-8 py-2.5 bg-brand-blue-primary text-white rounded-2xl text-sm font-black shadow-lg shadow-blue-500/20 hover:bg-brand-blue-dark transition-all flex items-center gap-2 disabled:opacity-50"
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
        maxWidth="max-w-4xl"
        customHeader={header}
        footer={footer}
        className="!p-0"
        contentClassName=""
        footerClassName="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between w-full shrink-0"
      >
        <div className="p-6 space-y-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-10 h-10 text-rose-500 animate-spin" />
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

              {/* Proxy Sync Controls */}
              <section className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-black text-blue-700 uppercase tracking-widest flex items-center gap-2">
                      <RefreshCw className="w-4 h-4" /> Managed Proxy Sync
                    </h3>
                    <p className="text-xxs text-blue-600/70 font-medium mt-1 uppercase tracking-wider">
                      Pull events centrally so users don&apos;t need individual
                      auth
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-blue-200">
                      <Clock className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
                        Every
                      </span>
                      <input
                        type="number"
                        min="1"
                        max="24"
                        value={config.updateFrequencyHours ?? 4}
                        onChange={(e) =>
                          updateGlobal({
                            updateFrequencyHours: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-10 text-xs font-black text-blue-700 text-center bg-transparent outline-none"
                      />
                      <span className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
                        Hours
                      </span>
                    </div>
                    <button
                      onClick={handleSyncAll}
                      disabled={syncing || !isConnected}
                      className="flex items-center gap-2 px-4 py-2 bg-brand-blue-primary text-white rounded-xl text-xs font-black hover:bg-brand-blue-dark transition-all shadow-md disabled:opacity-50"
                    >
                      {syncing ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />{' '}
                          Syncing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" /> Sync All Now
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {BUILDINGS.map((b) => {
                    const bConfig = config.buildingDefaults?.[b.id];
                    const lastSync = bConfig?.lastProxySync;
                    const eventCount = bConfig?.cachedEvents?.length ?? 0;
                    return (
                      <div
                        key={b.id}
                        className="bg-white/50 border border-blue-100 p-2 rounded-xl flex flex-col gap-1"
                      >
                        <span className="text-xxs font-black text-slate-700 truncate">
                          {b.name}
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="text-xxs font-medium text-blue-600/70">
                            {eventCount} events
                          </span>
                          {lastSync && (
                            <span
                              className="text-xxxs font-bold text-slate-400 uppercase"
                              title={new Date(lastSync).toLocaleString()}
                            >
                              {new Date(lastSync).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Global Blocked Dates */}
              <section className="bg-red-50 border border-red-100 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-black text-red-700 uppercase tracking-widest flex items-center gap-2">
                      <Ban className="w-4 h-4" /> District Blocked Dates
                    </h3>
                    <p className="text-xxs text-red-600/70 font-medium mt-1 uppercase tracking-wider">
                      Hidden from ALL teacher widgets district-wide
                    </p>
                  </div>
                  <button
                    onClick={addBlockedDate}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white text-red-600 border border-red-200 rounded-xl text-xs font-black hover:bg-red-100 transition-colors shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Date
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {config.blockedDates.map((date, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-white border border-red-200 px-2 py-1.5 rounded-xl shadow-sm group animate-in zoom-in-95"
                    >
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => {
                          const next = [...config.blockedDates];
                          next[idx] = e.target.value;
                          updateGlobal({ blockedDates: next });
                        }}
                        className="text-xs font-black text-red-700 outline-none bg-transparent"
                      />
                      <button
                        onClick={() => {
                          const next = config.blockedDates.filter(
                            (_, i) => i !== idx
                          );
                          updateGlobal({ blockedDates: next });
                        }}
                        className="text-red-300 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {config.blockedDates.length === 0 && (
                    <div className="w-full text-center py-4 text-red-400 text-xs italic font-medium">
                      No blocked dates configured.
                    </div>
                  )}
                </div>
              </section>

              <hr className="border-slate-100" />

              {/* Building Specific Config */}
              <section className="space-y-6">
                <div>
                  <label className="text-xxs font-black text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
                    <Settings2 className="w-3.5 h-3.5" /> Select Building to
                    Configure
                  </label>
                  <BuildingSelector
                    selectedId={selectedBuildingId}
                    onSelect={setSelectedBuildingId}
                  />
                </div>

                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-8 animate-in fade-in slide-in-from-top-2 duration-300">
                  {/* Building Defaults */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                          <CalendarIcon className="w-4 h-4 text-rose-500" />{' '}
                          Default Building Events
                        </h4>
                        <p className="text-xxs text-slate-500 font-medium mt-1 uppercase tracking-wider">
                          A/B schedule, block rotation, or fixed dates
                        </p>
                      </div>
                      <button
                        onClick={addDefaultEvent}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white text-brand-blue-primary border border-slate-200 rounded-xl text-xs font-black hover:bg-blue-50 transition-colors shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Event
                      </button>
                    </div>

                    <div className="space-y-2">
                      {currentBuildingConfig.events.map((event, idx) => (
                        <div
                          key={idx}
                          className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-4 shadow-sm group animate-in zoom-in-95"
                        >
                          <div className="flex-1 grid grid-cols-12 gap-3">
                            <div className="col-span-4">
                              <input
                                type="date"
                                value={event.date}
                                onChange={(e) => {
                                  const next = [
                                    ...currentBuildingConfig.events,
                                  ];
                                  next[idx] = {
                                    ...next[idx],
                                    date: e.target.value,
                                  };
                                  updateBuilding({ events: next });
                                }}
                                className="w-full px-3 py-2 text-xs font-bold border border-slate-100 rounded-lg focus:border-rose-400 outline-none bg-slate-50/50"
                              />
                            </div>
                            <div className="col-span-8">
                              <input
                                type="text"
                                value={event.title}
                                onChange={(e) => {
                                  const next = [
                                    ...currentBuildingConfig.events,
                                  ];
                                  next[idx] = {
                                    ...next[idx],
                                    title: e.target.value,
                                  };
                                  updateBuilding({ events: next });
                                }}
                                placeholder="Event Title (e.g. Day A)"
                                className="w-full px-3 py-2 text-xs font-bold border border-slate-100 rounded-lg focus:border-rose-400 outline-none bg-slate-50/50"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const next = currentBuildingConfig.events.filter(
                                (_, i) => i !== idx
                              );
                              updateBuilding({ events: next });
                            }}
                            className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {currentBuildingConfig.events.length === 0 && (
                        <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs italic font-medium">
                          No default events configured for this building.
                        </div>
                      )}
                    </div>
                  </div>

                  <hr className="border-slate-200" />

                  {/* Google Calendar Sync */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                          <Settings2 className="w-4 h-4 text-blue-500" /> Google
                          Calendar IDs
                        </h4>
                        <p className="text-xxs text-slate-500 font-medium mt-1 uppercase tracking-wider">
                          District or building-wide synced calendars
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {currentBuildingConfig.lastProxySync && (
                          <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded-lg border border-green-100">
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                            <span className="text-xxs font-black text-green-600 uppercase tracking-tighter">
                              Proxied
                            </span>
                          </div>
                        )}
                        <button
                          onClick={() => {
                            const nextIds = [
                              ...(currentBuildingConfig.googleCalendarIds ??
                                []),
                              '',
                            ];
                            updateBuilding({ googleCalendarIds: nextIds });
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 bg-white text-brand-blue-primary border border-slate-200 rounded-xl text-xs font-black hover:bg-blue-50 transition-colors shadow-sm"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add ID
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {(currentBuildingConfig.googleCalendarIds ?? []).map(
                        (id, idx) => (
                          <div
                            key={idx}
                            className="bg-white border border-slate-200 rounded-xl p-2 flex items-center gap-2 group animate-in zoom-in-95"
                          >
                            <input
                              type="text"
                              value={id}
                              onChange={(e) => {
                                const next = [
                                  ...(currentBuildingConfig.googleCalendarIds ??
                                    []),
                                ];
                                next[idx] = e.target.value;
                                updateBuilding({ googleCalendarIds: next });
                              }}
                              placeholder="email@group.calendar.google.com"
                              className="flex-1 px-3 py-2 text-xs font-mono border border-slate-100 rounded-lg focus:border-blue-400 outline-none bg-slate-50/50"
                            />
                            <a
                              href={`https://calendar.google.com/calendar/u/0/embed?src=${id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 text-slate-400 hover:text-blue-500 transition-colors"
                              title="Verify Calendar ID"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            <button
                              onClick={() => {
                                const next = (
                                  currentBuildingConfig.googleCalendarIds ?? []
                                ).filter((_, i) => i !== idx);
                                updateBuilding({ googleCalendarIds: next });
                              }}
                              className="p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )
                      )}
                      {(currentBuildingConfig.googleCalendarIds ?? [])
                        .length === 0 && (
                        <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs italic font-medium">
                          No Google Calendars synced for this building.
                        </div>
                      )}
                    </div>
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
