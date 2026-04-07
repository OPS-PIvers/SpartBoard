import React from 'react';
import { First5GlobalConfig } from '@/types';

interface First5ConfigurationPanelProps {
  config: First5GlobalConfig;
  onChange: (newConfig: First5GlobalConfig) => void;
}

/**
 * Counts weekdays (Mon–Fri) between two dates, excluding start, including end.
 * Returns positive if end > start, negative if end < start.
 */
function countWeekdaysBetween(start: Date, end: Date): number {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const sign = endMs >= startMs ? 1 : -1;
  const [from, to] = sign === 1 ? [start, end] : [end, start];

  let count = 0;
  const cursor = new Date(from);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= to) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count * sign;
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function computeTodaysDayNumber(
  activeDayNumber: number,
  referenceDate: string
): number {
  const ref = stripTime(new Date(referenceDate + 'T00:00:00'));
  const today = stripTime(new Date());
  return activeDayNumber + countWeekdaysBetween(ref, today);
}

export const First5ConfigurationPanel: React.FC<
  First5ConfigurationPanelProps
> = ({ config, onChange }) => {
  const activeDayNumber = config.activeDayNumber ?? 0;
  const referenceDate = config.referenceDate ?? '';

  const todaysDayNumber =
    activeDayNumber && referenceDate
      ? computeTodaysDayNumber(activeDayNumber, referenceDate)
      : null;

  const todayISO = new Date().toISOString().split('T')[0];

  const handleDayNumberChange = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      onChange({
        ...config,
        activeDayNumber: num,
        referenceDate: todayISO,
      });
    }
  };

  const handleResetToToday = () => {
    if (todaysDayNumber !== null) {
      onChange({
        ...config,
        activeDayNumber: todaysDayNumber,
        referenceDate: todayISO,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="first5-day-number"
          className="text-xxs font-bold text-slate-500 uppercase mb-2 block"
        >
          Today&apos;s Day Number
        </label>
        <div className="flex items-center gap-2">
          <input
            id="first5-day-number"
            type="number"
            value={todaysDayNumber ?? (activeDayNumber || '')}
            onChange={(e) => handleDayNumberChange(e.target.value)}
            placeholder="e.g. 777"
            className="w-32 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
          />
          {referenceDate && referenceDate !== todayISO && (
            <button
              type="button"
              onClick={handleResetToToday}
              className="px-3 py-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
            >
              Sync to Today
            </button>
          )}
        </div>
        <p className="text-xxs text-slate-400 mt-1">
          The day number shown on edtomorrow.com/today/ for today. This number
          auto-increments by 1 each weekday. Adjust it here if the website skips
          a day.
        </p>
      </div>

      {referenceDate && (
        <div className="text-xxs text-slate-400">
          Last set: {new Date(referenceDate + 'T00:00:00').toLocaleDateString()}{' '}
          (base #{activeDayNumber})
          {todaysDayNumber !== null &&
            todaysDayNumber !== activeDayNumber &&
            ` → auto-incremented to #${todaysDayNumber} today`}
        </div>
      )}

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-xs text-amber-700">
          URL pattern:{' '}
          <code className="bg-amber-100 px-1 rounded">
            edtomorrow.com/today/
            {todaysDayNumber ?? '???'}
            [j/p/s]
          </code>
        </p>
        <p className="text-xxs text-amber-600 mt-1">
          The age letter (j/p/s) is determined by each teacher&apos;s selected
          building: K-2→j, 3-5→p, 6-12→s
        </p>
      </div>
    </div>
  );
};
