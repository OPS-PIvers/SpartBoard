import React from 'react';
import { useDashboard } from '../../../context/useDashboard';
import { useAuth } from '../../../context/useAuth';
import {
  WidgetData,
  InstructionalRoutinesConfig,
  RoutineStep,
} from '../../../types';
import { ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react';
import { IconPicker } from './IconPicker';
import { QUICK_TOOLS } from './constants';
import { SettingsLabel } from '../../common/SettingsLabel';

export const InstructionalRoutinesSettings: React.FC<{
  widget: WidgetData;
}> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const { isAdmin } = useAuth();
  const config = widget.config as InstructionalRoutinesConfig;
  const { customSteps = [], scaleMultiplier = 1 } = config;

  const moveStep = (idx: number, dir: 'up' | 'down') => {
    const next = [...customSteps];
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    updateWidget(widget.id, { config: { ...config, customSteps: next } });
  };

  return (
    <div className="space-y-6">
      {/* Switch Routine Fix: Resets selection and flips back to grid */}
      <button
        onClick={() =>
          updateWidget(widget.id, {
            flipped: false,
            config: { ...config, selectedRoutineId: null },
          })
        }
        className="w-full py-2.5 bg-brand-blue-lighter text-brand-blue-primary rounded-xl text-xxs uppercase tracking-widest hover:bg-brand-blue-light/20 transition-colors"
      >
        Switch Routine Template
      </button>

      <div className="space-y-3">
        <SettingsLabel>Step Editor</SettingsLabel>
        {customSteps.map((step, i) => (
          <div
            key={step.id}
            className="flex gap-2 items-center bg-white p-3 rounded-2xl border border-slate-100 group shadow-sm"
          >
            <div className="flex flex-col gap-1 shrink-0">
              <button
                onClick={() => moveStep(i, 'up')}
                className="text-slate-300 hover:text-brand-blue-primary"
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={() => moveStep(i, 'down')}
                className="text-slate-300 hover:text-brand-blue-primary"
              >
                <ChevronDown size={14} />
              </button>
            </div>
            {/* Stable Key Fix: Using step.id prevents focus loss */}
            <div className="flex-1 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <IconPicker
                    currentIcon={step.icon ?? 'Zap'}
                    color={step.color}
                    onSelect={(icon) => {
                      const next = [...customSteps];
                      next[i] = { ...next[i], icon };
                      updateWidget(widget.id, {
                        config: { ...config, customSteps: next },
                      });
                    }}
                  />
                  <span className="text-xxxs font-bold text-slate-400 uppercase">
                    Step {i + 1}
                  </span>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                    <div className="flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                      <span className="text-xxxs font-black uppercase text-slate-400">
                        Label:
                      </span>
                      <input
                        type="text"
                        value={step.label ?? ''}
                        onChange={(e) => {
                          const next = [...customSteps];
                          next[i] = { ...next[i], label: e.target.value };
                          updateWidget(widget.id, {
                            config: { ...config, customSteps: next },
                          });
                        }}
                        placeholder="Keyword"
                        className="w-16 bg-transparent border-none p-0 text-xxs font-bold text-emerald-600 focus:ring-0"
                      />
                    </div>
                  </div>
                )}
              </div>
              <textarea
                value={step.text}
                onChange={(e) => {
                  const next = [...customSteps];
                  next[i] = { ...next[i], text: e.target.value };
                  updateWidget(widget.id, {
                    config: { ...config, customSteps: next },
                  });
                }}
                rows={2}
                placeholder="Enter student direction..."
                className="w-full text-xxs bg-transparent border-none focus:ring-0 p-0 leading-tight resize-none text-slate-800"
              />
              <div className="flex items-center gap-2">
                <span className="text-xxxs font-bold text-slate-400 uppercase">
                  Attached Tool:
                </span>
                <select
                  value={
                    // Robust lookup: match existing config type/label, OR fallback to attached label
                    step.attachedWidget
                      ? (QUICK_TOOLS.find(
                          (t) =>
                            t.type === step.attachedWidget?.type &&
                            t.label === step.attachedWidget.label
                        )?.label ?? step.attachedWidget.label)
                      : 'None'
                  }
                  onChange={(e) => {
                    const selectedTool = QUICK_TOOLS.find(
                      (t) => t.label === e.target.value
                    );
                    const next = [...customSteps];
                    if (
                      selectedTool &&
                      selectedTool.type !== 'none' &&
                      selectedTool.config
                    ) {
                      next[i] = {
                        ...next[i],
                        attachedWidget: {
                          type: selectedTool.type,
                          label: selectedTool.label,
                          config: selectedTool.config,
                        },
                      };
                    } else {
                      // Remove attached widget
                      const { attachedWidget: _unused, ...rest } = next[i];
                      next[i] = rest as RoutineStep;
                    }
                    updateWidget(widget.id, {
                      config: { ...config, customSteps: next },
                    });
                  }}
                  className="text-xxs bg-slate-50 border border-slate-200 rounded p-1"
                >
                  {QUICK_TOOLS.map((t) => (
                    <option key={t.label} value={t.label}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={() =>
                updateWidget(widget.id, {
                  config: {
                    ...config,
                    customSteps: customSteps.filter((_, idx) => idx !== i),
                  },
                })
              }
              className="p-2 text-red-400 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            updateWidget(widget.id, {
              config: {
                ...config,
                customSteps: [
                  ...customSteps,
                  { id: crypto.randomUUID(), text: '' },
                ],
              },
            })
          }
          className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:border-brand-blue-primary hover:text-brand-blue-primary transition-all flex items-center justify-center gap-2 text-xxs uppercase"
        >
          <Plus className="w-4 h-4" /> Add Next Step
        </button>
      </div>

      <div className="bg-slate-50 p-4 rounded-2xl">
        <SettingsLabel>Text Zoom</SettingsLabel>
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
          className="w-full accent-brand-blue-primary"
        />
      </div>
    </div>
  );
};
