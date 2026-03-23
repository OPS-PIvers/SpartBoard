import React from 'react';
import { ScheduleItem, WidgetType } from '@/types';
import { GripVertical, Trash2, Timer, Link, CheckCircle2 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getTodayStr } from '../utils';

const AVAILABLE_WIDGETS: { type: WidgetType; label: string }[] = [
  { type: 'time-tool', label: 'Timer' },
  { type: 'clock', label: 'Clock' },
  { type: 'poll', label: 'Poll' },
  { type: 'text', label: 'Text' },
  { type: 'traffic', label: 'Traffic Light' },
  { type: 'sound', label: 'Sound Level' },
  { type: 'checklist', label: 'Checklist' },
  { type: 'random', label: 'Randomizer' },
  { type: 'dice', label: 'Dice' },
  { type: 'drawing', label: 'Drawing' },
  { type: 'qr', label: 'QR Code' },
  { type: 'embed', label: 'Embed' },
  { type: 'webcam', label: 'Webcam' },
  { type: 'scoreboard', label: 'Scoreboard' },
  { type: 'weather', label: 'Weather' },
  { type: 'lunchCount', label: 'Lunch Count' },
];
// ── SortableScheduleItem ─────────────────────────────────────────────────────

interface SortableScheduleItemProps {
  item: ScheduleItem;
  onUpdate: (itemId: string, updates: Partial<ScheduleItem>) => void;
  onDelete: (itemId: string) => void;
  isExpanded: boolean;
  onToggleExpand: (itemId: string) => void;
}

export const SortableScheduleItem: React.FC<SortableScheduleItemProps> =
  React.memo(({ item, onUpdate, onDelete, isExpanded, onToggleExpand }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: item.id ?? '' });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 50 : undefined,
    };

    const hasLinked = (item.linkedWidgets ?? []).length > 0;
    const todayStr = getTodayStr();
    const isOneOff = !!item.oneOffDate;
    const isExpiredOneOff = isOneOff && (item.oneOffDate ?? '') < todayStr;
    const isTodayOneOff = isOneOff && item.oneOffDate === todayStr;
    const isUpcomingOneOff = isOneOff && !isExpiredOneOff && !isTodayOneOff;

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`bg-white border rounded-lg shadow-sm overflow-hidden ${
          isDragging
            ? 'border-blue-300 shadow-lg opacity-60'
            : 'border-slate-200'
        }`}
      >
        {/* Row 1: grip + task name + delete */}
        <div className="flex items-center gap-1.5 px-2 pt-2 pb-1">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 text-slate-300 hover:text-slate-600 transition-colors shrink-0"
          >
            <GripVertical className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={item.task}
            onChange={(e) =>
              item.id && onUpdate(item.id, { task: e.target.value })
            }
            placeholder="Task name"
            className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded focus:border-blue-400 outline-none min-w-0"
          />
          {isOneOff && (
            <span
              className={`text-xxs px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                isExpiredOneOff
                  ? 'bg-slate-100 text-slate-400'
                  : isUpcomingOneOff
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'
              }`}
              title={
                isExpiredOneOff
                  ? `One-off: ${item.oneOffDate}`
                  : isUpcomingOneOff
                    ? `Upcoming: ${item.oneOffDate}`
                    : 'Today only'
              }
            >
              {isExpiredOneOff
                ? 'Expired'
                : isUpcomingOneOff
                  ? 'Upcoming'
                  : 'Today'}
            </span>
          )}
          <button
            type="button"
            onClick={() => item.id && onDelete(item.id)}
            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
            aria-label="Delete event"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* Row 2: times + toggles (indented to align with task input) */}
        <div className="flex items-center gap-1.5 px-2 pb-2 pl-9">
          <input
            type="time"
            value={item.startTime ?? item.time ?? ''}
            onChange={(e) =>
              item.id &&
              onUpdate(item.id, {
                startTime: e.target.value,
                time: e.target.value,
              })
            }
            className="flex-1 min-w-0 px-1.5 py-1 text-xs border border-slate-200 rounded outline-none"
          />
          <input
            type="time"
            value={item.endTime ?? ''}
            onChange={(e) =>
              item.id && onUpdate(item.id, { endTime: e.target.value })
            }
            className="flex-1 min-w-0 px-1.5 py-1 text-xs border border-slate-200 rounded outline-none"
          />
          <button
            type="button"
            onClick={() =>
              item.id &&
              onUpdate(item.id, {
                mode: item.mode === 'timer' ? 'clock' : 'timer',
              })
            }
            className={`p-1.5 rounded transition-colors shrink-0 ${
              item.mode === 'timer'
                ? 'text-indigo-500 bg-indigo-50'
                : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
            }`}
            title={
              item.mode === 'timer'
                ? 'Timer mode — click for clock'
                : 'Clock mode — click for timer'
            }
            aria-pressed={item.mode === 'timer'}
          >
            <Timer className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => item.id && onToggleExpand(item.id)}
            className={`p-1.5 mr-1 rounded transition-colors shrink-0 ${
              hasLinked || isExpanded
                ? 'text-blue-500 bg-blue-50'
                : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
            }`}
            title="Auto-launch widget"
            aria-pressed={isExpanded}
          >
            <Link className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Auto-launch expanded section */}
        {isExpanded && (
          <div className="border-t border-slate-100 px-3 py-2.5 bg-slate-50">
            <p className="text-xxs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Link className="w-3 h-3" /> Auto-Launch Widget
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {AVAILABLE_WIDGETS.map((w) => {
                const linked = item.linkedWidgets ?? [];
                const isSelected = linked.includes(w.type);
                return (
                  <button
                    key={w.type}
                    type="button"
                    onClick={() => {
                      if (!item.id) return;
                      const newLinked = isSelected
                        ? linked.filter((t) => t !== w.type)
                        : [...linked, w.type];
                      onUpdate(item.id, { linkedWidgets: newLinked });
                    }}
                    className={`text-xxs px-2 py-1.5 rounded border flex items-center gap-1 transition-colors ${
                      isSelected
                        ? 'bg-blue-100 border-blue-300 text-blue-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                    aria-pressed={isSelected}
                  >
                    {isSelected && (
                      <CheckCircle2 className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                    )}
                    {w.label}
                  </button>
                );
              })}
            </div>
            {hasLinked && (
              <p className="text-xxs text-slate-400 mt-2">
                Selected widgets launch automatically when this event starts.
              </p>
            )}
          </div>
        )}
      </div>
    );
  });

SortableScheduleItem.displayName = 'SortableScheduleItem';
