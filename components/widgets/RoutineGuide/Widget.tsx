import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Info,
  List,
  RectangleHorizontal,
  Rocket,
  Search,
  Star,
} from 'lucide-react';
import {
  RoutineGuideCategory,
  RoutineGuideConfig,
  RoutineGuideFilter,
  RoutineGuideGlobalConfig,
  RoutineGuideRoutine,
  RoutineGuideStep,
  WidgetComponentProps,
} from '@/types';
import { useDashboardActions } from '@/context/dashboardCanvasStore';
import { useAuth } from '@/context/useAuth';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import { WidgetLayout } from '../WidgetLayout';
import {
  getRoutineGuideColor,
  hasRoutineInfo,
  resolveRoutineGuideCategories,
  resolveRoutineGuideLibrary,
  sortRoutinesForLibrary,
} from '@/config/routineGuide';
import { RoutineIcon } from './RoutineIcon';
import { AllSteps, AllStepsLayout } from './AllSteps';
import { RoutineInfoModal } from './RoutineInfoModal';

// Keeps corner controls clear of DraggableWindow's 24px corner resize handles.
const CORNER_CLEARANCE = 'max(26px, 3cqmin)';

const SCOPES: { id: RoutineGuideFilter; label: string }[] = [
  { id: 'grade', label: 'My grades' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'all', label: 'All routines' },
];

const iconBtn =
  'shrink-0 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-900/5 hover:text-slate-800 transition-colors';
const smallIcon = { width: 'min(18px, 5cqmin)', height: 'min(18px, 5cqmin)' };

const ToolLaunchButton: React.FC<{ step: RoutineGuideStep; lg?: boolean }> = ({
  step,
  lg,
}) => {
  const { addWidget } = useDashboardActions();
  const tool = step.attachedWidget;
  if (!tool) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        addWidget(tool.type, tool.config ? { config: tool.config } : {});
      }}
      className="inline-flex items-center shrink-0 rounded-lg border border-slate-300 bg-white text-slate-700 font-bold hover:bg-slate-50 transition-colors"
      style={{
        gap: 'min(6px, 1.5cqmin)',
        padding: lg
          ? 'min(8px, 2cqmin) min(14px, 3.5cqmin)'
          : 'min(4px, 1cqmin) min(8px, 2cqmin)',
        fontSize: lg ? 'min(15px, 4.5cqmin)' : 'min(12px, 3.5cqmin)',
      }}
    >
      <Rocket style={{ width: '1.1em', height: '1.1em' }} />
      {tool.label}
    </button>
  );
};

const StepBadge: React.FC<{ step: RoutineGuideStep; size: string }> = ({
  step,
  size,
}) => {
  const color = getRoutineGuideColor(step.color);
  if (step.imageUrl) {
    return (
      <img
        src={step.imageUrl}
        alt=""
        className="shrink-0 object-cover rounded-lg border border-slate-200 bg-white"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="shrink-0 rounded-full flex items-center justify-center"
      style={{
        width: size,
        height: size,
        backgroundColor: color.tint,
        color: color.ink,
      }}
    >
      <RoutineIcon name={step.icon} style={{ width: '55%', height: '55%' }} />
    </span>
  );
};

const RoutineLibrary: React.FC<{
  routines: RoutineGuideRoutine[];
  categories: RoutineGuideCategory[];
  filter: RoutineGuideFilter;
  favorites: string[];
  onFilter: (f: RoutineGuideFilter) => void;
  onToggleFavorite: (id: string) => void;
  onSelect: (r: RoutineGuideRoutine) => void;
}> = ({
  routines,
  categories,
  filter,
  favorites,
  onFilter,
  onToggleFavorite,
  onSelect,
}) => {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q
    ? routines.filter((r) => r.name.toLowerCase().includes(q))
    : routines;
  return (
    <div className="h-full w-full flex flex-col">
      <div
        className="shrink-0 flex items-center border-b border-slate-200"
        style={{
          gap: 'min(8px, 2cqmin)',
          padding: `min(8px, 2cqmin) ${CORNER_CLEARANCE}`,
        }}
      >
        <label
          className="flex-1 min-w-0 flex items-center rounded-lg border border-slate-300 bg-white"
          style={{
            gap: 'min(6px, 1.5cqmin)',
            padding: 'min(5px, 1.25cqmin) min(8px, 2cqmin)',
          }}
        >
          <Search className="shrink-0 text-slate-400" style={smallIcon} />
          <input
            type="search"
            aria-label="Search routines"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-w-0 bg-transparent outline-none text-slate-800"
            style={{ fontSize: 'min(14px, 4.25cqmin)' }}
          />
        </label>
        <select
          aria-label="Show"
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
          className="shrink-0 rounded-lg border border-slate-300 bg-white text-slate-800 font-semibold"
          style={{
            fontSize: 'min(14px, 4.25cqmin)',
            padding: 'min(5px, 1.25cqmin) min(6px, 1.5cqmin)',
            maxWidth: '45%',
          }}
        >
          {SCOPES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
          {categories.length > 0 && (
            <optgroup label="Categories">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {shown.length === 0 ? (
          <p
            className="text-center text-slate-500 font-medium"
            style={{
              fontSize: 'min(14px, 4.5cqmin)',
              padding: 'min(24px, 6cqmin)',
            }}
          >
            {filter === 'favorites' && !q ? 'No favorites yet' : 'No routines'}
          </p>
        ) : (
          <ul
            className="grid"
            style={{
              gridTemplateColumns:
                'repeat(auto-fill, minmax(max(96px, 22cqw), 1fr))',
              gap: 'min(10px, 2.5cqmin)',
              padding:
                'min(10px, 2.5cqmin) min(10px, 2.5cqmin) min(16px, 4cqmin)',
            }}
          >
            {shown.map((r) => {
              const color = getRoutineGuideColor(r.color);
              const fav = favorites.includes(r.id);
              return (
                <li key={r.id} className="relative aspect-square">
                  <button
                    type="button"
                    onClick={() => onSelect(r)}
                    className="relative h-full w-full overflow-hidden flex items-center justify-center text-center rounded-xl text-white hover:brightness-110 transition"
                    style={{ backgroundColor: color.ink, padding: '12%' }}
                  >
                    <RoutineIcon
                      name={r.icon}
                      aria-hidden="true"
                      className="absolute pointer-events-none opacity-20"
                      style={{ width: '72%', height: '72%' }}
                    />
                    <span
                      className="relative font-black leading-tight line-clamp-3"
                      style={{ fontSize: 'min(17px, 4.75cqmin)' }}
                    >
                      {r.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={
                      fav ? `Unfavorite ${r.name}` : `Favorite ${r.name}`
                    }
                    aria-pressed={fav}
                    onClick={() => onToggleFavorite(r.id)}
                    className={`absolute top-0 right-0 text-white transition-opacity ${
                      fav ? 'opacity-100' : 'opacity-50 hover:opacity-90'
                    }`}
                    style={{ padding: 'min(8px, 2cqmin)' }}
                  >
                    <Star
                      fill={fav ? 'currentColor' : 'none'}
                      style={{
                        width: 'min(16px, 4.5cqmin)',
                        height: 'min(16px, 4.5cqmin)',
                      }}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

const StepView: React.FC<{
  step: RoutineGuideStep;
  index: number;
  total: number;
  onMove: (i: number) => void;
}> = ({ step, index, total, onMove }) => {
  const color = getRoutineGuideColor(step.color);
  const navBtn =
    'flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white transition-colors';
  return (
    <div className="h-full w-full flex flex-col">
      <div
        className="flex-1 min-h-0 flex flex-col items-center justify-center text-center"
        style={{ padding: 'min(16px, 4cqmin)', gap: 'min(12px, 3cqmin)' }}
      >
        <StepBadge
          step={step}
          size={step.imageUrl ? 'min(220px, 42cqmin)' : 'min(96px, 24cqmin)'}
        />
        {step.label && (
          <span
            className="font-black uppercase tracking-wider"
            style={{ fontSize: 'min(15px, 4.5cqmin)', color: color.ink }}
          >
            {step.label}
          </span>
        )}
        <p
          className="font-bold text-slate-800 leading-snug"
          style={{ fontSize: 'min(34px, 8cqmin)' }}
        >
          {step.text}
        </p>
        <ToolLaunchButton step={step} lg />
      </div>
      <div
        className="shrink-0 flex items-center justify-between border-t border-slate-200"
        style={{ padding: `min(10px, 2.5cqmin) ${CORNER_CLEARANCE}` }}
      >
        <button
          type="button"
          aria-label="Previous step"
          disabled={index === 0}
          onClick={() => onMove(index - 1)}
          className={navBtn}
          style={{ width: 'min(40px, 11cqmin)', height: 'min(40px, 11cqmin)' }}
        >
          <ChevronLeft style={{ width: '60%', height: '60%' }} />
        </button>
        <span
          className="font-bold text-slate-600 tabular-nums"
          style={{ fontSize: 'min(14px, 4.5cqmin)' }}
        >
          Step {index + 1} of {total}
        </span>
        <button
          type="button"
          aria-label="Next step"
          disabled={index >= total - 1}
          onClick={() => onMove(index + 1)}
          className={navBtn}
          style={{ width: 'min(40px, 11cqmin)', height: 'min(40px, 11cqmin)' }}
        >
          <ChevronRight style={{ width: '60%', height: '60%' }} />
        </button>
      </div>
    </div>
  );
};

const STEPS_LAYOUT: AllStepsLayout = 'columns';

export const RoutineGuideWidget: React.FC<WidgetComponentProps> = ({
  widget,
}) => {
  const { updateWidget, addWidget } = useDashboardActions();
  const {
    featurePermissions,
    userGradeLevels,
    savedWidgetPresets,
    saveWidgetPreset,
  } = useAuth();
  const [infoOpen, setInfoOpen] = useState(false);
  const config = widget.config as RoutineGuideConfig;
  const prefs = savedWidgetPresets.routineGuide as
    | Partial<RoutineGuideConfig>
    | undefined;
  const favorites = useMemo(() => prefs?.favorites ?? [], [prefs?.favorites]);
  const filter: RoutineGuideFilter = prefs?.libraryFilter ?? 'grade';

  const globalConfig = featurePermissions.find(
    (p) => p.widgetType === 'routineGuide'
  )?.config as RoutineGuideGlobalConfig | undefined;
  const library = useMemo(
    () => resolveRoutineGuideLibrary(globalConfig),
    [globalConfig]
  );
  const categories = useMemo(
    () => resolveRoutineGuideCategories(globalConfig),
    [globalConfig]
  );

  const visible = useMemo(() => {
    const inGrades = (r: RoutineGuideRoutine) =>
      userGradeLevels.length === 0 ||
      r.gradeLevels.length === 0 ||
      r.gradeLevels.some((g) => userGradeLevels.includes(g));
    let list: RoutineGuideRoutine[];
    if (filter === 'all') list = library;
    else if (filter === 'favorites')
      list = library.filter((r) => favorites.includes(r.id));
    else if (filter === 'grade') list = library.filter(inGrades);
    else list = library.filter((r) => r.categoryIds.includes(filter));
    return sortRoutinesForLibrary(list, favorites);
  }, [library, filter, favorites, userGradeLevels]);

  const update = (patch: Partial<RoutineGuideConfig>) =>
    updateWidget(widget.id, { config: { ...config, ...patch } });

  const routine = config.selectedRoutineId
    ? library.find((r) => r.id === config.selectedRoutineId)
    : undefined;
  const isDisplay = config.mode === 'display';

  if (!routine || routine.steps.length === 0) {
    return (
      <WidgetLayout
        padding="p-0"
        contentClassName="flex-1 min-h-0"
        content={
          <RoutineLibrary
            routines={visible}
            categories={categories}
            filter={filter}
            favorites={favorites}
            onFilter={(f) =>
              saveWidgetPreset('routineGuide', { libraryFilter: f })
            }
            onToggleFavorite={(id) =>
              saveWidgetPreset('routineGuide', {
                favorites: favorites.includes(id)
                  ? favorites.filter((f) => f !== id)
                  : [...favorites, id],
              })
            }
            onSelect={(r) => update({ selectedRoutineId: r.id, stepIndex: 0 })}
          />
        }
      />
    );
  }

  const stepIndex = Math.min(
    Math.max(config.stepIndex ?? 0, 0),
    routine.steps.length - 1
  );
  const view = config.view ?? 'step';
  const routineColor = getRoutineGuideColor(routine.color);
  const viewBtn = (active: boolean) =>
    `flex items-center justify-center rounded-md transition-colors ${
      active ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-900/5'
    }`;
  const defaults = WIDGET_DEFAULTS.routineGuide;

  return (
    <>
      <WidgetLayout
        padding="p-0"
        contentClassName="flex-1 min-h-0"
        header={
          <div
            className="flex items-center border-b border-slate-200"
            style={{
              gap: 'min(8px, 2cqmin)',
              padding: `min(8px, 2cqmin) ${CORNER_CLEARANCE}`,
            }}
          >
            {!isDisplay && (
              <button
                type="button"
                aria-label="All routines"
                onClick={() =>
                  update({ selectedRoutineId: null, stepIndex: 0 })
                }
                className={iconBtn}
                style={{ padding: 'min(6px, 1.5cqmin)' }}
              >
                <ArrowLeft style={smallIcon} />
              </button>
            )}
            <RoutineIcon
              name={routine.icon}
              className="shrink-0"
              style={{ ...smallIcon, color: routineColor.ink }}
            />
            <h3
              className="flex-1 min-w-0 truncate font-black text-slate-800"
              style={{ fontSize: 'min(16px, 5cqmin)' }}
            >
              {routine.name}
            </h3>
            {hasRoutineInfo(routine) && (
              <button
                type="button"
                aria-label={`About ${routine.name}`}
                onClick={() => setInfoOpen(true)}
                className={iconBtn}
                style={{ padding: 'min(6px, 1.5cqmin)' }}
              >
                <Info style={smallIcon} />
              </button>
            )}
            {isDisplay ? (
              <div
                role="group"
                aria-label="Step view"
                className="shrink-0 flex rounded-lg border border-slate-200 bg-white"
                style={{
                  padding: 'min(2px, 0.5cqmin)',
                  gap: 'min(2px, 0.5cqmin)',
                }}
              >
                <button
                  type="button"
                  aria-label="Current step"
                  aria-pressed={view === 'step'}
                  onClick={() => update({ view: 'step' })}
                  className={viewBtn(view === 'step')}
                  style={{ padding: 'min(5px, 1.25cqmin)' }}
                >
                  <RectangleHorizontal style={smallIcon} />
                </button>
                <button
                  type="button"
                  aria-label="All steps"
                  aria-pressed={view === 'all'}
                  onClick={() => update({ view: 'all' })}
                  className={viewBtn(view === 'all')}
                  style={{ padding: 'min(5px, 1.25cqmin)' }}
                >
                  <List style={smallIcon} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  addWidget('routineGuide', {
                    w: defaults.w,
                    h: defaults.h,
                    config: {
                      selectedRoutineId: routine.id,
                      stepIndex: 0,
                      view: 'step',
                      mode: 'display',
                    },
                  })
                }
                className="shrink-0 inline-flex items-center rounded-lg bg-slate-800 text-white font-bold hover:bg-slate-900 transition-colors"
                style={{
                  gap: 'min(6px, 1.5cqmin)',
                  padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                  fontSize: 'min(13px, 4cqmin)',
                }}
              >
                <Rocket style={{ width: '1.1em', height: '1.1em' }} />
                Launch
              </button>
            )}
          </div>
        }
        content={
          !isDisplay ? (
            <AllSteps steps={routine.steps} layout={STEPS_LAYOUT} />
          ) : view === 'all' ? (
            <AllSteps
              steps={routine.steps}
              layout={STEPS_LAYOUT}
              index={stepIndex}
              onMove={(i) => update({ stepIndex: i })}
              renderTool={(step) => <ToolLaunchButton step={step} />}
            />
          ) : (
            <StepView
              step={routine.steps[stepIndex]}
              index={stepIndex}
              total={routine.steps.length}
              onMove={(i) => update({ stepIndex: i })}
            />
          )
        }
      />
      {infoOpen && (
        <RoutineInfoModal
          routine={routine}
          onClose={() => setInfoOpen(false)}
        />
      )}
    </>
  );
};
