// PLC Settings: the recurring meeting schedule (leads and co-leads edit, everyone else reads).

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Plc, PlcMeetingCadence, PlcMeetingFrequency } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { usePlcs } from '@/hooks/usePlcs';
import { isPlcLeadOrCoLead } from '@/utils/plc';
import { zonedDateKey } from '@/utils/plcHomeTime';
import { describeMeetingCadence, weekdayName } from '@/utils/plcMeetingCadence';

interface Draft {
  frequency: PlcMeetingFrequency;
  weekday: number;
  nth: number;
  time: string;
  anchorDate: string;
  defaultAgenda: string;
}

const NTH_OPTIONS: readonly { value: number; key: string; label: string }[] = [
  { value: 1, key: 'first', label: 'First' },
  { value: 2, key: 'second', label: 'Second' },
  { value: 3, key: 'third', label: 'Third' },
  { value: 4, key: 'fourth', label: 'Fourth' },
  { value: -1, key: 'last', label: 'Last' },
];

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30';
const labelClass = 'block text-xs font-semibold text-slate-600';

function draftFrom(cadence: PlcMeetingCadence | undefined): Draft {
  return {
    frequency: cadence?.frequency ?? 'weekly',
    weekday: cadence?.weekday ?? 4,
    nth: cadence?.nth ?? 1,
    time: cadence?.time ?? '15:15',
    anchorDate: cadence?.anchorDate ?? zonedDateKey(Date.now()),
    defaultAgenda: cadence?.defaultAgenda ?? '',
  };
}

/** Move/skip overrides only survive while the dates they name are still on the schedule. */
function cadenceFromDraft(
  draft: Draft,
  previous: PlcMeetingCadence | undefined
): PlcMeetingCadence {
  const sameDates =
    previous?.frequency === draft.frequency &&
    previous.weekday === draft.weekday &&
    (previous.nth ?? 1) === draft.nth &&
    previous.anchorDate === draft.anchorDate;
  return {
    frequency: draft.frequency,
    weekday: draft.weekday,
    ...(draft.frequency === 'monthlyNthWeekday' ? { nth: draft.nth } : {}),
    time: draft.time,
    anchorDate: draft.anchorDate,
    ...(draft.defaultAgenda.trim()
      ? { defaultAgenda: draft.defaultAgenda }
      : {}),
    ...(sameDates && previous.overrides
      ? { overrides: previous.overrides }
      : {}),
  };
}

const CadenceEditor: React.FC<{ plc: Plc }> = ({ plc }) => {
  const { t, i18n } = useTranslation();
  const { updatePlcMeetingCadence } = usePlcs({ enabled: false });
  const { addToast } = useDashboard();
  const cadence = plc.meetingCadence;
  const [draft, setDraft] = useState<Draft>(() => draftFrom(cadence));
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const valid = /^\d{2}:\d{2}$/.test(draft.time) && draft.anchorDate !== '';

  const save = async (next: PlcMeetingCadence | null) => {
    if (busy) return;
    setBusy(true);
    try {
      await updatePlcMeetingCadence(plc.id, next);
      addToast(
        next
          ? t('plcDashboard.meetingCadence.saved', {
              defaultValue: 'Meeting schedule saved',
            })
          : t('plcDashboard.meetingCadence.cleared', {
              defaultValue: 'Meeting schedule removed',
            }),
        'success'
      );
    } catch (err) {
      addToast(
        err instanceof Error
          ? err.message
          : t('plcDashboard.meetingCadence.saveFailed', {
              defaultValue: 'Failed to save the meeting schedule',
            }),
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="mt-3 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void save(cadenceFromDraft(draft, cadence));
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          {t('plcDashboard.meetingCadence.frequency', {
            defaultValue: 'Repeats',
          })}
          <select
            className={inputClass}
            value={draft.frequency}
            onChange={(e) =>
              set('frequency', e.target.value as PlcMeetingFrequency)
            }
          >
            <option value="weekly">
              {t('plcDashboard.meetingCadence.weekly', {
                defaultValue: 'Every week',
              })}
            </option>
            <option value="biweekly">
              {t('plcDashboard.meetingCadence.biweekly', {
                defaultValue: 'Every 2 weeks',
              })}
            </option>
            <option value="monthlyNthWeekday">
              {t('plcDashboard.meetingCadence.monthly', {
                defaultValue: 'Once a month',
              })}
            </option>
          </select>
        </label>
        {draft.frequency === 'monthlyNthWeekday' && (
          <label className={labelClass}>
            {t('plcDashboard.meetingCadence.whichWeek', {
              defaultValue: 'Week of the month',
            })}
            <select
              className={inputClass}
              value={draft.nth}
              onChange={(e) => set('nth', Number(e.target.value))}
            >
              {NTH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(`plcDashboard.meetingCadence.nth.${o.key}`, {
                    defaultValue: o.label,
                  })}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={labelClass}>
          {t('plcDashboard.meetingCadence.day', { defaultValue: 'Day' })}
          <select
            className={inputClass}
            value={draft.weekday}
            onChange={(e) => set('weekday', Number(e.target.value))}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <option key={d} value={d}>
                {weekdayName(d, i18n.language)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          {t('plcDashboard.meetingCadence.time', { defaultValue: 'Time' })}
          <input
            type="time"
            className={inputClass}
            value={draft.time}
            onChange={(e) => set('time', e.target.value)}
            required
          />
        </label>
        <label className={labelClass}>
          {t('plcDashboard.meetingCadence.startsOn', {
            defaultValue: 'Starting on',
          })}
          <input
            type="date"
            className={inputClass}
            value={draft.anchorDate}
            onChange={(e) => set('anchorDate', e.target.value)}
            required
          />
        </label>
      </div>
      <label className={labelClass}>
        {t('plcDashboard.meetingCadence.defaultAgenda', {
          defaultValue: 'Default agenda (optional)',
        })}
        <textarea
          className={`${inputClass} min-h-[72px]`}
          value={draft.defaultAgenda}
          maxLength={2000}
          onChange={(e) => set('defaultAgenda', e.target.value)}
          placeholder={t('plcDashboard.meetingCadence.agendaPlaceholder', {
            defaultValue: 'Starts every new meeting with this agenda',
          })}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy || !valid}
          className="rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-blue-dark disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/50 focus-visible:ring-offset-2"
        >
          {t('plcDashboard.meetingCadence.save', {
            defaultValue: 'Save schedule',
          })}
        </button>
        {cadence && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(null)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/50 focus-visible:ring-offset-2"
          >
            {t('plcDashboard.meetingCadence.remove', {
              defaultValue: 'Remove schedule',
            })}
          </button>
        )}
      </div>
    </form>
  );
};

export const PlcMeetingCadenceSection: React.FC<{ plc: Plc }> = ({ plc }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const canEdit = user ? isPlcLeadOrCoLead(plc, user.uid) : false;
  const cadence = plc.meetingCadence;
  const summary = cadence
    ? describeMeetingCadence(cadence, t, i18n.language)
    : t('plcDashboard.meetingCadence.none', {
        defaultValue: 'No meeting schedule set.',
      });

  return (
    <div className="border-t border-slate-200 pt-4">
      <h3 className="text-sm font-bold text-slate-800">
        {t('plcDashboard.meetingCadence.heading', {
          defaultValue: 'Meeting schedule',
        })}
      </h3>
      {!canEdit && (
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          {t('plcDashboard.meetingCadence.memberDescription', {
            defaultValue: 'Set by the lead.',
          })}
        </p>
      )}
      <p className="mt-2 text-sm font-semibold text-slate-700">{summary}</p>
      {canEdit && (
        <CadenceEditor key={JSON.stringify(cadence ?? null)} plc={plc} />
      )}
    </div>
  );
};
