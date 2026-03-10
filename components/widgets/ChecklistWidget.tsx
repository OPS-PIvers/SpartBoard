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
  CheckSquare,
  Square,
  ListPlus,
  Type,
  Users,
  RefreshCw,
  BookOpen,
} from 'lucide-react';
import { ScaledEmptyState } from '../common/ScaledEmptyState';
import { SettingsLabel } from '../common/SettingsLabel';

// Available container height devoted to item rows (cqh units), after header/footer/padding.
const CHECKLIST_CONTENT_HEIGHT_CQH = 75;
// Fraction of each item's height slot used as the font size.
const CHECKLIST_FONT_HEIGHT_FRACTION = 0.5;
// Cap item count for font scaling: beyond this threshold items scroll rather
// than forcing the font to become unreadably small.
const CHECKLIST_MAX_ITEMS_FOR_FONT_SCALE = 15;

interface ChecklistRowProps {
  id: string;
  label: string;
  isCompleted: boolean;
  onToggle: (id: string) => void;
}

const ChecklistRow = React.memo<ChecklistRowProps>(
  ({ id, label, isCompleted, onToggle }) => {
    const handleKeyDown = (e: React.KeyboardEvent) => {
      // Prevent page scroll on Space; block key-repeat for both keys
      if (e.key === ' ') e.preventDefault();
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        onToggle(id);
      }
    };
    return (
      <li
        role="checkbox"
        aria-checked={isCompleted}
        tabIndex={0}
        onClick={() => onToggle(id)}
        onKeyDown={handleKeyDown}
        className="group/item flex items-start cursor-pointer select-none"
        style={{ gap: 'min(8px, 2cqmin)' }}
      >
        <div className="shrink-0 transition-transform active:scale-90 flex items-center justify-center h-[1.2em]">
          {isCompleted ? (
            <CheckSquare
              className="text-green-500 fill-green-50"
              style={{
                width: 'min(24px, 1.1em)',
                height: 'min(24px, 1.1em)',
              }}
            />
          ) : (
            <Square
              className="text-slate-300"
              style={{
                width: 'min(24px, 1.1em)',
                height: 'min(24px, 1.1em)',
              }}
            />
          )}
        </div>
        <span
          className={`font-medium leading-tight transition-all ${isCompleted ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-700'}`}
          style={{ fontSize: '1em' }}
        >
          {label}
        </span>
      </li>
    );
  }
);
ChecklistRow.displayName = 'ChecklistRow';

import { WidgetLayout } from './WidgetLayout';

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

  // Process Roster Names — always returns { id, label } objects.
  // In class mode, `id` is the student's UUID (keeps PII out of completedNames).
  // In custom mode, `id` and `label` are both the entered name string.
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

  // Use refs to keep callback stable so we don't break memoization of children
  // This allows toggleItem to be stable across renders even when state changes
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

  const hasContent = mode === 'manual' ? items.length > 0 : students.length > 0;

  // Compute item-count-aware font size.
  // cqw: font shrinks proportionally when the widget is narrow, preventing
  //   text from wrapping and forcing the user to resize wide.
  // cqh/itemCount: font shrinks to fit all items vertically; capped at
  //   CHECKLIST_MAX_ITEMS_FOR_FONT_SCALE so the font stays readable in long
  //   scrollable lists (items beyond the cap simply scroll into view).
  // Note: cqw/cqh are intentional here — cqmin tracks the smaller axis and
  //   stops responding to width changes once width exceeds height.
  const rawItemCount = mode === 'manual' ? items.length : students.length;
  const cappedItemCount = Math.min(
    Math.max(rawItemCount, 1),
    CHECKLIST_MAX_ITEMS_FOR_FONT_SCALE
  );
  const heightCoeff =
    Math.round(
      (CHECKLIST_CONTENT_HEIGHT_CQH / cappedItemCount) *
        CHECKLIST_FONT_HEIGHT_FRACTION *
        scaleMultiplier *
        10
    ) / 10;
  const dynamicFontSize = `min(${18 * scaleMultiplier}px, ${heightCoeff}cqh, ${6 * scaleMultiplier}cqw)`;

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
      header={
        <div
          className="w-full flex items-center justify-center border-b border-slate-100/30 cursor-move hover:bg-slate-900/5 transition-colors group/checklist-header"
          style={{ height: 'min(16px, 3.5cqmin)' }}
        >
          <div
            className="bg-slate-400/30 rounded-full group-hover/checklist-header:bg-slate-400/50 transition-colors"
            style={{
              width: 'min(32px, 8cqmin)',
              height: 'min(4px, 1cqmin)',
            }}
          />
        </div>
      }
      content={
        <div
          className={`h-full w-full relative overflow-hidden flex flex-col group font-${globalStyle.fontFamily}`}
          style={{ fontSize: dynamicFontSize }}
        >
          <div
            className="flex-1 overflow-y-auto custom-scrollbar"
            style={{
              padding: 'min(12px, 2.5cqmin) min(16px, 3.5cqmin)',
            }}
          >
            <ul style={{ gap: '0.4em' }} className="flex flex-col">
              {mode === 'manual'
                ? items.map((item) => (
                    <ChecklistRow
                      key={item.id}
                      id={item.id}
                      label={item.text}
                      isCompleted={item.completed}
                      onToggle={toggleItem}
                    />
                  ))
                : students.map((student) => (
                    <ChecklistRow
                      key={student.id}
                      id={student.id}
                      label={student.label}
                      isCompleted={completedNames.includes(student.id)}
                      onToggle={toggleItem}
                    />
                  ))}
            </ul>
          </div>
        </div>
      }
      footer={
        <div
          style={{
            padding: '0 min(16px, 3.5cqmin) min(12px, 2.5cqmin)',
          }}
        >
          <button
            onClick={resetToday}
            className="w-full flex items-center justify-center bg-white border border-slate-200 shadow-sm rounded-xl font-black text-indigo-600 uppercase tracking-wider hover:bg-indigo-50 transition-all active:scale-95 shadow-indigo-500/5"
            style={{
              gap: 'min(8px, 2cqmin)',
              padding: 'min(10px, 2.5cqmin)',
              fontSize: 'min(11px, 3cqmin)',
            }}
          >
            <RefreshCw
              style={{
                width: 'min(14px, 3.5cqmin)',
                height: 'min(14px, 3.5cqmin)',
              }}
            />{' '}
            Reset Checks
          </button>
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
