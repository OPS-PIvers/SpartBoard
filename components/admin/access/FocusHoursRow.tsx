import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Clock, Loader2 } from 'lucide-react';
import { db } from '@/config/firebase';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import {
  FOCUS_HOURS_TITLE,
  FOCUS_SESSIONS_SETTINGS_DOC,
} from '@/config/focusSessions';
import { DEFAULT_FOCUS_WINDOW, type FocusWindow } from '@/utils/focus/contract';
import { parseFocusSettings, validFocusWindow } from '@/utils/focus/settings';
import { useAuth } from '@/context/useAuth';
import { isSuperAdminActor } from '@/utils/superAdmin';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const sameWindow = (a: FocusWindow, b: FocusWindow) =>
  a.start === b.start &&
  a.end === b.end &&
  a.timeZone === b.timeZone &&
  [...a.days].sort().join() === [...b.days].sort().join();

/** F6: the hours and days focus sessions may run, in Central time; the server enforces them. */
export const FocusHoursRow: React.FC = () => {
  const { user, userRoles, roleId, orgId } = useAuth();
  const locked = !isSuperAdminActor(
    user?.email,
    userRoles?.superAdmins,
    roleId,
    orgId
  );
  const [saved, setSaved] = useState<FocusWindow | null>(null);
  const [draft, setDraft] = useState<FocusWindow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'admin_settings', FOCUS_SESSIONS_SETTINGS_DOC),
        (snap) => setSaved(parseFocusSettings(snap.data()).window),
        (err) => {
          console.error('[FocusHoursRow]', err);
          setError('Could not load');
        }
      ),
    []
  );

  const shown = draft ?? saved;
  const valid = shown ? validFocusWindow(shown) : null;
  const dirty = !!draft && !!saved && !sameWindow(draft, saved);
  const edit = (patch: Partial<FocusWindow>) => {
    if (!shown) return;
    setError(null);
    setDraft({ ...shown, ...patch, timeZone: DEFAULT_FOCUS_WINDOW.timeZone });
  };
  const toggleDay = (day: number) => {
    if (!shown) return;
    edit({
      days: shown.days.includes(day)
        ? shown.days.filter((d) => d !== day)
        : [...shown.days, day].sort(),
    });
  };
  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await setDoc(
        doc(db, 'admin_settings', FOCUS_SESSIONS_SETTINGS_DOC),
        { window: valid },
        { merge: true }
      );
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const status =
    shown && !valid
      ? 'Pick at least one day and an end time after the start time.'
      : 'Focus sessions can run only during these hours, Central time.';

  return (
    <div
      data-testid="focus-hours-row"
      className="bg-white flex flex-wrap items-center gap-3 p-3"
    >
      <span className="bg-brand-blue-lighter p-2 rounded-lg text-brand-blue-primary shrink-0">
        <Clock className="w-4 h-4" aria-hidden />
      </span>
      <span className="min-w-48 flex-1">
        <span className="block font-bold text-slate-800 text-sm">
          {FOCUS_HOURS_TITLE}
        </span>
        <span className="block text-xxs text-slate-500">
          {status}
          {error ? ` · ${error}` : ''}
          {locked ? ' · Super admins only' : ''}
        </span>
      </span>
      {!shown ? (
        !error && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          <input
            {...tourAttr('admin.previews.focus-hours-start')}
            type="time"
            aria-label="Start time"
            value={shown.start}
            disabled={locked || saving}
            onChange={(e) => edit({ start: e.target.value })}
            className="px-1 py-1 text-xs border border-slate-200 rounded outline-none focus:border-brand-blue-primary disabled:opacity-50"
          />
          <span className="text-xs text-slate-500">to</span>
          <input
            {...tourAttr('admin.previews.focus-hours-end')}
            type="time"
            aria-label="End time"
            value={shown.end}
            disabled={locked || saving}
            onChange={(e) => edit({ end: e.target.value })}
            className="px-1 py-1 text-xs border border-slate-200 rounded outline-none focus:border-brand-blue-primary disabled:opacity-50"
          />
          <span className="flex" role="group" aria-label="Days">
            {DAYS.map((label, day) => {
              const on = shown.days.includes(day);
              return (
                <button
                  key={label}
                  type="button"
                  {...tourFieldAttr(
                    'admin.previews.focus-hours-day',
                    'admin',
                    String(day)
                  )}
                  aria-pressed={on}
                  aria-label={DAY_NAMES[day]}
                  disabled={locked || saving}
                  onClick={() => toggleDay(day)}
                  className={`px-1.5 py-1 text-xxs font-bold border-y border-r first:border-l first:rounded-l last:rounded-r disabled:opacity-50 ${
                    on
                      ? 'bg-brand-blue-primary border-brand-blue-primary text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </span>
          <button
            type="button"
            {...tourAttr('admin.previews.focus-hours-save')}
            onClick={() => void save()}
            disabled={locked || saving || !dirty || !valid}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-blue-primary text-white text-xs font-bold hover:bg-brand-blue-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            )}
            Save
          </button>
        </span>
      )}
    </div>
  );
};
