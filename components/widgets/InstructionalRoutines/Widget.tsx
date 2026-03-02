import React, { useMemo } from 'react';
import { useDashboard } from '../../../context/useDashboard';
import { useAuth } from '../../../context/useAuth';
import { useInstructionalRoutines } from '../../../hooks/useInstructionalRoutines';
import {
  WidgetData,
  InstructionalRoutinesConfig,
  RoutineStep,
  WidgetType,
} from '../../../types';
import {
  ROUTINES as DEFAULT_ROUTINES,
  InstructionalRoutine,
} from '../../../config/instructionalRoutines';
import * as Icons from 'lucide-react';
import { Star, ArrowLeft, Rocket } from 'lucide-react';
import { BLOOMS_DATA } from '../../../config/bloomsData';

// Color mapping for routines
const ROUTINE_COLORS: Record<
  string,
  { bg: string; text: string; border: string; hoverBorder: string }
> = {
  blue: {
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    border: 'border-blue-100',
    hoverBorder: 'hover:border-blue-300',
  },
  indigo: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-600',
    border: 'border-indigo-100',
    hoverBorder: 'hover:border-indigo-300',
  },
  violet: {
    bg: 'bg-violet-50',
    text: 'text-violet-600',
    border: 'border-violet-100',
    hoverBorder: 'hover:border-violet-300',
  },
  purple: {
    bg: 'bg-purple-50',
    text: 'text-purple-600',
    border: 'border-purple-100',
    hoverBorder: 'hover:border-purple-300',
  },
  fuchsia: {
    bg: 'bg-fuchsia-50',
    text: 'text-fuchsia-600',
    border: 'border-fuchsia-100',
    hoverBorder: 'hover:border-fuchsia-300',
  },
  pink: {
    bg: 'bg-pink-50',
    text: 'text-pink-600',
    border: 'border-pink-100',
    hoverBorder: 'hover:border-pink-300',
  },
  rose: {
    bg: 'bg-rose-50',
    text: 'text-rose-600',
    border: 'border-rose-100',
    hoverBorder: 'hover:border-rose-300',
  },
  red: {
    bg: 'bg-red-50',
    text: 'text-red-600',
    border: 'border-red-100',
    hoverBorder: 'hover:border-red-300',
  },
  orange: {
    bg: 'bg-orange-50',
    text: 'text-orange-600',
    border: 'border-orange-100',
    hoverBorder: 'hover:border-orange-300',
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    border: 'border-amber-100',
    hoverBorder: 'hover:border-amber-300',
  },
  yellow: {
    bg: 'bg-yellow-50',
    text: 'text-yellow-600',
    border: 'border-yellow-100',
    hoverBorder: 'hover:border-yellow-300',
  },
  lime: {
    bg: 'bg-lime-50',
    text: 'text-lime-600',
    border: 'border-lime-100',
    hoverBorder: 'hover:border-lime-300',
  },
  green: {
    bg: 'bg-green-50',
    text: 'text-green-600',
    border: 'border-green-100',
    hoverBorder: 'hover:border-green-300',
  },
  emerald: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    border: 'border-emerald-100',
    hoverBorder: 'hover:border-emerald-300',
  },
  teal: {
    bg: 'bg-teal-50',
    text: 'text-teal-600',
    border: 'border-teal-100',
    hoverBorder: 'hover:border-teal-300',
  },
  cyan: {
    bg: 'bg-cyan-50',
    text: 'text-cyan-600',
    border: 'border-cyan-100',
    hoverBorder: 'hover:border-cyan-300',
  },
  sky: {
    bg: 'bg-sky-50',
    text: 'text-sky-600',
    border: 'border-sky-100',
    hoverBorder: 'hover:border-sky-300',
  },
  slate: {
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    border: 'border-slate-100',
    hoverBorder: 'hover:border-slate-300',
  },
  zinc: {
    bg: 'bg-zinc-50',
    text: 'text-zinc-600',
    border: 'border-zinc-100',
    hoverBorder: 'hover:border-zinc-300',
  },
  stone: {
    bg: 'bg-stone-50',
    text: 'text-stone-600',
    border: 'border-stone-100',
    hoverBorder: 'hover:border-stone-300',
  },
  neutral: {
    bg: 'bg-neutral-50',
    text: 'text-neutral-600',
    border: 'border-neutral-100',
    hoverBorder: 'hover:border-neutral-300',
  },
};

interface RoutineStepItemProps {
  step: RoutineStep;
  index: number;
  structure: string;
  layout?: 'list' | 'grid' | 'hero';
  onStepClick: (
    icon: string | undefined,
    color: string,
    label?: string,
    stickerUrl?: string
  ) => void;
  onAddWidget: (type: WidgetType, config?: Record<string, unknown>) => void;
}

const RoutineStepItem: React.FC<RoutineStepItemProps> = ({
  step,
  index,
  structure,
  layout = 'list',
  onStepClick,
  onAddWidget,
}) => {
  const StepIcon = step.icon
    ? (Icons as unknown as Record<string, React.ElementType>)[step.icon]
    : null;

  const isVisualCue = structure === 'visual-cue';
  const hasSticker = (step.stickerUrl ?? '') !== '' || !!StepIcon;
  const hasWidget = !!step.attachedWidget;
  const isGrid = layout === 'grid';
  const isHero = layout === 'hero';

  return (
    <div
      className={`
        flex animate-in slide-in-from-right duration-300 group bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-all
        ${
          isHero
            ? 'flex-col items-center justify-center text-center p-8'
            : isGrid
              ? 'flex-col items-center justify-center text-center aspect-square'
              : isVisualCue
                ? 'flex-col items-center text-center'
                : 'items-center'
        }
      `}
      style={{
        padding: isHero ? '2em' : isGrid ? '1.5em' : '1em',
        gap: isHero ? '1.5em' : isGrid ? '0.8em' : '1em',
        height: isGrid ? '100%' : undefined,
      }}
    >
      <div
        className={`flex items-center shrink-0 ${isHero ? 'mb-2' : ''}`}
        style={{ gap: '1em' }}
      >
        {(structure === 'linear' || structure === 'cycle') &&
          !isHero &&
          !isGrid && (
            <span
              className={`text-white font-black flex items-center justify-center shrink-0 shadow-sm ${structure === 'cycle' ? 'rounded-full' : 'rounded-xl'}`}
              style={{
                width: '2.5em',
                height: '2.5em',
                fontSize: '0.8em',
                backgroundColor: '#2d3f89',
              }}
            >
              {index + 1}
            </span>
          )}

        {(structure === 'linear' || structure === 'cycle') &&
          (isGrid || isHero) && (
            <span
              className={`text-brand-blue-primary font-black flex items-center justify-center bg-brand-blue-lighter/50 shrink-0 shadow-sm ${structure === 'cycle' ? 'rounded-full' : 'rounded-xl'}`}
              style={{
                width: isHero ? '3em' : '2em',
                height: isHero ? '3em' : '2em',
                fontSize: isHero ? '1.5em' : '1em',
              }}
            >
              {index + 1}
            </span>
          )}

        {step.imageUrl && (
          <div
            className="shrink-0"
            style={{
              width: isHero ? '6em' : isGrid ? '3em' : '4em',
              height: isHero ? '6em' : isGrid ? '3em' : '4em',
            }}
          >
            <img
              src={step.imageUrl}
              alt="Step Illustration"
              className="w-full h-full object-cover rounded-xl border border-slate-100 shadow-sm"
            />
          </div>
        )}

        {!step.imageUrl && isGrid && StepIcon && (
          <div
            className="shrink-0 rounded-full bg-slate-50 flex items-center justify-center text-brand-blue-primary"
            style={{ width: '3em', height: '3em' }}
          >
            <StepIcon style={{ width: '1.5em', height: '1.5em' }} />
          </div>
        )}
      </div>

      <div
        className={`flex-1 min-w-0 ${isGrid || isHero ? 'text-center' : 'text-left'}`}
      >
        <p
          className={`font-bold text-slate-700 leading-tight ${isHero ? 'font-black tracking-tight text-brand-blue-dark' : ''}`}
          style={{ fontSize: isHero ? '1.8em' : isGrid ? '1.1em' : '1em' }}
        >
          {step.text}
        </p>
      </div>

      <div
        className={`flex shrink-0 ${isHero ? 'mt-4 gap-4' : isGrid ? 'mt-auto w-full flex-col gap-2' : 'items-center gap-2'}`}
        style={{ gap: isHero ? '1em' : '0.5em' }}
      >
        {hasWidget && (
          <button
            onClick={() =>
              onAddWidget(step.attachedWidget?.type as WidgetType, {
                config: step.attachedWidget?.config,
              })
            }
            className={`bg-brand-blue-lighter text-brand-blue-primary hover:bg-brand-blue-light/20 rounded-xl font-black uppercase tracking-widest transition-colors flex items-center justify-center shadow-sm ${isGrid ? 'w-full py-2' : ''}`}
            style={{
              padding: isGrid ? '0.5em' : '0.6em 1em',
              gap: '0.5em',
              fontSize: isHero ? '0.9em' : '0.7em',
            }}
          >
            <Rocket style={{ width: '1.2em', height: '1.2em' }} />
            {isGrid
              ? 'Launch'
              : `Launch ${step.attachedWidget?.label ?? 'Tool'}`}
          </button>
        )}

        {hasSticker && (
          <button
            onClick={() =>
              onStepClick(
                step.icon as string,
                step.color ?? 'blue',
                step.label,
                step.stickerUrl
              )
            }
            className={`bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl font-black uppercase tracking-widest transition-colors flex items-center justify-center shadow-sm ${isGrid ? 'w-full py-2' : ''}`}
            style={{
              padding: isGrid ? '0.5em' : '0.6em 1em',
              gap: '0.5em',
              fontSize: isHero ? '0.9em' : '0.7em',
            }}
          >
            {step.stickerUrl ? (
              <img
                src={step.stickerUrl}
                alt="Sticker"
                className="object-contain"
                style={{ width: '1.2em', height: '1.2em' }}
              />
            ) : (
              StepIcon && (
                <StepIcon style={{ width: '1.2em', height: '1.2em' }} />
              )
            )}
            {isGrid ? 'Sticker' : `Launch ${step.label ?? 'Sticker'}`}
          </button>
        )}
      </div>
    </div>
  );
};

import { WidgetLayout } from '../WidgetLayout';

export const InstructionalRoutinesWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addWidget } = useDashboard();
  const { userGradeLevels } = useAuth();
  const { routines: cloudRoutines } = useInstructionalRoutines();

  // Merge cloud routines with defaults
  const ROUTINES = useMemo(() => {
    if (cloudRoutines.length === 0) return DEFAULT_ROUTINES;

    // Create a map by ID to ensure cloud ones override defaults if IDs match
    const routineMap = new Map<string, InstructionalRoutine>();
    DEFAULT_ROUTINES.forEach((r) => routineMap.set(r.id, r));
    cloudRoutines.forEach((r) => routineMap.set(r.id, r));

    return Array.from(routineMap.values());
  }, [cloudRoutines]);
  const config = widget.config as InstructionalRoutinesConfig;
  const {
    selectedRoutineId,
    customSteps = [],
    favorites = [],
    scaleMultiplier = 1,
  } = config;

  const handleStepClick = (
    icon: string | undefined,
    color: string,
    label?: string,
    stickerUrl?: string
  ) => {
    const w = 150;
    const h = 150;
    addWidget('sticker', {
      x: 100,
      y: 100,
      w,
      h,
      config: {
        icon: stickerUrl ? undefined : icon,
        url: stickerUrl,
        color,
        label,
        rotation: 0,
      },
    });
  };

  const selectedRoutine = ROUTINES.find((r) => r.id === selectedRoutineId);

  // Mathematical Scaling (Preferred values for CSS Container Queries)
  const scalingStyles = useMemo(() => {
    if (!selectedRoutineId) {
      // Library view scaling: ensure it scales with both width and height
      // 5.5cqh ensures 5 cards fit with readable text
      return {
        fontSize: `calc(min(20px, 4.5cqw, 5.5cqh) * ${scaleMultiplier})`,
      };
    }

    // Routine view scaling: Estimate total vertical "ems" to fit without scrolling
    // Header back-button row: ~3.5em (1em padding-top + 1.5em button + 1em padding-bottom)
    let totalVerticalEms = 3.5;

    // Bloom's specific buttons section: ~3.5em (buttons + paddingBottom)
    if (selectedRoutineId === 'blooms-analysis') {
      totalVerticalEms += 3.5;
    }

    // Each step card (list mode): 1em padding-top + 2.5em badge height + 1em padding-bottom = 4.5em
    // Plus 1em gap between steps (N-1 gaps, but approximating as N for simplicity at N>=2)
    // Combined per-step cost including gap: ~5.5em
    // Content div bottom padding: 1em (included in the per-step amortization)
    const stepCount = customSteps.length || 1;
    totalVerticalEms += stepCount * 5.5;

    const vScale = (100 / totalVerticalEms).toFixed(2);
    const hScale = (100 / 25).toFixed(2); // Horizontal capacity estimate

    // Use cqh for vertical and cqw for horizontal so each axis is independently constrained
    return {
      fontSize: `calc(min(18px, min(${vScale}cqh, ${hScale}cqw)) * ${scaleMultiplier})`,
      '--dynamic-font-size': `calc(min(18px, min(${vScale}cqh, ${hScale}cqw)) * ${scaleMultiplier})`,
    } as React.CSSProperties;
  }, [selectedRoutineId, customSteps.length, scaleMultiplier]);

  const displayedRoutines = useMemo(() => {
    const filtered = ROUTINES.filter((r) => {
      // No buildings selected → show all routines
      if (userGradeLevels.length === 0) return true;
      // Show routine if it applies to any of the user's grade levels
      return r.gradeLevels?.some((gl) => userGradeLevels.includes(gl));
    });
    return filtered.sort((a, b) => {
      const aFav = favorites.includes(a.id);
      const bFav = favorites.includes(b.id);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [userGradeLevels, favorites, ROUTINES]);

  const selectRoutine = (r: InstructionalRoutine) => {
    const initialSteps: RoutineStep[] = r.steps.map((step) => ({
      id: crypto.randomUUID(),
      text: step.text,
      icon: step.icon,
      color: step.color,
      label: step.label,
      stickerUrl: step.stickerUrl,
      imageUrl: step.imageUrl,
      attachedWidget: step.attachedWidget
        ? {
            type: step.attachedWidget.type as WidgetType,
            label: step.attachedWidget.label,
            config: step.attachedWidget.config as Record<string, unknown>,
          }
        : undefined,
    }));
    updateWidget(widget.id, {
      config: {
        ...config,
        selectedRoutineId: r.id,
        customSteps: initialSteps,
        structure: r.structure,
        audience: r.audience,
      },
    });
  };

  if (!selectedRoutineId || !selectedRoutine) {
    return (
      <WidgetLayout
        padding="p-0"
        contentClassName="h-full w-full flex flex-col"
        content={
          <div
            className="flex-1 flex flex-col overflow-y-auto custom-scrollbar"
            style={{
              ...scalingStyles,
              padding: '1cqmin', // Small equal padding on all sides
              gap: '1cqh', // Exact gap for height calculation
            }}
          >
            {displayedRoutines.map((r) => {
              const Icon =
                (Icons as unknown as Record<string, React.ElementType>)[
                  r.icon
                ] ?? Icons.HelpCircle;
              const isFav = favorites.includes(r.id);
              const colors =
                ROUTINE_COLORS[r.color || 'blue'] || ROUTINE_COLORS.blue;

              return (
                <div
                  key={r.id}
                  className={`group/card relative bg-white rounded-2xl shadow-sm border transition-all hover:shadow-md flex items-center shrink-0 ${colors.border} ${colors.hoverBorder}`}
                  style={{
                    height: '18.8cqh', // (100 - (4 * 1gap) - (2 * 1pad)) / 5 = 18.8
                    padding: '0 1.2em',
                    gap: '1.2em',
                  }}
                >
                  <div
                    className={`rounded-2xl flex items-center justify-center shrink-0 ${colors.bg} ${colors.text}`}
                    style={{
                      width: '3em',
                      height: '3em',
                    }}
                  >
                    <Icon
                      style={{
                        width: '1.8em',
                        height: '1.8em',
                      }}
                      strokeWidth={2}
                    />
                  </div>

                  <div className="flex-1 min-w-0 text-left">
                    <h4
                      className="text-slate-700 font-black uppercase truncate tracking-wide"
                      style={{ fontSize: '1.1em' }}
                    >
                      {r.name}
                    </h4>
                    <div
                      className="text-slate-500 font-bold uppercase tracking-widest"
                      style={{ fontSize: '0.7em' }}
                    >
                      {r.grades}
                    </div>
                  </div>

                  <div className="flex items-center" style={{ gap: '0.5em' }}>
                    <button
                      onClick={() => selectRoutine(r)}
                      className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 rounded-xl transition-colors font-black uppercase tracking-widest"
                      style={{
                        padding: '0.6em 1.2em',
                        fontSize: '0.8em',
                      }}
                      title="Use Routine"
                    >
                      Select
                    </button>

                    <div
                      className="bg-slate-200 shrink-0"
                      style={{
                        width: '1px',
                        height: '2em',
                        marginLeft: '0.4em',
                        marginRight: '0.4em',
                      }}
                    />

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = isFav
                          ? favorites.filter((f) => f !== r.id)
                          : [...favorites, r.id];
                        updateWidget(widget.id, {
                          config: { ...config, favorites: next },
                        });
                      }}
                      className={`rounded-xl hover:bg-slate-50 transition-colors ${
                        isFav
                          ? 'text-amber-400'
                          : 'text-slate-300 hover:text-slate-400'
                      }`}
                      style={{ padding: '0.6em' }}
                      title={isFav ? 'Remove Favorite' : 'Add Favorite'}
                    >
                      <Star
                        style={{
                          width: '1.4em',
                          height: '1.4em',
                        }}
                        className={isFav ? 'fill-current' : ''}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        }
      />
    );
  }

  const launchBloomsResource = (type: 'keyWords' | 'questionStarters') => {
    const title =
      type === 'keyWords' ? "Bloom's Key Words" : "Bloom's Sentence Starters";

    let content = `<h3 class="font-black mb-[0.5em] uppercase text-slate-800">${title}</h3>`;

    if (type === 'keyWords') {
      BLOOMS_DATA.keyWords.forEach((levelGroup) => {
        content += `<h4 class="font-extrabold mt-[1em] mb-[0.25em] text-brand-blue-primary text-[0.9em]">${levelGroup.level}</h4><ul class="pl-[1.2em] list-disc text-slate-600 text-[0.85em]">`;
        levelGroup.words.forEach((item) => {
          content += `<li>${item}</li>`;
        });
        content += `</ul>`;
      });
    } else {
      BLOOMS_DATA.questionStarters.forEach((levelGroup) => {
        content += `<h4 class="font-extrabold mt-[1em] mb-[0.25em] text-brand-blue-primary text-[0.9em]">${levelGroup.level}</h4><ul class="pl-[1.2em] list-disc text-slate-600 text-[0.85em]">`;
        levelGroup.starters.forEach((item) => {
          content += `<li>${item}</li>`;
        });
        content += `</ul>`;
      });
    }

    addWidget('text', {
      config: {
        content,
        bgColor: '#ffffff',
        fontSize: 16,
      },
    });
  };

  const structure = config.structure ?? selectedRoutine.structure ?? 'linear';

  return (
    <WidgetLayout
      padding="p-0"
      contentClassName="flex-1 min-h-0 flex flex-col"
      header={
        <div className="flex flex-col shrink-0" style={scalingStyles}>
          <div
            className="flex items-center shrink-0"
            style={{ padding: '1em' }}
          >
            <button
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, selectedRoutineId: null },
                })
              }
              className="hover:bg-slate-100 rounded-lg"
              style={{
                padding: '0.4em',
                marginRight: '0.5em',
              }}
            >
              <ArrowLeft style={{ width: '1.5em', height: '1.5em' }} />
            </button>
            <h3
              className="font-black text-slate-800 uppercase tracking-tight truncate flex-1"
              style={{ fontSize: '1.5em' }}
            >
              {selectedRoutine.name}
            </h3>
          </div>

          {selectedRoutine.id === 'blooms-analysis' && (
            <div
              className="flex shrink-0 animate-in slide-in-from-top duration-300"
              style={{
                paddingLeft: '1em',
                paddingRight: '1em',
                paddingBottom: '1em',
                gap: '1em',
              }}
            >
              <button
                onClick={() => launchBloomsResource('keyWords')}
                className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all font-black uppercase tracking-widest text-slate-700"
                style={{
                  padding: '0.8em',
                  fontSize: '0.75em',
                }}
              >
                Key Words
              </button>
              <button
                onClick={() => launchBloomsResource('questionStarters')}
                className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all font-black uppercase tracking-widest text-slate-700"
                style={{
                  padding: '0.8em',
                  fontSize: '0.75em',
                }}
              >
                Sentence Starters
              </button>
            </div>
          )}
        </div>
      }
      content={
        <div
          className="flex-1 min-h-0 flex flex-col overflow-y-auto custom-scrollbar animate-in slide-in-from-right duration-200"
          style={{
            padding: '1em',
            paddingTop: 0,
            gap: '1em',
            ...scalingStyles,
          }}
        >
          <div
            className={`${selectedRoutine.layout === 'grid' ? 'grid grid-cols-2 text-center' : 'flex flex-col text-left'}`}
            style={{ gap: '1em' }}
          >
            {customSteps.map((step, idx) => (
              <RoutineStepItem
                key={step.id ?? idx}
                step={step}
                index={idx}
                structure={structure}
                layout={selectedRoutine.layout}
                onStepClick={handleStepClick}
                onAddWidget={addWidget}
              />
            ))}
          </div>
        </div>
      }
    />
  );
};
