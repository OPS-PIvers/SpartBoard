import React from 'react';
import { ChevronDown } from 'lucide-react';
import { tourAttr } from '@/config/tourAnchors';
import type { BoardClassOption } from '../../boardHelpers';

interface BoardClassPickerProps {
  widgetId: string;
  options: BoardClassOption[];
  value: string | null;
  onChange: (classId: string) => void;
}

const chipStyle: React.CSSProperties = {
  padding: 'min(4px, 0.9cqmin) min(9px, 2cqmin)',
  fontSize: 'min(12px, 3.6cqmin)',
  maxWidth: 'min(180px, 34cqmin)',
};

/** D32 — the board's own class, chosen from the run's classes only. */
export const BoardClassPicker: React.FC<BoardClassPickerProps> = ({
  widgetId,
  options,
  value,
  onChange,
}) => {
  const current = options.find((o) => o.id === value);
  if (options.length <= 1) {
    return (
      <span
        {...tourAttr('projects.class-picker', widgetId, 'projects')}
        title={current?.label}
        className="shrink truncate rounded-full border border-slate-200 bg-white/70 font-semibold text-slate-600"
        style={chipStyle}
      >
        {current?.label ?? 'No class'}
      </span>
    );
  }
  return (
    <span
      className="relative inline-flex min-w-0 shrink items-center"
      style={{ maxWidth: chipStyle.maxWidth }}
    >
      <select
        {...tourAttr('projects.class-picker', widgetId, 'projects')}
        aria-label="Class"
        title={current?.label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 cursor-pointer appearance-none truncate rounded-full border border-slate-200 bg-white/70 font-semibold text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
        style={{
          ...chipStyle,
          maxWidth: undefined,
          paddingRight: 'min(24px, 5.5cqmin)',
        }}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute text-slate-500"
        style={{
          right: 'min(8px, 1.8cqmin)',
          width: 'min(12px, 3.2cqmin)',
          height: 'min(12px, 3.2cqmin)',
        }}
      />
    </span>
  );
};
