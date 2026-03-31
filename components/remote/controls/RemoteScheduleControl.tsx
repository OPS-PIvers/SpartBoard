import React, { useMemo } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { WidgetData, ScheduleConfig, ScheduleItem } from '@/types';

interface RemoteScheduleControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

/** Returns the active schedule's items (handles both legacy items[] and schedules[]) */
const getActiveItems = (config: ScheduleConfig): ScheduleItem[] => {
  if (config.schedules && config.schedules.length > 0) {
    const today = new Date().getDay();
    const active = config.schedules.find((s) => s.days.includes(today));
    return active?.items ?? config.schedules[0]?.items ?? [];
  }
  return config.items ?? [];
};

export const RemoteScheduleControl: React.FC<RemoteScheduleControlProps> = ({
  widget,
  updateWidget,
}) => {
  const config = widget.config as ScheduleConfig;
  const items = useMemo(() => getActiveItems(config), [config]);

  const toggleItem = (index: number) => {
    // Handle both schedules[] and legacy items[]
    if (config.schedules && config.schedules.length > 0) {
      const today = new Date().getDay();
      const scheduleIdx = config.schedules.findIndex((s) =>
        s.days.includes(today)
      );
      const targetIdx = scheduleIdx >= 0 ? scheduleIdx : 0;
      const updatedSchedules = config.schedules.map((s, si) => {
        if (si !== targetIdx) return s;
        return {
          ...s,
          items: s.items.map((it, ii) =>
            ii === index ? { ...it, done: !it.done } : it
          ),
        };
      });
      updateWidget(widget.id, {
        config: { ...config, schedules: updatedSchedules },
      });
    } else {
      const updated = (config.items ?? []).map((it, ii) =>
        ii === index ? { ...it, done: !it.done } : it
      );
      updateWidget(widget.id, { config: { ...config, items: updated } });
    }
  };

  const resetAll = () => {
    if (config.schedules && config.schedules.length > 0) {
      const updatedSchedules = config.schedules.map((s) => ({
        ...s,
        items: s.items.map((it) => ({ ...it, done: false })),
      }));
      updateWidget(widget.id, {
        config: { ...config, schedules: updatedSchedules },
      });
    } else {
      const updated = (config.items ?? []).map((it) => ({
        ...it,
        done: false,
      }));
      updateWidget(widget.id, { config: { ...config, items: updated } });
    }
  };

  // ⚡ Bolt Optimization: Use reduce instead of filter().length to avoid creating intermediate arrays on each render
  const doneCount = useMemo(
    () => items.reduce((acc, i) => acc + (i.done ? 1 : 0), 0),
    [items]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-white/10">
        <div>
          <div className="text-white/60 text-xs uppercase tracking-widest font-bold">
            Schedule
          </div>
          <div className="text-white/40 text-xs">
            {doneCount} / {items.length} done
          </div>
        </div>
        <button
          onClick={resetAll}
          className="touch-manipulation flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white/60 text-xs font-bold transition-all active:scale-95"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-white/30 text-sm italic">
          No schedule items yet.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {items.map((item, index) => (
            <button
              key={item.id ?? index}
              onClick={() => toggleItem(index)}
              className={`touch-manipulation flex items-start gap-3 w-full px-4 py-3 rounded-xl border text-left transition-all active:scale-[0.98] ${
                item.done
                  ? 'bg-green-500/10 border-green-500/20 text-white/40'
                  : 'bg-white/5 border-white/10 text-white'
              }`}
              aria-pressed={item.done}
            >
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                  item.done
                    ? 'bg-green-500 border-green-500'
                    : 'border-white/30'
                }`}
              >
                {item.done && <Check className="w-3.5 h-3.5 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={`font-semibold text-base leading-snug ${item.done ? 'line-through' : ''}`}
                >
                  {item.task}
                </div>
                {(item.startTime ?? item.time) && (
                  <div className="text-xs text-white/30 mt-0.5">
                    {item.startTime ?? item.time}
                    {item.endTime ? ` – ${item.endTime}` : ''}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
