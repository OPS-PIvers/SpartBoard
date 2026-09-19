import React from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { CountdownConfig } from '@/types';

type CountdownDateKey = 'startDate' | 'eventDate';

const formatLocalDateForInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalDateInput = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearString, monthString, dayString] = match;
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);
  const date = new Date(year, month - 1, day, 12);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

const formatStoredDate = (storedValue: string | undefined): string => {
  if (!storedValue) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(storedValue)) return storedValue;
  const date = new Date(storedValue);
  return Number.isNaN(date.getTime()) ? '' : formatLocalDateForInput(date);
};

export const CountdownDateField: React.FC<{
  ctx: CustomRenderCtx;
  field: CountdownDateKey;
}> = ({ ctx, field }) => {
  const config = ctx.config as unknown as CountdownConfig;
  const value = formatStoredDate(config[field]);

  const handleChange = (nextValue: string) => {
    const date = parseLocalDateInput(nextValue);
    if (!date) return;
    ctx.updateConfig({ [field]: date.toISOString() });
  };

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
    >
      <input
        id={`${ctx.id}-input`}
        type="date"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
      />
    </div>
  );
};
