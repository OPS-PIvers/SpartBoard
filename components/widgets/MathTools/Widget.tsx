import React, { useMemo, useState } from 'react';
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
} from '@/components/widgets/math-tools/mathToolUtils';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { GRADE_LABELS, PALETTE_SECTIONS } from './constants';

export const MathToolsWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { addWidget } = useDashboard();
  const { featurePermissions } = useAuth();
  const config = widget.config as MathToolsConfig;
  const ppi = config.dpiCalibration ?? CSS_PPI;

  const [activeTab, setActiveTab] = useState<string>(PALETTE_SECTIONS[0].id);
  const [gradeFilter, setGradeFilter] = useState<GradeLevel | 'all'>('all');

  // Read per-tool grade levels from admin global config
  const globalConfig = useMemo(() => {
    const perm = featurePermissions.find((p) => p.widgetType === 'mathTools');
    return (perm?.config ?? {}) as MathToolsGlobalConfig;
  }, [featurePermissions]);

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

  const handleSpawnSticker = (toolType: MathToolType) => {
    const meta = getMathToolMeta(toolType);
    addWidget('mathTool', {
      w: meta.defaultW,
      h: meta.defaultH,
      transparency: 0,
      config: {
        toolType,
        pixelsPerInch: ppi,
        stickerMode: true,
        ...(toolType === 'ruler-in' && { rulerUnits: 'in' }),
        ...(toolType === 'ruler-cm' && { rulerUnits: 'cm' }),
      },
    });
  };

  const handleSpawnPiece = (toolType: MathToolType, subItem: ToolSubItem) => {
    addWidget('mathTool', {
      w: subItem.spawnW,
      h: subItem.spawnH,
      transparency: 0,
      config: {
        toolType,
        pixelsPerInch: ppi,
        stickerMode: true,
        stickerPiece: subItem.id,
      },
    });
  };

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
  const activeSection =
    PALETTE_SECTIONS.find((s) => s.id === activeTab) ?? PALETTE_SECTIONS[0];
  const visibleTools = getVisibleTools(activeSection.toolTypes);

  const header = (
    <div className="flex flex-col bg-gradient-to-r from-purple-50 to-indigo-50 shrink-0 border-b border-slate-200">
      <div
        className="flex items-center gap-2"
        style={{ padding: 'min(8px, 1.5cqmin) min(12px, 2.5cqmin)' }}
      >
        <span style={{ fontSize: 'min(18px, 6cqmin)' }}>🧮</span>
        <span
          className="font-black uppercase tracking-widest text-purple-800"
          style={{ fontSize: 'min(11px, 4cqmin)' }}
        >
          Math Tools
        </span>
        <div className="ml-auto flex items-center gap-1.5 bg-white/60 px-1.5 py-0.5 rounded-md border border-purple-100/50 shadow-sm">
          <span
            className="text-purple-500 font-bold uppercase tracking-wider"
            style={{ fontSize: 'min(8px, 3cqmin)' }}
          >
            Grade
          </span>
          <select
            value={gradeFilter}
            onChange={(e) =>
              setGradeFilter(e.target.value as GradeLevel | 'all')
            }
            className="bg-transparent text-purple-900 font-black outline-none cursor-pointer appearance-none text-right pr-2"
            style={{
              fontSize: 'min(10px, 3.5cqmin)',
              backgroundImage:
                'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%237e22ce%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right center',
              backgroundSize: 'min(8px, 2.5cqmin)',
            }}
          >
            <option value="all">All</option>
            {allGrades.map((g) => (
              <option key={g} value={g}>
                {GRADE_LABELS[g]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div
        className="flex px-2 gap-1 overflow-x-auto no-scrollbar"
        style={{ paddingBottom: '0' }}
      >
        {PALETTE_SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveTab(s.id)}
            className={`px-3 py-1.5 rounded-t-xl font-black transition-colors border-t border-x ${
              activeTab === s.id
                ? 'bg-white text-purple-700 border-slate-200'
                : 'bg-transparent text-purple-400 border-transparent hover:text-purple-600 hover:bg-white/40'
            }`}
            style={{
              fontSize: 'min(10px, 3.8cqmin)',
              marginBottom: '-1px', // Cover bottom border
              boxShadow:
                activeTab === s.id ? '0 -2px 10px rgba(0,0,0,0.02)' : 'none',
            }}
          >
            {s.title}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <WidgetLayout
      padding="p-0"
      header={header}
      contentClassName="flex-1 min-h-0 flex flex-col bg-white"
      content={
        <div
          className="flex-1 overflow-y-auto custom-scrollbar"
          style={{ padding: 'min(12px, 2.5cqmin)' }}
        >
          <div
            className="flex items-center gap-2 text-slate-400 font-medium"
            style={{
              fontSize: 'min(9px, 3.2cqmin)',
              marginBottom: 'min(12px, 2.5cqmin)',
            }}
          >
            <span>{activeSection.subtitle}</span>
            <div className="h-px bg-slate-100 flex-1 rounded-full" />
            <span className="shrink-0 text-slate-300 font-mono">
              click to place
            </span>
          </div>

          {visibleTools.length === 0 && (
            <div
              className="flex flex-col items-center justify-center text-slate-400 h-32"
              style={{ gap: 'min(8px, 1.5cqmin)' }}
            >
              <span style={{ fontSize: 'min(32px, 10cqmin)', opacity: 0.5 }}>
                🔍
              </span>
              <span
                className="font-bold text-center"
                style={{ fontSize: 'min(11px, 4cqmin)' }}
              >
                No tools match &quot;
                {gradeFilter === 'all' ? 'All' : GRADE_LABELS[gradeFilter]}
                &quot;
              </span>
            </div>
          )}

          {/* ---- Sticker-whole and Interactive sections (Auto-grid) ---- */}
          {(activeSection.mode === 'sticker-whole' ||
            activeSection.mode === 'interactive') && (
            <div
              className="grid"
              style={{
                gridTemplateColumns:
                  'repeat(auto-fill, minmax(min(100px, 30cqw), 1fr))',
                gap: 'min(8px, 1.5cqmin)',
              }}
            >
              {visibleTools.map((tool) => (
                <button
                  key={tool.type}
                  onClick={() =>
                    activeSection.mode === 'sticker-whole'
                      ? handleSpawnSticker(tool.type)
                      : handleSpawnInteractive(tool.type)
                  }
                  className={`flex flex-col items-center justify-center bg-white border border-slate-100 rounded-2xl shadow-sm transition-all group active:scale-95 hover:-translate-y-1 ${
                    activeSection.mode === 'sticker-whole'
                      ? 'hover:border-purple-300 hover:shadow-[0_8px_16px_-6px_rgba(147,51,234,0.15)]'
                      : 'hover:border-indigo-300 hover:shadow-[0_8px_16px_-6px_rgba(79,70,229,0.15)]'
                  }`}
                  style={{
                    padding: 'min(16px, 3cqmin) min(8px, 1.5cqmin)',
                    gap: 'min(6px, 1.2cqmin)',
                  }}
                  title={tool.description}
                >
                  <span
                    className="group-hover:scale-125 transition-transform duration-300 leading-none drop-shadow-sm"
                    style={{ fontSize: 'min(36px, 12cqmin)' }}
                  >
                    {tool.emoji}
                  </span>
                  <span
                    className={`font-black text-center leading-tight transition-colors ${
                      activeSection.mode === 'sticker-whole'
                        ? 'text-slate-600 group-hover:text-purple-700'
                        : 'text-slate-600 group-hover:text-indigo-700'
                    }`}
                    style={{ fontSize: 'min(10px, 3.8cqmin)' }}
                  >
                    {tool.label}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* ---- Sticker-pieces section ---- */}
          {activeSection.mode === 'sticker-pieces' && (
            <div
              className="flex flex-col"
              style={{ gap: 'min(16px, 3.5cqmin)' }}
            >
              {visibleTools.map((tool) => {
                const subItems = TOOL_SUB_ITEMS[tool.type] ?? [];
                return (
                  <div
                    key={tool.type}
                    className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm flex flex-col"
                  >
                    <div
                      className="flex flex-col items-center justify-center bg-slate-50/50 border-b border-slate-100/50"
                      style={{
                        padding: 'min(10px, 2cqmin) min(8px, 1.5cqmin)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 'min(28px, 9cqmin)',
                          lineHeight: 1,
                          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
                        }}
                      >
                        {tool.emoji}
                      </span>
                      <span
                        className="font-black text-slate-700 uppercase tracking-wider mt-1.5 text-center"
                        style={{ fontSize: 'min(10px, 3.5cqmin)' }}
                      >
                        {tool.label}
                      </span>
                    </div>
                    <div
                      className="grid"
                      style={{
                        gridTemplateColumns:
                          'repeat(auto-fill, minmax(min(70px, 25cqw), 1fr))',
                        gap: 'min(6px, 1.2cqmin)',
                        padding: 'min(8px, 1.5cqmin)',
                      }}
                    >
                      {subItems.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleSpawnPiece(tool.type, item)}
                          title={item.description ?? item.label}
                          className="flex flex-col items-center justify-center gap-1.5 bg-white border border-slate-200 rounded-xl font-black text-slate-600 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 transition-all active:scale-95 shadow-sm hover:shadow"
                          style={{
                            fontSize: 'min(9px, 3.3cqmin)',
                            padding: 'min(8px, 1.5cqmin) min(4px, 1cqmin)',
                            aspectRatio: '1',
                          }}
                        >
                          {item.emoji && (
                            <span
                              style={{
                                fontSize: 'min(20px, 7cqmin)',
                                lineHeight: 1,
                              }}
                            >
                              {item.emoji}
                            </span>
                          )}
                          <span className="text-center leading-tight">
                            {item.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      }
    />
  );
};
