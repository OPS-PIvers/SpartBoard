/**
 * DueDatePicker — a brand-aligned date + time picker for the Classroom add-on
 * attachment-setup screen. Replaces the generic native `datetime-local` control
 * so the due date "feels custom like everything else": a glass trigger, a popover
 * month calendar, 12-hour time selects, and quick presets.
 *
 * Value model matches the rest of the assign flow: epoch-ms or `null` (no due
 * date). All math is local-time via the native `Date` (no date library is a
 * project dependency); the caller converts to UTC at the API boundary.
 *
 * Past days are disabled — Google Classroom requires a due date in the future,
 * and an assignment due in the past is never the intent.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';

interface DueDatePickerProps {
  /** Selected due date as epoch-ms, or null for no due date. */
  value: number | null;
  onChange: (ms: number | null) => void;
  disabled?: boolean;
  id?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
// Quarter-hour minute options keep the menu short while covering the common
// "due at :00/:15/:30/:45" cases teachers actually pick.
const MINUTE_OPTIONS = [0, 15, 30, 45];
// Default due time when a day is picked before any time is chosen: end of day,
// matching Google Classroom's own "11:59 PM" default for a date-only due date.
const DEFAULT_HOURS = 23;
const DEFAULT_MINUTES = 59;

/** Midnight today — the earliest selectable day. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatTrigger(value: number | null): string {
  if (value === null) return 'No due date';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const DueDatePicker: React.FC<DueDatePickerProps> = ({
  value,
  onChange,
  disabled = false,
  id,
}) => {
  const [open, setOpen] = useState(false);
  const selected = value !== null ? new Date(value) : null;

  // Calendar view month. Initialized to the selected month (or current) and
  // tracked separately so navigating months doesn't change the selection.
  const initialView = selected ?? new Date();
  const [viewYear, setViewYear] = useState(initialView.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialView.getMonth());

  // Time-of-day, kept independent of the day so changing one doesn't reset the
  // other. Seeded from the value (or the end-of-day default).
  const [hours, setHours] = useState(selected?.getHours() ?? DEFAULT_HOURS);
  const [minutes, setMinutes] = useState(
    selected?.getMinutes() ?? DEFAULT_MINUTES
  );

  const wrapperRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useClickOutside(wrapperRef, close);

  const today = startOfToday();

  const cells = useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const out: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    return out;
  }, [viewYear, viewMonth]);

  const emit = (
    year: number,
    month: number,
    day: number,
    h: number,
    m: number
  ) => {
    onChange(new Date(year, month, day, h, m, 0, 0).getTime());
  };

  const pickDay = (day: number) => {
    emit(viewYear, viewMonth, day, hours, minutes);
  };

  const changeTime = (h: number, m: number) => {
    setHours(h);
    setMinutes(m);
    // Re-emit against the already-selected day so the time edit takes effect
    // immediately; if nothing is selected yet, the time is held until a day is
    // picked.
    if (selected) {
      emit(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate(),
        h,
        m
      );
    }
  };

  const applyPreset = (daysFromToday: number) => {
    const d = startOfToday();
    d.setDate(d.getDate() + daysFromToday);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    emit(d.getFullYear(), d.getMonth(), d.getDate(), hours, minutes);
  };

  const stepMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const to24 = (h12: number, period: string) =>
    (h12 % 12) + (period === 'PM' ? 12 : 0);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-left text-sm transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Calendar
          className="h-4 w-4 shrink-0 text-brand-blue-light"
          aria-hidden="true"
        />
        <span className={value === null ? 'text-slate-500' : 'text-white'}>
          {formatTrigger(value)}
        </span>
        {value !== null && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear due date"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onChange(null);
              }
            }}
            className="ml-auto rounded-md p-0.5 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a due date"
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
          }}
          className="absolute left-0 z-50 mt-2 w-[20rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-slate-800/95 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl"
        >
          {/* Quick presets */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[
              { label: 'Today', days: 0 },
              { label: 'Tomorrow', days: 1 },
              { label: 'In a week', days: 7 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.days)}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Month navigation */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => stepMonth(-1)}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="text-sm font-semibold text-white">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => stepMonth(1)}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Weekday labels */}
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <span key={`blank-${i}`} />;
              const cellDate = new Date(viewYear, viewMonth, day);
              const isPast = cellDate < today;
              const isToday = cellDate.getTime() === today.getTime();
              const isSelected =
                selected !== null &&
                selected.getFullYear() === viewYear &&
                selected.getMonth() === viewMonth &&
                selected.getDate() === day;
              return (
                <button
                  key={day}
                  type="button"
                  disabled={isPast}
                  aria-pressed={isSelected}
                  onClick={() => pickDay(day)}
                  className={`flex h-8 items-center justify-center rounded-lg text-sm transition disabled:cursor-not-allowed disabled:text-slate-600 disabled:hover:bg-transparent ${
                    isSelected
                      ? 'bg-brand-blue-primary font-semibold text-white'
                      : isToday
                        ? 'text-brand-blue-light ring-1 ring-inset ring-brand-blue-light/50 hover:bg-white/10'
                        : 'text-slate-200 hover:bg-white/10'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Time of day */}
          <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
            <span className="text-xs font-medium text-slate-400">Due time</span>
            <div className="ml-auto flex items-center gap-1.5">
              <select
                aria-label="Hour"
                value={hour12}
                onChange={(e) =>
                  changeTime(to24(Number(e.target.value), ampm), minutes)
                }
                className="rounded-lg border border-white/15 bg-slate-900/60 px-2 py-1 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <span className="text-slate-500">:</span>
              <select
                aria-label="Minute"
                value={minutes}
                onChange={(e) => changeTime(hours, Number(e.target.value))}
                className="rounded-lg border border-white/15 bg-slate-900/60 px-2 py-1 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light"
              >
                {MINUTE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
              <select
                aria-label="AM or PM"
                value={ampm}
                onChange={(e) =>
                  changeTime(to24(hour12, e.target.value), minutes)
                }
                className="rounded-lg border border-white/15 bg-slate-900/60 px-2 py-1 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
          </div>

          {/* Footer actions */}
          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                close();
              }}
              className="text-xs font-medium text-slate-400 transition hover:text-slate-200"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-blue-light"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
