import React, { useState, useEffect } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, CalendarConfig, CalendarGlobalConfig } from '@/types';
import {
  Plus,
  Trash2,
  Settings2,
  RefreshCw,
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  Type,
  Palette,
} from 'lucide-react';
import { useFeaturePermissions } from '@/hooks/useFeaturePermissions';
import { useAuth } from '@/context/useAuth';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { Toggle } from '@/components/common/Toggle';
import { FONTS, extractCalendarId } from './constants';

export const CalendarSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const { signInWithGoogle, selectedBuildings } = useAuth();
  const { isConnected } = useGoogleCalendar();
  const { subscribeToPermission } = useFeaturePermissions();
  const config = widget.config as CalendarConfig;
  const events = config.events ?? [];
  const personalIds = config.personalCalendarIds ?? [];
  const daysVisible = config.daysVisible ?? 5;

  const [globalConfig, setGlobalConfig] = useState<CalendarGlobalConfig | null>(
    null
  );
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [isAddingLocal, setIsAddingLocal] = useState(false);

  const [personalInput, setPersonalInput] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    return subscribeToPermission('calendar', (perm) => {
      if (perm?.config) {
        const gConfig = perm.config as unknown as CalendarGlobalConfig;
        setGlobalConfig(gConfig);
      }
    });
  }, [subscribeToPermission]);

  const buildingId = selectedBuildings?.[0];
  const lastSyncAt = buildingId
    ? globalConfig?.buildingDefaults?.[buildingId]?.lastProxySync
    : null;

  const addLocalEvent = () => {
    if (newTitle && newDate) {
      updateWidget(widget.id, {
        config: {
          ...config,
          events: [
            ...events,
            { title: newTitle, date: newDate, time: newTime || undefined },
          ],
        } as CalendarConfig,
      });
      setNewTitle('');
      setNewDate('');
      setNewTime('');
      setIsAddingLocal(false);
    }
  };

  const addPersonalId = () => {
    const id = extractCalendarId(personalInput);
    if (id && !personalIds.includes(id)) {
      updateWidget(widget.id, {
        config: {
          ...config,
          personalCalendarIds: [...personalIds, id],
        } as CalendarConfig,
      });
      setPersonalInput('');
    }
  };

  const removePersonalId = (id: string) => {
    updateWidget(widget.id, {
      config: {
        ...config,
        personalCalendarIds: personalIds.filter((p) => p !== id),
      } as CalendarConfig,
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Display Options */}
      <section>
        <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
          <Settings2 className="w-3 h-3" /> Display Options
        </label>
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-700">
                Sync Building Schedule
              </span>
              {lastSyncAt && (
                <span className="text-xxs text-slate-400 font-bold uppercase tracking-tight flex items-center gap-1">
                  <RefreshCw className="w-2.5 h-2.5" />
                  Synced{' '}
                  {new Date(lastSyncAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
            <Toggle
              checked={config.isBuildingSyncEnabled ?? true}
              onChange={(checked: boolean) =>
                updateWidget(widget.id, {
                  config: {
                    ...config,
                    isBuildingSyncEnabled: checked,
                  } as CalendarConfig,
                })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-700">
                Days to Display
              </span>
              <span className="text-xxs text-slate-500">
                Show events for the next X days
              </span>
            </div>
            <input
              type="number"
              min={1}
              max={30}
              value={daysVisible}
              onChange={(e) =>
                updateWidget(widget.id, {
                  config: {
                    ...config,
                    daysVisible: parseInt(e.target.value, 10),
                  } as CalendarConfig,
                })
              }
              className="w-16 px-2 py-1 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
        </div>
      </section>

      <hr className="border-slate-100" />

      {/* 2. Personal Google Calendars */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xxs text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <ShieldCheck className="w-3 h-3" /> Personal Google Calendars
          </label>
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="text-xxs font-black text-blue-500 uppercase tracking-tight flex items-center gap-1 hover:text-blue-600 transition-colors"
          >
            <HelpCircle className="w-3 h-3" /> Instructions
          </button>
        </div>

        {showInstructions && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-[11px] text-blue-800 space-y-2 animate-in slide-in-from-top-2">
            <p className="font-bold">How to find your Calendar ID:</p>
            <ol className="list-decimal list-inside space-y-1 opacity-90">
              <li>Open Google Calendar on your computer.</li>
              <li>
                Hover over your calendar name on the left and click the three
                dots ⋮ &gt; <strong>Settings and sharing</strong>.
              </li>
              <li>
                Scroll down to the <strong>Integrate calendar</strong> section.
              </li>
              <li>
                Copy the <strong>Calendar ID</strong> (it usually looks like an
                email address).
              </li>
              <li>Paste the ID (or the public URL) into the box below.</li>
            </ol>
            <div className="pt-1 flex items-center gap-2">
              <a
                href="https://calendar.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 font-black uppercase tracking-tighter hover:underline"
              >
                Open Google Calendar <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        )}

        {!isConnected ? (
          <button
            onClick={() => void signInWithGoogle()}
            className="w-full py-2.5 bg-white border-2 border-dashed border-slate-200 rounded-xl text-xs font-black text-slate-500 flex items-center justify-center gap-2 hover:border-blue-400 hover:text-blue-500 transition-all"
          >
            <div className="w-4 h-4 bg-white shadow-sm border border-slate-100 rounded-full flex items-center justify-center overflow-hidden">
              <img
                src="https://www.google.com/favicon.ico"
                className="w-3 h-3"
                alt=""
              />
            </div>
            Sign in with Google to Sync
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Paste Calendar ID or URL"
                value={personalInput}
                onChange={(e) => setPersonalInput(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={addPersonalId}
                disabled={!personalInput}
                className="px-4 bg-blue-600 text-white rounded-lg text-xs font-black uppercase tracking-widest disabled:opacity-50"
              >
                Add
              </button>
            </div>

            <div className="space-y-1.5">
              {personalIds.map((id) => (
                <div
                  key={id}
                  className="flex items-center justify-between px-3 py-2 bg-white border border-slate-100 rounded-lg shadow-sm"
                >
                  <span className="text-xs font-medium text-slate-600 truncate max-w-[200px]">
                    {id}
                  </span>
                  <button
                    onClick={() => removePersonalId(id)}
                    className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <hr className="border-slate-100" />

      {/* 3. Local Events */}
      <section className="space-y-3">
        <label className="text-xxs text-slate-400 uppercase tracking-widest block">
          Local Manual Events
        </label>

        {isAddingLocal ? (
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3">
            <input
              type="text"
              placeholder="Event title (e.g., Art, PE)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <input
              type="text"
              placeholder="Day/Date (e.g., Monday, 2024-10-12)"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <input
              type="text"
              placeholder="Time (Optional, e.g. 14:30 or 2:30 PM)"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <div className="flex gap-2">
              <button
                onClick={addLocalEvent}
                disabled={!newTitle || !newDate}
                className="flex-1 py-2 bg-rose-600 text-white rounded-lg text-xxs font-black uppercase tracking-widest disabled:opacity-50"
              >
                Add Event
              </button>
              <button
                onClick={() => setIsAddingLocal(false)}
                className="px-3 py-2 bg-slate-200 text-slate-600 rounded-lg text-xxs font-black uppercase tracking-widest"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingLocal(true)}
            className="w-full py-2.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-rose-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Local Event
          </button>
        )}

        <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
          {events.map((event, i: number) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 shadow-sm group"
            >
              <div className="min-w-0">
                <div className="text-xxs font-black text-rose-500 uppercase tracking-wider">
                  {event.date}
                </div>
                <div className="text-sm font-bold text-slate-700 truncate">
                  {event.title}
                </div>
              </div>
              <button
                onClick={() =>
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      events: events.filter((_, idx: number) => idx !== i),
                    } as CalendarConfig,
                  })
                }
                className="p-1.5 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {events.length === 0 && (
            <div className="text-center py-6 text-slate-400 border-2 border-dashed rounded-2xl bg-slate-50/50">
              <p className="text-xxs italic">No local events added.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export const CalendarAppearanceSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as CalendarConfig;

  return (
    <div className="space-y-6">
      {/* Typography */}
      <section>
        <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Type className="w-3 h-3" /> Typography
        </label>
        <div className="grid grid-cols-4 gap-2">
          {FONTS.map((f) => (
            <button
              key={f.id}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, fontFamily: f.id } as CalendarConfig,
                })
              }
              className={`p-2 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${
                config.fontFamily === f.id ||
                (!config.fontFamily && f.id === 'global')
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-100 hover:border-slate-200'
              }`}
            >
              <span className={`text-sm ${f.id} text-slate-900`}>{f.icon}</span>
              <span className="text-xxxs uppercase text-slate-600">
                {f.label}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Card Style */}
      <section>
        <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Palette className="w-3 h-3" /> Card Style
        </label>
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">
                Card Color
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-mono">
                  {config.cardColor ?? '#ffffff'}
                </span>
                <input
                  type="color"
                  value={config.cardColor ?? '#ffffff'}
                  onChange={(e) =>
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        cardColor: e.target.value,
                      } as CalendarConfig,
                    })
                  }
                  className="w-8 h-8 rounded cursor-pointer border border-slate-200 p-0.5"
                  aria-label="Card color"
                  title="Choose card background color"
                />
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-slate-700">
                Card Opacity
              </span>
              <span className="text-xs text-slate-500 tabular-nums">
                {Math.round((config.cardOpacity ?? 1) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={config.cardOpacity ?? 1}
              onChange={(e) =>
                updateWidget(widget.id, {
                  config: {
                    ...config,
                    cardOpacity: parseFloat(e.target.value),
                  } as CalendarConfig,
                })
              }
              aria-label="Card opacity"
              className="w-full accent-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Set to 0% for fully transparent cards.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
