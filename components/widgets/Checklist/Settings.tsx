import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import {
  ChecklistConfig,
  ChecklistItem,
  WidgetData,
  InstructionalRoutinesConfig,
  TextConfig,
} from '@/types';
import { RosterModeControl } from '@/components/common/RosterModeControl';
import { ListPlus, Type, RefreshCw, BookOpen } from 'lucide-react';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { TypographySettings } from '@/components/common/TypographySettings';
import { SurfaceColorSettings } from '@/components/common/SurfaceColorSettings';
import { TextSizePresetSettings } from '@/components/common/TextSizePresetSettings';

export const ChecklistSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, activeDashboard, addToast } = useDashboard();
  const config = widget.config as ChecklistConfig;
  // Extract fields, but DO NOT default items to [] here, or we break reference
  // equality checks in the derived state pattern below, causing infinite renders.
  const {
    items,
    mode = 'manual',
    rosterMode = 'class',
    firstNames = '',
    lastNames = '',
  } = config;
  const safeItems = React.useMemo(() => items ?? [], [items]);

  const [localText, setLocalText] = React.useState(
    safeItems.map((i) => i.text).join('\n')
  );
  const [prevItems, setPrevItems] = React.useState(items);

  // Sync external prop changes to local text
  if (items !== prevItems) {
    setPrevItems(items);
    setLocalText(safeItems.map((i) => i.text).join('\n'));
  }

  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Clean up timeout on unmount
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const configRef = React.useRef(config);
  React.useEffect(() => {
    configRef.current = config;
  }, [config]);

  const updateWidgetRef = React.useRef(updateWidget);
  React.useEffect(() => {
    updateWidgetRef.current = updateWidget;
  }, [updateWidget]);

  const itemsRef = React.useRef(safeItems);
  React.useEffect(() => {
    itemsRef.current = safeItems;
  }, [safeItems]);

  const handleBulkChange = (text: string) => {
    setLocalText(text);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const currentText = itemsRef.current.map((i) => i.text).join('\n');
      if (text === currentText) return;

      const existingItemsMap = new Map(
        itemsRef.current.map((i) => [i.text, i])
      );

      const lines = text.split('\n');
      const newItems: ChecklistItem[] = lines
        .filter((line) => line.trim() !== '')
        .map((line) => {
          const trimmedLine = line.trim();
          const existing = existingItemsMap.get(trimmedLine);
          return {
            id: existing?.id ?? crypto.randomUUID(),
            text: trimmedLine,
            completed: existing?.completed ?? false,
          };
        });

      updateWidgetRef.current(widget.id, {
        config: { ...configRef.current, items: newItems },
      });
    }, 500);
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

  const importFromTextWidget = () => {
    const textWidgets =
      activeDashboard?.widgets.filter((w) => w.type === 'text') ?? [];
    if (textWidgets.length === 0) {
      addToast('No Text widget found!', 'error');
      return;
    }

    let selectedLines: string[] | null = null;
    for (const textWidget of textWidgets) {
      const textConfig = textWidget.config as TextConfig;
      const rawContent = textConfig.content || '';

      // Parse HTML and extract text in a way that preserves visual line breaks
      const parsedDocument = new DOMParser().parseFromString(
        rawContent,
        'text/html'
      );
      const body = parsedDocument.body;
      const plainText = (body.innerText ?? body.textContent ?? '').replace(
        /\r\n/g,
        '\n'
      );

      // Split by newline (handling both \n and \r\n) and filter empty lines
      const lines = plainText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (lines.length > 0) {
        selectedLines = lines;
        break;
      }
    }

    if (!selectedLines) {
      addToast('All Text widgets are empty or have no usable text.', 'info');
      return;
    }

    const newItems: ChecklistItem[] = selectedLines.map((line) => ({
      id: crypto.randomUUID(),
      text: line,
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
    addToast('Imported tasks from Text widget!', 'success');
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
          aria-label="Sync Routine"
          className="bg-white text-indigo-600 px-3 py-1.5 rounded-lg text-xxs font-bold uppercase shadow-sm border border-indigo-100 hover:bg-indigo-50 transition-colors flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" /> Sync
        </button>
      </div>

      {/* Nexus Connection: Text Import */}
      <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-2 text-emerald-900">
          <Type className="w-4 h-4" />
          <span className="text-xs font-black uppercase tracking-wider">
            Import from Text Widget
          </span>
        </div>
        <button
          onClick={importFromTextWidget}
          aria-label="Sync Text"
          className="bg-white text-emerald-600 px-3 py-1.5 rounded-lg text-xxs font-bold uppercase shadow-sm border border-emerald-100 hover:bg-emerald-50 transition-colors flex items-center gap-1"
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

  return (
    <div className="space-y-6">
      <TextSizePresetSettings
        config={config}
        writeScaleMultiplier
        updateConfig={(updates) =>
          updateWidget(widget.id, {
            config: { ...config, ...updates } as ChecklistConfig,
          })
        }
      />
      <TypographySettings
        config={config}
        updateConfig={(updates) =>
          updateWidget(widget.id, {
            config: { ...config, ...updates } as ChecklistConfig,
          })
        }
      />
      <SurfaceColorSettings
        config={config}
        updateConfig={(updates) =>
          updateWidget(widget.id, {
            config: { ...config, ...updates } as ChecklistConfig,
          })
        }
      />
    </div>
  );
};
