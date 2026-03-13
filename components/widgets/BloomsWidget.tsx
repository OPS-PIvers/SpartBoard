import React, { useState, useMemo } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, BloomsConfig } from '@/types';
import { BLOOMS_DATA } from '@/config/bloomsData';
import { ChevronRight, Settings2, Trash2, Plus, Info } from 'lucide-react';

const LEVELS = [
  { id: 'level-6', label: 'Evaluation', color: 'rgba(157, 78, 221, 0.4)' },
  {
    id: 'level-5',
    label: 'Synthesis or Create',
    color: 'rgba(114, 9, 183, 0.4)',
  },
  { id: 'level-4', label: 'Analysis', color: 'rgba(72, 12, 168, 0.4)' },
  { id: 'level-3', label: 'Application', color: 'rgba(63, 55, 201, 0.4)' },
  {
    id: 'level-2',
    label: 'Understanding/Comprehension',
    color: 'rgba(72, 149, 239, 0.4)',
  },
  {
    id: 'level-1',
    label: 'Recall/Knowledge/Memory',
    color: 'rgba(76, 201, 240, 0.4)',
  },
].reverse(); // Pyramid base is level 1

export const BloomsWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as BloomsConfig;
  const [rotation, setRotation] = useState({ x: -10, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const activeLevelId = config.activeLevel;

  // Merge custom starters with defaults
  const levelsData = useMemo(() => {
    return BLOOMS_DATA.questionStarters.map((d, i) => {
      const custom = config.customStarters?.find((c) => c.level === d.level);
      return {
        level: d.level,
        starters: custom ? custom.starters : d.starters,
        index: i + 1,
      };
    });
  }, [config.customStarters]);

  const activeLevelData = levelsData.find(
    (d) => `level-${d.index}` === activeLevelId
  );

  const handleLevelClick = (levelId: string) => {
    updateWidget(widget.id, {
      config: {
        ...config,
        activeLevel: activeLevelId === levelId ? null : levelId,
      },
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isHovered) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 60;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -60;
    setRotation({ x: -10 + y, y: x });
  };

  return (
    <div className="h-full w-full flex flex-col relative overflow-hidden">
      {/* 3D Scene Container */}
      <div
        className="flex-1 relative cursor-grab active:cursor-grabbing preserve-3d"
        style={{ perspective: '1000px' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setRotation({ x: -10, y: 0 });
        }}
        onMouseMove={handleMouseMove}
      >
        <div
          className="absolute inset-0 flex items-center justify-center transition-transform duration-700 ease-out preserve-3d"
          style={{
            transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y + (isHovered ? 15 : 0)}deg)`,
          }}
        >
          {/* The Pyramid */}
          <div className="relative w-64 h-64 preserve-3d">
            {/* Pyramid Sides */}
            {[0, 90, 180, 270].map((rot) => (
              <div
                key={rot}
                className="absolute inset-0 preserve-3d"
                style={{
                  transform: `rotateY(${rot}deg) translateZ(0px) rotateX(30deg)`,
                  transformOrigin: 'bottom center',
                }}
              >
                {/* Each side is composed of levels */}
                <div className="w-full h-full flex flex-col-reverse items-center">
                  {LEVELS.map((level, idx) => (
                    <div
                      key={level.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLevelClick(level.id);
                      }}
                      className={`
                        w-full cursor-pointer transition-all duration-300 relative
                        flex items-center justify-center border border-white/20
                        hover:brightness-125 backdrop-blur-sm
                        ${activeLevelId === level.id ? 'brightness-150 scale-105 z-10' : 'opacity-80 hover:opacity-100'}
                      `}
                      style={{
                        height: `${100 / 6}%`,
                        backgroundColor: level.color,
                        clipPath: `polygon(${idx * 8.33}% 100%, ${100 - idx * 8.33}% 100%, ${100 - (idx + 1) * 8.33}% 0%, ${(idx + 1) * 8.33}% 0%)`,
                        width: '100%',
                        marginTop: '-1px',
                      }}
                    >
                      {/* Only show label on the front face (rot=0) */}
                      {rot === 0 && (
                        <span className="text-[8px] md:text-[10px] text-white font-bold text-center px-1 drop-shadow-md select-none">
                          {level.label}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detail Panel / Drawer */}
      <div
        className={`
          absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 
          transition-all duration-500 ease-in-out z-20 overflow-hidden
          ${activeLevelId ? 'h-1/2' : 'h-0'}
        `}
      >
        {activeLevelData && (
          <div className="p-4 h-full flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                {activeLevelData.level}
              </h3>
              <button
                onClick={() => activeLevelId && handleLevelClick(activeLevelId)}
                className="p-1 hover:bg-slate-100 rounded-full text-slate-400"
              >
                <ChevronRight className="w-5 h-5 rotate-90" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 gap-2">
                {activeLevelData.starters.map((starter, i) => (
                  <div
                    key={i}
                    className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600 hover:bg-indigo-50 hover:border-indigo-100 transition-colors"
                  >
                    {starter}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Instructions if nothing selected */}
      {!activeLevelId && (
        <div className="absolute bottom-4 left-0 right-0 text-center animate-bounce pointer-events-none">
          <span className="text-xxs text-slate-400 bg-white/50 px-2 py-1 rounded-full backdrop-blur-sm">
            Click a level to see question starters
          </span>
        </div>
      )}
    </div>
  );
};

export const BloomsSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as BloomsConfig;
  const { updateWidget } = useDashboard();
  const [editingLevel, setEditingLevel] = useState<string | null>(null);

  const customStarters = config.customStarters ?? [];

  const handleUpdateStarters = (levelName: string, starters: string[]) => {
    const existing = customStarters.find((s) => s.level === levelName);
    let newCustom;
    if (existing) {
      newCustom = customStarters.map((s) =>
        s.level === levelName ? { ...s, starters } : s
      );
    } else {
      newCustom = [...customStarters, { level: levelName, starters }];
    }
    updateWidget(widget.id, {
      config: { ...config, customStarters: newCustom },
    });
  };

  const resetToDefault = (levelName: string) => {
    updateWidget(widget.id, {
      config: {
        ...config,
        customStarters: customStarters.filter((s) => s.level !== levelName),
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="p-3 bg-indigo-50 rounded-xl flex items-start gap-3 border border-indigo-100">
        <Info className="w-4 h-4 text-indigo-500 mt-0.5" />
        <p className="text-[10px] text-indigo-700 leading-relaxed">
          Customize the question starters for each level of Bloom&apos;s
          Taxonomy. Changes will only apply to this widget instance.
        </p>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {BLOOMS_DATA.questionStarters.map((level) => {
          const isEditing = editingLevel === level.level;
          const currentData =
            customStarters.find((s) => s.level === level.level) ?? level;

          return (
            <div
              key={level.level}
              className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm"
            >
              <button
                onClick={() => setEditingLevel(isEditing ? null : level.level)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50 transition-colors"
              >
                <span className="text-xs font-bold text-slate-700">
                  {level.level}
                </span>
                <div className="flex items-center gap-2">
                  {customStarters.find((s) => s.level === level.level) && (
                    <span className="text-[8px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded uppercase font-bold">
                      Custom
                    </span>
                  )}
                  <Settings2
                    className={`w-4 h-4 text-slate-400 transition-transform ${isEditing ? 'rotate-90' : ''}`}
                  />
                </div>
              </button>

              {isEditing && (
                <div className="p-3 border-t border-slate-100 bg-slate-50 space-y-3">
                  <div className="space-y-2">
                    {currentData.starters.map((starter, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input
                          type="text"
                          value={starter}
                          onChange={(e) => {
                            const newStarters = [...currentData.starters];
                            newStarters[idx] = e.target.value;
                            handleUpdateStarters(level.level, newStarters);
                          }}
                          className="flex-1 text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <button
                          onClick={() => {
                            const newStarters = currentData.starters.filter(
                              (_, i) => i !== idx
                            );
                            handleUpdateStarters(level.level, newStarters);
                          }}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        handleUpdateStarters(level.level, [
                          ...currentData.starters,
                          '',
                        ]);
                      }}
                      className="w-full flex items-center justify-center gap-2 p-2 text-[10px] text-indigo-600 hover:bg-indigo-100 rounded-lg border border-dashed border-indigo-200 transition-colors mt-2"
                    >
                      <Plus className="w-3 h-3" /> Add Starter
                    </button>
                  </div>

                  <div className="flex justify-end pt-2 border-t border-slate-200 mt-3">
                    <button
                      onClick={() => resetToDefault(level.level)}
                      className="text-[10px] text-slate-400 hover:text-slate-600 underline"
                    >
                      Reset to Default
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
