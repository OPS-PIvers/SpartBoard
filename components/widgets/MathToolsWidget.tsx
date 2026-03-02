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
  TOOL_SUB_ITEMS,
  ToolSubItem,
} from './math-tools/mathToolUtils';

// Grade level badge colours
const GRADE_COLORS: Record<GradeLevel, string> = {
  'k-2': 'bg-green-100 text-green-700',
  '3-5': 'bg-blue-100 text-blue-700',
  '6-8': 'bg-purple-100 text-purple-700',
  '9-12': 'bg-rose-100 text-rose-700',
};

const GRADE_LABELS: Record<GradeLevel, string> = {
  'k-2': 'K–2',
  '3-5': '3–5',
  '6-8': '6–8',
  '9-12': '9–12',
};

// ---------------------------------------------------------------------------
// Palette section definitions
// ---------------------------------------------------------------------------

type SectionMode = 'sticker-whole' | 'sticker-pieces' | 'interactive';

interface PaletteSection {
  id: string;
  title: string;
  subtitle: string;
  toolTypes: MathToolType[];
  mode: SectionMode;
}

const PALETTE_SECTIONS: PaletteSection[] = [
  {
    id: 'measurement',
    title: 'Measurement',
    subtitle: 'True-scale stickers',
    toolTypes: ['ruler-in', 'ruler-cm', 'protractor'],
    mode: 'sticker-whole',
  },
  {
    id: 'manipulatives',
    title: 'Manipulatives',
    subtitle: 'Drag individual pieces onto your board',
    toolTypes: ['base-10', 'fraction-tiles', 'pattern-blocks', 'algebra-tiles'],
    mode: 'sticker-pieces',
  },
  {
    id: 'interactive',
    title: 'Interactive',
    subtitle: 'Full-featured tool windows',
    toolTypes: ['number-line', 'geoboard', 'coordinate-plane', 'calculator'],
    mode: 'interactive',
  },
];

// ---------------------------------------------------------------------------
// MathToolsWidget
// ---------------------------------------------------------------------------

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

  // Enrich MATH_TOOL_META with resolved grade levels
  const toolMap = useMemo(() => {
    const map = new Map<
      MathToolType,
      (typeof MATH_TOOL_META)[number] & { gradeLevels: GradeLevel[] }
    >();
    for (const meta of MATH_TOOL_META) {
      const adminGrades =
        globalConfig.toolGradeLevels?.[meta.type] ?? meta.defaultGradeLevels;
      map.set(meta.type, { ...meta, gradeLevels: adminGrades });
    }
    return map;
  }, [globalConfig]);

  // Returns the enriched metadata for a tool, filtered by current grade selection
  const getVisibleTools = (toolTypes: MathToolType[]) =>
    toolTypes
      .map((t) => toolMap.get(t))
      .filter(
        (t): t is NonNullable<typeof t> =>
          !!t && (gradeFilter === 'all' || t.gradeLevels.includes(gradeFilter))
      );

  // ---- Spawn handlers ----

  /** Spawn a whole-tool sticker (ruler, protractor) */
  const handleSpawnSticker = (toolType: MathToolType) => {
    const meta = getMathToolMeta(toolType);
    addWidget('mathTool', {
      w: meta.defaultW,
      h: meta.defaultH,
      config: {
        toolType,
        pixelsPerInch: ppi,
        stickerMode: true,
        ...(toolType === 'ruler-in' && { rulerUnits: 'in' }),
        ...(toolType === 'ruler-cm' && { rulerUnits: 'cm' }),
      },
    });
  };

  /** Spawn an individual manipulative piece as a sticker */
  const handleSpawnPiece = (toolType: MathToolType, subItem: ToolSubItem) => {
    addWidget('mathTool', {
      w: subItem.spawnW,
      h: subItem.spawnH,
      config: {
        toolType,
        pixelsPerInch: ppi,
        stickerMode: true,
        stickerPiece: subItem.id,
      },
    });
  };

  /** Spawn a full interactive tool window */
  const handleSpawnInteractive = (toolType: MathToolType) => {
    const meta = getMathToolMeta(toolType);
    addWidget('mathTool', {
      w: meta.defaultW,
      h: meta.defaultH,
      config: {
        toolType,
        pixelsPerInch: ppi,
        ...(toolType === 'number-line' && {
          numberLineMode: 'integers',
          numberLineMin: -10,
          numberLineMax: 10,
        }),
      },
    });
  };

  const allGrades: GradeLevel[] = ['k-2', '3-5', '6-8', '9-12'];
  const totalVisible = PALETTE_SECTIONS.reduce(
    (acc, s) => acc + getVisibleTools(s.toolTypes).length,
    0
  );

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* ---- Header ---- */}
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
          click to place
        </span>
      </div>

      {/* ---- Grade filter ---- */}
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

      {/* ---- Sections ---- */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: 'min(8px, 1.5cqmin)' }}
      >
        {totalVisible === 0 && (
          <div
            className="flex flex-col items-center justify-center text-slate-400 h-full"
            style={{ gap: 'min(8px, 1.5cqmin)' }}
          >
            <span style={{ fontSize: 'min(32px, 10cqmin)' }}>🔍</span>
            <span
              className="font-bold text-center"
              style={{ fontSize: 'min(11px, 4cqmin)' }}
            >
              No tools for{' '}
              {gradeFilter !== 'all' ? GRADE_LABELS[gradeFilter] : ''} grade
              level
            </span>
          </div>
        )}

        {PALETTE_SECTIONS.map((section) => {
          const visibleTools = getVisibleTools(section.toolTypes);
          if (visibleTools.length === 0) return null;

          return (
            <div key={section.id} style={{ marginBottom: 'min(14px, 3cqmin)' }}>
              {/* Section header */}
              <div
                className="flex items-baseline gap-2"
                style={{ marginBottom: 'min(6px, 1.2cqmin)' }}
              >
                <span
                  className="font-black text-slate-700 uppercase tracking-wider"
                  style={{ fontSize: 'min(10px, 3.8cqmin)' }}
                >
                  {section.title}
                </span>
                <span
                  className="text-slate-400 font-medium"
                  style={{ fontSize: 'min(9px, 3.2cqmin)' }}
                >
                  {section.subtitle}
                </span>
              </div>

              {/* ---- Sticker-whole section ---- */}
              {section.mode === 'sticker-whole' && (
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 'min(6px, 1.2cqmin)',
                  }}
                >
                  {visibleTools.map((tool) => (
                    <button
                      key={tool.type}
                      onClick={() => handleSpawnSticker(tool.type)}
                      className="flex flex-col items-center bg-white border border-slate-100 rounded-xl shadow-sm hover:border-purple-200 hover:shadow-md hover:-translate-y-0.5 transition-all group active:scale-95"
                      style={{ padding: 'min(8px, 1.8cqmin)' }}
                      title={tool.description}
                    >
                      <span
                        className="group-hover:scale-110 transition-transform duration-200 leading-none"
                        style={{ fontSize: 'min(24px, 8cqmin)' }}
                      >
                        {tool.emoji}
                      </span>
                      <span
                        className="font-black text-slate-700 text-center leading-tight mt-1"
                        style={{ fontSize: 'min(9px, 3.5cqmin)' }}
                      >
                        {tool.label}
                      </span>
                      <div
                        className="flex flex-wrap justify-center"
                        style={{
                          gap: 'min(3px, 0.8cqmin)',
                          marginTop: 'min(3px, 0.8cqmin)',
                        }}
                      >
                        {tool.gradeLevels.slice(0, 3).map((g) => (
                          <span
                            key={g}
                            className={`rounded-full font-black ${GRADE_COLORS[g]}`}
                            style={{
                              fontSize: 'min(7px, 2.6cqmin)',
                              padding: 'min(1px, 0.3cqmin) min(4px, 1cqmin)',
                            }}
                          >
                            {GRADE_LABELS[g]}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* ---- Sticker-pieces section ---- */}
              {section.mode === 'sticker-pieces' && (
                <div
                  className="flex flex-col"
                  style={{ gap: 'min(8px, 1.5cqmin)' }}
                >
                  {visibleTools.map((tool) => {
                    const subItems = TOOL_SUB_ITEMS[tool.type] ?? [];
                    return (
                      <div
                        key={tool.type}
                        className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm"
                      >
                        {/* Tool row header */}
                        <div
                          className="flex items-center gap-1.5 bg-slate-50 border-b border-slate-100"
                          style={{
                            padding: 'min(5px, 1cqmin) min(10px, 2cqmin)',
                          }}
                        >
                          <span style={{ fontSize: 'min(14px, 5cqmin)' }}>
                            {tool.emoji}
                          </span>
                          <span
                            className="font-black text-slate-600 uppercase tracking-wider"
                            style={{ fontSize: 'min(9px, 3.3cqmin)' }}
                          >
                            {tool.label}
                          </span>
                          <div
                            className="flex flex-wrap ml-auto"
                            style={{ gap: 'min(2px, 0.5cqmin)' }}
                          >
                            {tool.gradeLevels.slice(0, 2).map((g) => (
                              <span
                                key={g}
                                className={`rounded-full font-black ${GRADE_COLORS[g]}`}
                                style={{
                                  fontSize: 'min(7px, 2.5cqmin)',
                                  padding:
                                    'min(1px, 0.3cqmin) min(4px, 1cqmin)',
                                }}
                              >
                                {GRADE_LABELS[g]}
                              </span>
                            ))}
                          </div>
                        </div>
                        {/* Piece buttons */}
                        <div
                          className="flex flex-wrap"
                          style={{
                            padding: 'min(6px, 1.2cqmin)',
                            gap: 'min(4px, 1cqmin)',
                          }}
                        >
                          {subItems.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => handleSpawnPiece(tool.type, item)}
                              title={item.description ?? item.label}
                              className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg font-black text-slate-600 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 transition-all active:scale-95"
                              style={{
                                fontSize: 'min(10px, 3.8cqmin)',
                                padding: 'min(4px, 1cqmin) min(8px, 1.8cqmin)',
                              }}
                            >
                              {item.emoji && (
                                <span
                                  style={{
                                    fontSize: 'min(12px, 4.5cqmin)',
                                  }}
                                >
                                  {item.emoji}
                                </span>
                              )}
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ---- Interactive section ---- */}
              {section.mode === 'interactive' && (
                <div
                  className="grid grid-cols-2"
                  style={{ gap: 'min(6px, 1.2cqmin)' }}
                >
                  {visibleTools.map((tool) => (
                    <button
                      key={tool.type}
                      onClick={() => handleSpawnInteractive(tool.type)}
                      className="flex flex-col items-center bg-white border border-slate-100 rounded-xl shadow-sm hover:border-indigo-200 hover:shadow-md hover:-translate-y-0.5 transition-all group active:scale-95"
                      style={{ padding: 'min(10px, 2cqmin)' }}
                      title={tool.description}
                    >
                      <span
                        className="group-hover:scale-110 transition-transform duration-200 leading-none"
                        style={{ fontSize: 'min(26px, 9cqmin)' }}
                      >
                        {tool.emoji}
                      </span>
                      <span
                        className="font-black text-slate-700 text-center leading-tight mt-1"
                        style={{ fontSize: 'min(9px, 3.5cqmin)' }}
                      >
                        {tool.label}
                      </span>
                      <div
                        className="flex flex-wrap justify-center"
                        style={{
                          gap: 'min(3px, 0.8cqmin)',
                          marginTop: 'min(3px, 0.8cqmin)',
                        }}
                      >
                        {tool.gradeLevels.slice(0, 3).map((g) => (
                          <span
                            key={g}
                            className={`rounded-full font-black ${GRADE_COLORS[g]}`}
                            style={{
                              fontSize: 'min(7px, 2.6cqmin)',
                              padding: 'min(1px, 0.3cqmin) min(4px, 1cqmin)',
                            }}
                          >
                            {GRADE_LABELS[g]}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ---- Footer ---- */}
      <div
        className="bg-slate-50/50 border-t border-slate-100 flex items-center justify-between font-black text-slate-300 uppercase tracking-widest shrink-0"
        style={{
          padding: 'min(6px, 1.2cqmin) min(12px, 2.5cqmin)',
          fontSize: 'min(9px, 3.2cqmin)',
        }}
      >
        <span>{totalVisible} tools</span>
        <span>{ppi} px/in</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// MathToolsSettings (back-face panel — no scaling needed)
// ---------------------------------------------------------------------------

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
          <strong>Measurement</strong> tools (rulers, protractor) place a
          true-scale sticker on your board. <strong>Manipulatives</strong> spawn
          individual tile pieces. <strong>Interactive</strong> tools open
          full-featured windows.
        </p>
      </div>

      <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
        <label className="text-xxs font-black text-slate-400 uppercase tracking-widest block">
          Palette DPI Calibration (px / inch)
        </label>
        <p className="text-xxs text-slate-400 leading-relaxed">
          Spawned true-scale tools inherit this PPI. CSS defines 1 in = 96 px —
          override only if your IFP screen renders differently.
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
