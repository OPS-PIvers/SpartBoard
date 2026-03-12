import React from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { WidgetData, ChecklistConfig, ChecklistItem } from '@/types';

interface RemoteChecklistControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

export const RemoteChecklistControl: React.FC<RemoteChecklistControlProps> = ({
  widget,
  updateWidget,
}) => {
  const config = widget.config as ChecklistConfig;
  const items: ChecklistItem[] = config.items ?? [];

  const toggleItem = (itemId: string) => {
    const updated = items.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    updateWidget(widget.id, { config: { ...config, items: updated } });
  };

  const resetAll = () => {
    const updated = items.map((item) => ({ ...item, completed: false }));
    updateWidget(widget.id, { config: { ...config, items: updated } });
  };

  const checkAll = () => {
    const updated = items.map((item) => ({ ...item, completed: true }));
    updateWidget(widget.id, { config: { ...config, items: updated } });
  };

  const completedCount = items.filter((i) => i.completed).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-white/10">
        <div className="flex flex-col">
          <span className="text-white/60 text-xs uppercase tracking-widest font-bold">
            Checklist
          </span>
          <span className="text-white/40 text-xs">
            {completedCount} / {items.length} done
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={checkAll}
            className="touch-manipulation px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-bold transition-all active:scale-95"
            aria-label="Check all"
          >
            All Done
          </button>
          <button
            onClick={resetAll}
            className="touch-manipulation flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white/60 text-xs font-bold transition-all active:scale-95"
            aria-label="Reset all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-white/30 text-sm italic">
          No items — add them in the widget settings.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => toggleItem(item.id)}
              className={`touch-manipulation flex items-center gap-3 w-full px-4 py-3 rounded-xl border text-left transition-all active:scale-[0.98] ${
                item.completed
                  ? 'bg-green-500/10 border-green-500/30 text-white/40 line-through'
                  : 'bg-white/5 border-white/10 text-white'
              }`}
              aria-pressed={item.completed}
              aria-label={`${item.completed ? 'Uncheck' : 'Check'}: ${item.text}`}
            >
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  item.completed
                    ? 'bg-green-500 border-green-500'
                    : 'border-white/30'
                }`}
              >
                {item.completed && <Check className="w-3.5 h-3.5 text-white" />}
              </div>
              <span className="text-base font-semibold">{item.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
