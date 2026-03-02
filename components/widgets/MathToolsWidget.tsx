import React, { useMemo } from 'react';
import {
  WidgetData,
  MathToolsConfig,
  MathToolType,
  GradeLevel,
  MathToolsGlobalConfig,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import {
  MATH_TOOL_META,
  getMathToolMeta,
  CSS_PPI,
} from './math-tools/mathToolUtils';

// Grade level badge colors
const GRADE_COLORS: Record<GradeLevel, string> = {
  'k-2': 'bg-green-100 text-green-700',
  '3-5': 'bg-blue-100 text-blue-700',
  '6-8': 'bg-purple-100 text-purple-700',
  '9-12': 'bg-rose-100 text-rose-700',
};

const GRADE_LABELS: Record<GradeLevel, string> = {
  'k-2': 'K-2',
  '3-5': '3-5',
  '6-8': '6-8',
  '9-12': '9-12',
};

export const MathToolsWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { addWidget } = useDashboard();
  const { featurePermissions } = useAuth();
  const config = widget.config as MathToolsConfig;
  const ppi = config.dpiCalibration ?? CSS_PPI;

  // Read per-tool grade levels from admin global config
  const globalConfig = useMemo(() => {
    const perm = featurePermissions.find((p) => p.widgetType === 'mathTools');
    return (perm?.config ?? {}) as MathToolsGlobalConfig;
  }, [featurePermissions]);

  const [gradeFilter, setGradeFilter] = React.useState<GradeLevel | 'all'>(
    'all'
  );

  const tools = useMemo(() => {
    return MATH_TOOL_META.map((meta) => {
      const adminGrades =
        globalConfig.toolGradeLevels?.[meta.type] ?? meta.defaultGradeLevels;
      return { ...meta, gradeLevels: adminGrades };
    });
  }, [globalConfig]);

  const filteredTools = useMemo(() => {
    if (gradeFilter === 'all') return tools;
    return tools.filter((t) => t.gradeLevels.includes(gradeFilter));
  }, [tools, gradeFilter]);

  const handleSpawn = (toolType: MathToolType) => {
    const meta = getMathToolMeta(toolType);
    addWidget('mathTool', {
      w: meta.defaultW,
      h: meta.defaultH,
      config: {
        toolType,
        pixelsPerInch: ppi,
        // Set sensible defaults per tool
        ...(toolType === 'ruler-in' && { rulerUnits: 'in' }),
        ...(toolType === 'ruler-cm' && { rulerUnits: 'cm' }),
        ...(toolType === 'number-line' && {
          numberLineMode: 'integers',
          numberLineMin: -10,
          numberLineMax: 10,
        }),
      },
    });
  };

  const allGrades: GradeLevel[] = ['k-2', '3-5', '6-8', '9-12'];

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-purple-50 to-indigo-50 shrink-0"
        style={{ padding: 'min(8px, 1.5cqmin) min(12px, 2.5cqmin)' }}
      >
        <span style={{ fontSize: 'min(18px, 6cqmin)' }}>🧮</span>
        <span
          className="font-black uppercase tracking-widest text-purple-700"
          style={{ fontSize: 'min(11px, 4cqmin)' }}
        >
          Math Tools
        </span>
        <span
          className="ml-auto text-slate-400 font-mono"
          style={{ fontSize: 'min(9px, 3.5cqmin)' }}
        >
          Click to spawn
        </span>
      </div>

      {/* Grade filter */}
      <div
        className="flex items-center gap-1 border-b border-slate-100 bg-white/60 shrink-0 overflow-x-auto"
        style={{ padding: 'min(6px, 1.2cqmin) min(10px, 2cqmin)' }}
      >
        <button
          onClick={() => setGradeFilter('all')}
          className={`px-2 py-0.5 rounded-full font-black border transition-all shrink-0 ${
            gradeFilter === 'all'
              ? 'bg-slate-700 text-white border-slate-700'
              : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
          }`}
          style={{ fontSize: 'min(10px, 3.5cqmin)' }}
        >
          All
        </button>
        {allGrades.map((g) => (
          <button
            key={g}
            onClick={() => setGradeFilter(g)}
            className={`px-2 py-0.5 rounded-full font-black border transition-all shrink-0 ${
              gradeFilter === g
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
            }`}
            style={{ fontSize: 'min(10px, 3.5cqmin)' }}
          >
            {GRADE_LABELS[g]}
          </button>
        ))}
      </div>

      {/* Tool grid */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: 'min(8px, 1.5cqmin)' }}
      >
        <div
          className="grid grid-cols-2 @[300px]:grid-cols-3"
          style={{ gap: 'min(8px, 1.5cqmin)' }}
        >
          {filteredTools.map((tool) => (
            <button
              key={tool.type}
              onClick={() => handleSpawn(tool.type)}
              className="flex flex-col items-center bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-purple-200 hover:shadow-md hover:-translate-y-0.5 transition-all group active:scale-95"
              style={{ padding: 'min(10px, 2cqmin)' }}
              title={tool.description}
            >
              {/* Emoji icon */}
              <span
                className="group-hover:scale-110 transition-transform duration-200 leading-none"
                style={{ fontSize: 'min(28px, 9cqmin)' }}
              >
                {tool.emoji}
              </span>
              {/* Label */}
              <span
                className="font-black text-slate-700 text-center leading-tight mt-1"
                style={{ fontSize: 'min(10px, 3.5cqmin)' }}
              >
                {tool.label}
              </span>
              {/* Grade badges */}
              <div
                className="flex flex-wrap justify-center"
                style={{
                  gap: 'min(3px, 0.8cqmin)',
                  marginTop: 'min(4px, 1cqmin)',
                }}
              >
                {tool.gradeLevels.slice(0, 3).map((g) => (
                  <span
                    key={g}
                    className={`rounded-full font-black ${GRADE_COLORS[g]}`}
                    style={{
                      fontSize: 'min(8px, 2.8cqmin)',
                      padding: 'min(1px, 0.3cqmin) min(5px, 1.2cqmin)',
                    }}
                  >
                    {GRADE_LABELS[g]}
                  </span>
                ))}
              </div>
            </button>
          ))}

          {filteredTools.length === 0 && (
            <div
              className="col-span-full flex flex-col items-center justify-center text-slate-400"
              style={{
                padding: 'min(24px, 5cqmin)',
                gap: 'min(8px, 1.5cqmin)',
              }}
            >
              <span style={{ fontSize: 'min(32px, 10cqmin)' }}>🔍</span>
              <span
                className="font-bold text-center"
                style={{ fontSize: 'min(11px, 4cqmin)' }}
              >
                No tools for {GRADE_LABELS[gradeFilter as GradeLevel]} grade
                level
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        className="bg-slate-50/50 border-t border-slate-100 flex items-center justify-between font-black text-slate-300 uppercase tracking-widest shrink-0"
        style={{
          padding: 'min(6px, 1.2cqmin) min(12px, 2.5cqmin)',
          fontSize: 'min(9px, 3.2cqmin)',
        }}
      >
        <span>{filteredTools.length} tools</span>
        <span>{ppi} px/in</span>
      </div>
    </div>
  );
};

export const MathToolsSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as MathToolsConfig;
  const [ppiInput, setPpiInput] = React.useState(
    String(config.dpiCalibration ?? CSS_PPI)
  );

  return (
    <div className="space-y-5 p-1">
      <div className="space-y-2 p-3 bg-purple-50 rounded-xl border border-purple-100">
        <h3 className="text-xxs font-black text-purple-700 uppercase tracking-widest">
          Math Tools Palette
        </h3>
        <p className="text-xxs text-purple-600 leading-relaxed">
          Click any tool in the palette to spawn it as a standalone widget on
          your dashboard. Tools marked with grade badges respect the
          admin-configured grade-level filters.
        </p>
      </div>

      <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
        <label className="text-xxs font-black text-slate-400 uppercase tracking-widest block">
          Palette DPI Calibration (px / inch)
        </label>
        <p className="text-xxs text-slate-400 leading-relaxed">
          Spawned true-scale tools will use this PPI as their default. CSS
          defines 1 in = 96 px — override only if your IFP screen renders
          differently.
        </p>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            min={60}
            max={300}
            value={ppiInput}
            onChange={(e) => setPpiInput(e.target.value)}
            className="w-20 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
          />
          <button
            onClick={() => {
              const ppi = Math.max(60, Math.min(300, Number(ppiInput)));
              updateWidget(widget.id, {
                config: { ...config, dpiCalibration: ppi },
              });
            }}
            className="px-3 py-1.5 text-xxs font-black bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Apply
          </button>
          <button
            onClick={() => {
              setPpiInput(String(CSS_PPI));
              updateWidget(widget.id, {
                config: { ...config, dpiCalibration: CSS_PPI },
              });
            }}
            className="px-2 py-1.5 text-xxs font-black bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
        <p className="text-xxs text-slate-400 leading-relaxed">
          <span className="font-black text-slate-600">Grade level filters</span>{' '}
          are configured per tool in Admin Settings → Feature Permissions → Math
          Tools.
        </p>
      </div>
    </div>
  );
};
