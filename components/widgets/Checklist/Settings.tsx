import React, { useEffect } from 'react';
import { useDashboard } from '@/context/useDashboard';
import {
  ChecklistConfig,
  ChecklistItem,
  WidgetData,
  InstructionalRoutinesConfig,
} from '@/types';
import { useDebounce } from '@/hooks/useDebounce';
import { RosterModeControl } from '@/components/common/RosterModeControl';
import { ListPlus, Type, RefreshCw, BookOpen, Palette } from 'lucide-react';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { FONTS, PALETTE, FONT_COLORS } from './constants';

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
      .map((line) => {
        const trimmedLine = line.trim();
        const existing = items.find((i) => i.text === trimmedLine);
        return {
          id: existing?.id ?? crypto.randomUUID(),
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
    </div>
  );
};

export const ChecklistAppearanceSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as ChecklistConfig;
  const {
    scaleMultiplier = 1,
    fontFamily = 'global',
    cardColor = '#ffffff',
    cardOpacity = 1,
    fontColor = '#334155',
  } = config;

  return (
    <div className="space-y-6">
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
          <span className="w-10 text-center font-mono text-slate-700 text-xs">
            {scaleMultiplier}x
          </span>
        </div>
      </div>

      {/* Typography */}
      <div>
        <SettingsLabel icon={Type}>Typography</SettingsLabel>
        <div className="grid grid-cols-4 gap-2">
          {FONTS.map((f) => (
            <button
              key={f.id}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, fontFamily: f.id } as ChecklistConfig,
                })
              }
              className={`p-2 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${
                fontFamily === f.id || (!fontFamily && f.id === 'global')
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-slate-100 hover:border-slate-200'
              }`}
            >
              <span className={`text-sm ${f.id} text-slate-900`}>{f.icon}</span>
              <span className="text-xxxs uppercase text-slate-600 font-bold">
                {f.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Font Color */}
      <div>
        <SettingsLabel icon={Palette}>Font Color</SettingsLabel>
        <div className="flex flex-wrap gap-2 px-1">
          {FONT_COLORS.map((color) => (
            <button
              key={color}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, fontColor: color } as ChecklistConfig,
                })
              }
              className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 ${
                fontColor === color
                  ? 'border-slate-800 scale-110 shadow-sm'
                  : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </div>

      {/* Card Style */}
      <div>
        <SettingsLabel icon={Palette}>Card Style</SettingsLabel>
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-4">
          {/* Card Color */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">
                Card Color
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {cardColor}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((color) => (
                <button
                  key={color}
                  onClick={() =>
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        cardColor: color,
                      } as ChecklistConfig,
                    })
                  }
                  className={`w-6 h-6 rounded-md border transition-all hover:scale-110 ${
                    cardColor === color
                      ? 'border-indigo-500 ring-2 ring-indigo-200'
                      : 'border-slate-200'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Card Opacity */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">
                Opacity
              </span>
              <span className="text-xs text-slate-500 tabular-nums font-bold">
                {Math.round(cardOpacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={cardOpacity}
              onChange={(e) =>
                updateWidget(widget.id, {
                  config: {
                    ...config,
                    cardOpacity: parseFloat(e.target.value),
                  } as ChecklistConfig,
                })
              }
              className="w-full accent-indigo-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
