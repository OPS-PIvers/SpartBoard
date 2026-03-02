import React from 'react';
import {
  GradeLevel,
  MathToolType,
  MathToolsGlobalConfig,
  MathToolGradeLevels,
} from '@/types';
import { MATH_TOOL_META } from '@/components/widgets/math-tools/mathToolUtils';

const ALL_GRADE_LEVELS: GradeLevel[] = ['k-2', '3-5', '6-8', '9-12'];

const GRADE_LABELS: Record<GradeLevel, string> = {
  'k-2': 'K–2',
  '3-5': '3–5',
  '6-8': '6–8',
  '9-12': '9–12',
};

interface MathToolsConfigurationPanelProps {
  config: Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}

/**
 * Admin configuration panel for the mathTools widget.
 * Controls which grade levels each individual math tool is available to.
 */
export const MathToolsConfigurationPanel: React.FC<
  MathToolsConfigurationPanelProps
> = ({ config, onChange }) => {
  const mathConfig = (config as unknown as MathToolsGlobalConfig) ?? {};
  const toolGradeLevels: Partial<MathToolGradeLevels> =
    mathConfig.toolGradeLevels ?? {};

  const getToolGrades = (type: MathToolType): GradeLevel[] => {
    if (toolGradeLevels[type] !== undefined) {
      return toolGradeLevels[type] as GradeLevel[];
    }
    return (
      MATH_TOOL_META.find((m) => m.type === type)?.defaultGradeLevels ??
      ALL_GRADE_LEVELS
    );
  };

  const toggleGradeForTool = (toolType: MathToolType, grade: GradeLevel) => {
    const current = getToolGrades(toolType);
    const next = current.includes(grade)
      ? current.filter((g) => g !== grade)
      : [...current, grade].sort(
          (a, b) => ALL_GRADE_LEVELS.indexOf(a) - ALL_GRADE_LEVELS.indexOf(b)
        );

    const updatedLevels: Partial<MathToolGradeLevels> = {
      ...toolGradeLevels,
      [toolType]: next,
    };

    const newConfig: MathToolsGlobalConfig = {
      ...mathConfig,
      toolGradeLevels: updatedLevels,
    };
    onChange(newConfig as unknown as Record<string, unknown>);
  };

  const resetToDefault = (toolType: MathToolType) => {
    const updatedLevels = { ...toolGradeLevels };
    delete updatedLevels[toolType];
    const newConfig: MathToolsGlobalConfig = {
      ...mathConfig,
      toolGradeLevels:
        Object.keys(updatedLevels).length > 0 ? updatedLevels : undefined,
    };
    onChange(newConfig as unknown as Record<string, unknown>);
  };

  const dpiCalibration = mathConfig.dpiCalibration ?? 96;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 bg-purple-50 border border-purple-100 rounded-2xl">
        <h3 className="text-xs font-black text-purple-900 uppercase tracking-wider mb-1">
          Per-Tool Grade Level Control
        </h3>
        <p className="text-xxs text-purple-700 leading-relaxed">
          Configure which grade band each individual math manipulative is
          visible to in the Math Tools palette. Teachers will only see tools
          enabled for their selected grade level. Changes apply immediately
          after saving.
        </p>
      </div>

      {/* Global DPI */}
      <div className="space-y-2">
        <label className="text-xxs font-black text-slate-400 uppercase tracking-widest block">
          Building-Wide DPI Calibration (px / inch)
        </label>
        <p className="text-xxs text-slate-400">
          CSS 1 in = 96 px (default). Override for IFPs with non-standard pixel
          density. Teachers can still fine-tune per widget.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={60}
            max={300}
            value={dpiCalibration}
            onChange={(e) => {
              const newConfig: MathToolsGlobalConfig = {
                ...mathConfig,
                dpiCalibration: Math.max(
                  60,
                  Math.min(300, Number(e.target.value))
                ),
              };
              onChange(newConfig as unknown as Record<string, unknown>);
            }}
            className="w-24 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
          />
          <span className="text-xxs text-slate-400">px / inch</span>
          {dpiCalibration !== 96 && (
            <button
              onClick={() => {
                const newConfig: MathToolsGlobalConfig = {
                  ...mathConfig,
                  dpiCalibration: 96,
                };
                onChange(newConfig as unknown as Record<string, unknown>);
              }}
              className="text-xxs text-slate-500 underline hover:text-slate-700"
            >
              Reset to 96
            </button>
          )}
        </div>
      </div>

      {/* Per-tool grade level table */}
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-2 gap-y-1 items-center">
          {/* Header row */}
          <div className="text-xxs font-black text-slate-400 uppercase tracking-widest">
            Tool
          </div>
          {ALL_GRADE_LEVELS.map((g) => (
            <div
              key={g}
              className="text-xxs font-black text-slate-400 uppercase tracking-widest text-center"
            >
              {GRADE_LABELS[g]}
            </div>
          ))}
          <div className="text-xxs font-black text-slate-400 uppercase tracking-widest text-center">
            Reset
          </div>

          {/* Tool rows */}
          {MATH_TOOL_META.map((meta) => {
            const enabledGrades = getToolGrades(meta.type);
            const isCustomized = toolGradeLevels[meta.type] !== undefined;

            return (
              <React.Fragment key={meta.type}>
                {/* Tool name */}
                <div className="flex items-center gap-1.5 py-1.5 border-t border-slate-50">
                  <span className="text-base leading-none">{meta.emoji}</span>
                  <div className="flex flex-col">
                    <span
                      className={`text-xxs font-bold ${isCustomized ? 'text-purple-700' : 'text-slate-700'}`}
                    >
                      {meta.label}
                    </span>
                    {isCustomized && (
                      <span className="text-xxs text-purple-400">
                        customized
                      </span>
                    )}
                  </div>
                </div>

                {/* Grade toggle checkboxes */}
                {ALL_GRADE_LEVELS.map((grade) => (
                  <div
                    key={grade}
                    className="flex items-center justify-center border-t border-slate-50 py-1.5"
                  >
                    <button
                      onClick={() => toggleGradeForTool(meta.type, grade)}
                      className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                        enabledGrades.includes(grade)
                          ? 'bg-purple-600 border-purple-600 text-white'
                          : 'bg-white border-slate-200 hover:border-purple-300'
                      }`}
                      title={`Toggle ${GRADE_LABELS[grade]} for ${meta.label}`}
                      aria-label={`${meta.label} ${GRADE_LABELS[grade]} ${enabledGrades.includes(grade) ? 'enabled' : 'disabled'}`}
                      aria-pressed={enabledGrades.includes(grade)}
                    >
                      {enabledGrades.includes(grade) && (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                        >
                          <path
                            d="M1.5 5L4 7.5L8.5 2.5"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                ))}

                {/* Reset to default button */}
                <div className="flex items-center justify-center border-t border-slate-50 py-1.5">
                  {isCustomized ? (
                    <button
                      onClick={() => resetToDefault(meta.type)}
                      className="text-xxs text-slate-400 hover:text-purple-600 underline transition-colors"
                      title="Reset to default grade levels"
                    >
                      Reset
                    </button>
                  ) : (
                    <span className="text-xxs text-slate-200">–</span>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 flex-wrap pt-2 border-t border-slate-100">
          <button
            onClick={() => {
              const all: Partial<MathToolGradeLevels> = {};
              for (const meta of MATH_TOOL_META) {
                all[meta.type] = [...ALL_GRADE_LEVELS];
              }
              onChange({
                ...mathConfig,
                toolGradeLevels: all,
              } as unknown as Record<string, unknown>);
            }}
            className="text-xxs bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-lg font-black uppercase tracking-wider transition-colors"
          >
            Enable All for All Grades
          </button>
          <button
            onClick={() => {
              onChange({
                ...mathConfig,
                toolGradeLevels: undefined,
              } as unknown as Record<string, unknown>);
            }}
            className="text-xxs bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-lg font-black uppercase tracking-wider transition-colors"
          >
            Reset All to Defaults
          </button>
        </div>
      </div>
    </div>
  );
};
