import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useDashboard } from '../../context/useDashboard';
import {
  ChecklistConfig,
  ChecklistItem,
  WidgetData,
  DEFAULT_GLOBAL_STYLE,
  InstructionalRoutinesConfig,
} from '../../types';
import { useDebounce } from '../../hooks/useDebounce';
import { RosterModeControl } from '../common/RosterModeControl';
import {
  ListPlus,
  Type,
  Users,
  RefreshCw,
  BookOpen,
  Circle,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { ScaledEmptyState } from '../common/ScaledEmptyState';
import { SettingsLabel } from '../common/SettingsLabel';
import { WidgetLayout } from './WidgetLayout';

interface ChecklistCardProps {
  id: string;
  label: string;
  isCompleted: boolean;
  onToggle: (id: string) => void;
  textSize: string;
  iconSize: string;
  cardPadding: string;
  cardGap: string;
}

const ChecklistCard = React.memo<ChecklistCardProps>(
  ({
    id,
    label,
    isCompleted,
    onToggle,
    textSize,
    iconSize,
    cardPadding,
    cardGap,
  }) => {
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === ' ') e.preventDefault();
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        onToggle(id);
      }
    };
    return (
      <div role="listitem">
        <div
          role="checkbox"
          aria-checked={isCompleted}
          aria-label={label}
          tabIndex={0}
          onClick={() => onToggle(id)}
          onKeyDown={handleKeyDown}
          className={`w-full flex items-start cursor-pointer select-none rounded-2xl border shadow-sm transition-all active:scale-[0.98] ${
            isCompleted
              ? 'border-slate-200 bg-slate-100/80'
              : 'border-slate-200 bg-white'
          }`}
          style={{ gap: cardGap, padding: cardPadding }}
        >
          <div className="shrink-0 transition-transform active:scale-90">
            {isCompleted ? (
              <CheckCircle2
                className="text-green-500"
                style={{ width: iconSize, height: iconSize }}
              />
            ) : (
              <Circle
                className="text-indigo-300"
                style={{ width: iconSize, height: iconSize }}
              />
            )}
          </div>
          <span
            className={`font-bold leading-snug break-words min-w-0 flex-1 text-left transition-all ${
              isCompleted
                ? 'text-slate-400 line-through decoration-slate-300'
                : 'text-slate-700'
            }`}
            style={{ fontSize: textSize }}
          >
            {label}
          </span>
        </div>
      </div>
    );
  }
);
ChecklistCard.displayName = 'ChecklistCard';

export const ChecklistWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, rosters, activeRosterId, activeDashboard } =
    useDashboard();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const config = widget.config as ChecklistConfig;
  const {
    items = [],
    mode = 'manual',
    rosterMode = 'class',
    firstNames = '',
    lastNames = '',
    completedNames = [],
    scaleMultiplier = 1,
  } = config;

  const activeRoster = useMemo(
    () => rosters.find((r) => r.id === activeRosterId),
    [rosters, activeRosterId]
  );

  const students = useMemo((): { id: string; label: string }[] => {
    if (mode !== 'roster') return [];

    if (rosterMode === 'class' && activeRoster) {
      return activeRoster.students.map((s) => ({
        id: s.id,
        label: `${s.firstName} ${s.lastName}`.trim(),
      }));
    }

    const firsts = firstNames
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n);
    const lasts = lastNames
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n);
    const count = Math.max(firsts.length, lasts.length);
    const combined: { id: string; label: string }[] = [];
    for (let i = 0; i < count; i++) {
      const name = `${firsts[i] || ''} ${lasts[i] || ''}`.trim();
      if (name) combined.push({ id: name, label: name });
    }
    return combined;
  }, [firstNames, lastNames, mode, rosterMode, activeRoster]);

  const latestState = useRef({
    items,
    completedNames,
    config,
    widgetId: widget.id,
    mode,
  });

  useEffect(() => {
    latestState.current = {
      items,
      completedNames,
      config,
      widgetId: widget.id,
      mode,
    };
  }, [items, completedNames, config, widget.id, mode]);

  const toggleItem = useCallback(
    (idOrName: string) => {
      const { items, completedNames, config, widgetId, mode } =
        latestState.current;
      if (mode === 'manual') {
        const newItems = items.map((item) =>
          item.id === idOrName ? { ...item, completed: !item.completed } : item
        );
        updateWidget(widgetId, {
          config: { ...config, items: newItems } as ChecklistConfig,
        });
      } else {
        const isCompleted = completedNames.includes(idOrName);
        const nextCompleted = isCompleted
          ? completedNames.filter((n) => n !== idOrName)
          : [...completedNames, idOrName];
        updateWidget(widgetId, {
          config: {
            ...config,
            completedNames: nextCompleted,
          } as ChecklistConfig,
        });
      }
    },
    [updateWidget]
  );

  const resetToday = () => {
    if (mode === 'manual') {
      const reset = items.map((i) => ({ ...i, completed: false }));
      updateWidget(widget.id, { config: { ...config, items: reset } });
    } else {
      updateWidget(widget.id, { config: { ...config, completedNames: [] } });
    }
  };

  const removeCompleted = () => {
    if (mode === 'manual') {
      const remaining = items.filter((i) => !i.completed);
      updateWidget(widget.id, { config: { ...config, items: remaining } });
    }
  };

  const hasContent = mode === 'manual' ? items.length > 0 : students.length > 0;

  // Scaled sizing values derived from scaleMultiplier
  const sm = scaleMultiplier;
  const textSize = `min(${Math.round(18 * sm)}px, ${(5 * sm).toFixed(1)}cqmin)`;
  const iconSize = `min(${Math.round(28 * sm)}px, ${(7 * sm).toFixed(1)}cqmin)`;
  const cardPadding = `min(${Math.round(10 * sm)}px, ${(2.2 * sm).toFixed(1)}cqmin) min(${Math.round(14 * sm)}px, ${(3 * sm).toFixed(1)}cqmin)`;
  const cardGap = `min(${Math.round(10 * sm)}px, ${(2.2 * sm).toFixed(1)}cqmin)`;

  if (!hasContent) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={mode === 'manual' ? ListPlus : Users}
            title={mode === 'manual' ? 'No Tasks' : 'Roster Empty'}
            subtitle={
              mode === 'manual'
                ? 'Flip to add your class tasks.'
                : 'Flip to enter your student names.'
            }
          />
        }
      />
    );
  }

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={`h-full w-full relative overflow-hidden flex flex-col group font-${globalStyle.fontFamily}`}
        >
          <div
            role="list"
            className="flex-1 overflow-y-auto custom-scrollbar flex flex-col"
            style={{
              padding:
                'min(10px, 2.2cqmin) min(12px, 2.5cqmin) min(6px, 1.5cqmin)',
              gap: `min(${Math.round(8 * sm)}px, ${(1.8 * sm).toFixed(1)}cqmin)`,
            }}
          >
            {mode === 'manual'
              ? items.map((item) => (
                  <ChecklistCard
                    key={item.id}
                    id={item.id}
                    label={item.text}
                    isCompleted={item.completed}
                    onToggle={toggleItem}
                    textSize={textSize}
                    iconSize={iconSize}
                    cardPadding={cardPadding}
                    cardGap={cardGap}
                  />
                ))
              : students.map((student) => (
                  <ChecklistCard
                    key={student.id}
                    id={student.id}
                    label={student.label}
                    isCompleted={completedNames.includes(student.id)}
                    onToggle={toggleItem}
                    textSize={textSize}
                    iconSize={iconSize}
                    cardPadding={cardPadding}
                    cardGap={cardGap}
                  />
                ))}
          </div>
        </div>
      }
      footer={
        <div
          style={{
            padding: '0 min(12px, 2.5cqmin) min(10px, 2.2cqmin)',
            display: 'flex',
            gap: 'min(8px, 1.8cqmin)',
          }}
        >
          <button
            onClick={resetToday}
            className="flex-1 flex items-center justify-center bg-white border border-slate-200 shadow-sm rounded-xl font-black text-indigo-600 uppercase tracking-wider hover:bg-indigo-50 transition-all active:scale-95 shadow-indigo-500/5"
            style={{
              gap: 'min(6px, 1.5cqmin)',
              padding: 'min(8px, 2cqmin)',
              fontSize: 'min(11px, 3cqmin)',
            }}
          >
            <RefreshCw
              style={{
                width: 'min(13px, 3.2cqmin)',
                height: 'min(13px, 3.2cqmin)',
              }}
            />
            Reset Checks
          </button>
          {mode === 'manual' && (
            <button
              onClick={removeCompleted}
              className="flex-1 flex items-center justify-center bg-white border border-slate-200 shadow-sm rounded-xl font-black text-rose-500 uppercase tracking-wider hover:bg-rose-50 transition-all active:scale-95"
              style={{
                gap: 'min(6px, 1.5cqmin)',
                padding: 'min(8px, 2cqmin)',
                fontSize: 'min(11px, 3cqmin)',
              }}
            >
              <Trash2
                style={{
                  width: 'min(13px, 3.2cqmin)',
                  height: 'min(13px, 3.2cqmin)',
                }}
              />
              Remove Completed
            </button>
          )}
        </div>
      }
    />
  );
};

export const ChecklistSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, activeDashboard, addToast } = useDashboard();
  const config = widget.config as ChecklistConfig;
  const {
    items = [],
    mode = 'manual',
    rosterMode = 'class',
    firstNames = '',
    lastNames = '',
    scaleMultiplier = 1,
  } = config;

  const [localText, setLocalText] = React.useState(
    items.map((i) => i.text).join('\n')
  );

  const debouncedText = useDebounce(localText, 500);

  // Sync debounced text to widget config
  useEffect(() => {
    const currentText = items.map((i) => i.text).join('\n');
    if (debouncedText === currentText) return;

    const lines = debouncedText.split('\n');
    const newItems: ChecklistItem[] = lines
      .filter((line) => line.trim() !== '')
      .map((line, idx) => {
        const trimmedLine = line.trim();
        const existing = items.find((i) => i.text === trimmedLine);
        return {
          id: existing?.id ?? `item-${idx}-${Date.now()}`,
          text: trimmedLine,
          completed: existing?.completed ?? false,
        };
      });

    updateWidget(widget.id, { config: { ...config, items: newItems } });
  }, [debouncedText, widget.id, updateWidget, config, items]);

  const handleBulkChange = (text: string) => {
    setLocalText(text);
  };

  // Nexus Connection: Import from Instructional Routines
  const importFromRoutine = () => {
    const routineWidget = activeDashboard?.widgets.find(
      (w) => w.type === 'instructionalRoutines'
    );

    if (!routineWidget) {
      addToast('No Instructional Routines widget found!', 'error');
      return;
    }

    const routineConfig = routineWidget.config as InstructionalRoutinesConfig;
    const steps = routineConfig.customSteps;

    if (!steps || steps.length === 0) {
      addToast('Active routine has no steps to import.', 'info');
      return;
    }

    const newItems: ChecklistItem[] = steps.map((step) => ({
      id: crypto.randomUUID(),
      text: step.text,
      completed: false,
    }));

    updateWidget(widget.id, {
      config: {
        ...config,
        mode: 'manual',
        items: newItems,
      },
    });
    setLocalText(newItems.map((i) => i.text).join('\n'));
    addToast('Imported steps from Routine!', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Nexus Connection: Routine Import */}
      <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-2 text-indigo-900">
          <BookOpen className="w-4 h-4" />
          <span className="text-xs font-black uppercase tracking-wider">
            Import Routine
          </span>
        </div>
        <button
          onClick={importFromRoutine}
          className="bg-white text-indigo-600 px-3 py-1.5 rounded-lg text-xxs font-bold uppercase shadow-sm border border-indigo-100 hover:bg-indigo-50 transition-colors flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" /> Sync
        </button>
      </div>

      {/* Mode Toggle */}
      <div>
        <SettingsLabel>List Source</SettingsLabel>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() =>
              updateWidget(widget.id, { config: { ...config, mode: 'manual' } })
            }
            className={`flex-1 py-2 text-xxs  rounded-lg transition-all ${mode === 'manual' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
          >
            CUSTOM TASKS
          </button>
          <button
            onClick={() =>
              updateWidget(widget.id, { config: { ...config, mode: 'roster' } })
            }
            className={`flex-1 py-2 text-xxs  rounded-lg transition-all ${mode === 'roster' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
          >
            CLASS ROSTER
          </button>
        </div>
      </div>

      {mode === 'manual' && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          <SettingsLabel icon={ListPlus}>
            Task List (One per line)
          </SettingsLabel>
          <textarea
            value={localText}
            onChange={(e) => handleBulkChange(e.target.value)}
            placeholder="Enter tasks here..."
            className="w-full h-40 p-3 text-xs  bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
          />
        </div>
      )}

      {mode === 'roster' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <RosterModeControl
            rosterMode={rosterMode}
            onModeChange={(newMode: 'class' | 'custom') =>
              updateWidget(widget.id, {
                config: { ...config, rosterMode: newMode },
              })
            }
          />

          {rosterMode === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <SettingsLabel>First Names</SettingsLabel>
                <textarea
                  value={firstNames}
                  onChange={(e) =>
                    updateWidget(widget.id, {
                      config: { ...config, firstNames: e.target.value },
                    })
                  }
                  className="w-full h-40 p-3 text-xs border border-slate-200 rounded-xl outline-none"
                  placeholder="First names..."
                />
              </div>
              <div>
                <SettingsLabel>Last Names</SettingsLabel>
                <textarea
                  value={lastNames}
                  onChange={(e) =>
                    updateWidget(widget.id, {
                      config: { ...config, lastNames: e.target.value },
                    })
                  }
                  className="w-full h-40 p-3 text-xs border border-slate-200 rounded-xl outline-none"
                  placeholder="Last names..."
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <SettingsLabel icon={Type}>Text Scale</SettingsLabel>
        <div className="flex items-center gap-4 px-2">
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={scaleMultiplier}
            onChange={(e) =>
              updateWidget(widget.id, {
                config: {
                  ...config,
                  scaleMultiplier: parseFloat(e.target.value),
                },
              })
            }
            className="flex-1 accent-indigo-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
          />
          <span className="w-10 text-center font-mono  text-slate-700 text-xs">
            {scaleMultiplier}x
          </span>
        </div>
      </div>
    </div>
  );
};
