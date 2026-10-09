// Team settings: the lead attaches a Google Calendar embed link (T28); everyone else sees nothing here.

import React, { useState } from 'react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { saveTeamCalendar } from '@/hooks/usePlcUpdates';
import type { Plc } from '@/types';
import { logError } from '@/utils/logError';
import { isPlcLeadOrCoLead } from '@/utils/plc';
import { normalizeCalendarEmbedInput } from '@/utils/teamUpdates';
import { tourAttr } from '@/config/tourAnchors';

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30';

const CalendarForm: React.FC<{ plc: Plc }> = ({ plc }) => {
  const { addToast } = useDashboard();
  const [value, setValue] = useState(plc.calendarEmbedUrl ?? '');
  const [busy, setBusy] = useState(false);
  const normalized = normalizeCalendarEmbedInput(value);
  const invalid = value.trim().length > 0 && normalized === null;

  const save = async (url: string | null) => {
    setBusy(true);
    try {
      await saveTeamCalendar(plc.id, url);
      if (url === null) setValue('');
    } catch (err) {
      logError('TeamCalendarSettings.save', err, { plcId: plc.id });
      addToast('Something went wrong. Try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (normalized) void save(normalized);
      }}
    >
      <label className="block text-xs font-semibold text-slate-600">
        Google Calendar
        <input
          type="text"
          className={inputClass}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://calendar.google.com/calendar/embed?src=…"
          aria-invalid={invalid}
          {...tourAttr('teams.calendar-settings.url')}
          title="Google Calendar > Settings > Integrate calendar > Embed code"
        />
      </label>
      {invalid && (
        <p className="text-xs text-brand-red-primary">
          Paste a Google Calendar embed link.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          {...tourAttr('teams.calendar-settings.save')}
          disabled={busy || !normalized || normalized === plc.calendarEmbedUrl}
          className="rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-blue-dark disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/50 focus-visible:ring-offset-2"
        >
          Save
        </button>
        {plc.calendarEmbedUrl && (
          <button
            type="button"
            disabled={busy}
            {...tourAttr('teams.calendar-settings.remove')}
            onClick={() => void save(null)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/50 focus-visible:ring-offset-2"
          >
            Remove
          </button>
        )}
      </div>
    </form>
  );
};

export const TeamCalendarSettings: React.FC<{ plc: Plc }> = ({ plc }) => {
  const { user } = useAuth();
  if (!user || !isPlcLeadOrCoLead(plc, user.uid)) return null;
  return (
    <div className="border-t border-slate-200 pt-4">
      <h3 className="text-sm font-bold text-slate-800">Calendar</h3>
      <CalendarForm key={plc.calendarEmbedUrl ?? ''} plc={plc} />
    </div>
  );
};
