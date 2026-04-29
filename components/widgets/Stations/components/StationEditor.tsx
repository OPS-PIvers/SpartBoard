import React, { useState } from 'react';
import { Station } from '@/types';
import {
  ChevronDown,
  ChevronUp,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { WIDGET_PALETTE } from '@/config/colors';
import { renderCatalystIcon } from '@/components/widgets/Catalyst/catalystHelpers';
import { IconOrImageInput } from './IconOrImageInput';

interface StationEditorProps {
  station: Station;
  index: number;
  total: number;
  onChange: (updates: Partial<Station>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export const StationEditor: React.FC<StationEditorProps> = ({
  station,
  index,
  total,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}) => {
  const [expanded, setExpanded] = useState(true);
  const iconSource = station.imageUrl?.trim()
    ? station.imageUrl
    : station.iconName?.trim()
      ? station.iconName
      : 'LayoutGrid';

  return (
    <div
      className="rounded-2xl border-2 bg-white overflow-hidden transition-shadow shadow-sm hover:shadow-md"
      style={{ borderColor: station.color || '#e2e8f0' }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ backgroundColor: `${station.color || '#94a3b8'}10` }}
      >
        <div
          className="shrink-0 rounded-lg bg-white border border-slate-200 flex items-center justify-center"
          style={{ width: 36, height: 36 }}
        >
          {renderCatalystIcon(iconSource, 22, '')}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="text-sm font-black truncate"
            style={{ color: station.color || '#0f172a' }}
          >
            {station.title || 'Untitled station'}
          </div>
          <div className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
            Station {index + 1} of {total}
            {station.maxStudents != null && ` · max ${station.maxStudents}`}
          </div>
        </div>
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          className="p-1.5 rounded-md text-slate-400 enabled:hover:text-slate-700 enabled:hover:bg-slate-100 disabled:opacity-30 transition-colors"
          aria-label="Move up"
        >
          <ArrowUp size={14} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="p-1.5 rounded-md text-slate-400 enabled:hover:text-slate-700 enabled:hover:bg-slate-100 disabled:opacity-30 transition-colors"
          aria-label="Move down"
        >
          <ArrowDown size={14} />
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded-md text-slate-400 hover:text-brand-red-primary hover:bg-red-50 transition-colors"
          aria-label="Delete station"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className="p-3 space-y-3 border-t border-slate-100">
          <div>
            <label className="block text-xxs font-bold text-slate-500 uppercase tracking-widest mb-1">
              Title
            </label>
            <input
              type="text"
              value={station.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="e.g. Reading Corner"
              className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xxs font-bold text-slate-500 uppercase tracking-widest mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={station.description ?? ''}
              onChange={(e) =>
                onChange({ description: e.target.value || undefined })
              }
              placeholder="Short instruction for students"
              className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xxs font-bold text-slate-500 uppercase tracking-widest mb-1">
                Max students
              </label>
              <input
                type="number"
                min={1}
                value={station.maxStudents ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') return onChange({ maxStudents: undefined });
                  const parsed = Math.max(1, Number(v));
                  if (Number.isFinite(parsed))
                    onChange({ maxStudents: parsed });
                }}
                placeholder="No limit"
                className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xxs font-bold text-slate-500 uppercase tracking-widest mb-1">
                Color
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {WIDGET_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onChange({ color: c })}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${
                      station.color === c
                        ? 'border-slate-800 scale-110 shadow-md'
                        : 'border-transparent hover:scale-110'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
                <input
                  type="color"
                  value={station.color}
                  onChange={(e) => onChange({ color: e.target.value })}
                  className="w-6 h-6 rounded border border-slate-200 cursor-pointer"
                  aria-label="Custom color"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xxs font-bold text-slate-500 uppercase tracking-widest mb-1">
              Icon or image
            </label>
            <IconOrImageInput
              iconName={station.iconName}
              imageUrl={station.imageUrl}
              onChange={(next) => onChange(next)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
