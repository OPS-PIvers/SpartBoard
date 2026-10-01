import React, { useMemo } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  List,
  RectangleHorizontal,
  Rocket,
  Star,
} from 'lucide-react';
import {
  RoutineGuideConfig,
  RoutineGuideFilter,
  RoutineGuideGlobalConfig,
  RoutineGuideRoutine,
  RoutineGuideStep,
  WidgetComponentProps,
} from '@/types';
import { useDashboardActions } from '@/context/dashboardCanvasStore';
import { useAuth } from '@/context/useAuth';
import { WidgetLayout } from '../WidgetLayout';
import {
  getRoutineGuideColor,
  resolveRoutineGuideLibrary,
  sortRoutinesByName,
} from '@/config/routineGuide';
import { RoutineIcon } from './RoutineIcon';

// Keeps corner controls clear of DraggableWindow's 24px corner resize handles.
const CORNER_CLEARANCE = 'max(26px, 3cqmin)';

const FILTERS: { id: RoutineGuideFilter; label: string }[] = [
  { id: 'grade', label: 'My grades' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'all', label: 'All' },
];

const LaunchButton: React.FC<{
  step: RoutineGuideStep;
  size: 'lg' | 'sm';
}> = ({ step, size }) => {
  const { addWidget } = useDashboardActions();
  const tool = step.attachedWidget;
  if (!tool) return null;
  const lg = size === 'lg';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        addWidget(tool.type, tool.config ? { config: tool.config } : {});
      }}
      className="inline-flex items-center shrink-0 rounded-lg border border-slate-300 bg-white text-slate-700 font-bold hover:bg-slate-50 transition-colors"
      style={{
        gap: lg ? 'min(8px, 2cqmin)' : 'min(6px, 1.5cqmin)',
        padding: lg
          ? 'min(8px, 2cqmin) min(14px, 3.5cqmin)'
          : 'min(4px, 1cqmin) min(8px, 2cqmin)',
        fontSize: lg ? 'min(15px, 4.5cqmin)' : 'min(12px, 3.5cqmin)',
      }}
    >
      <Rocket
        style={{
          width: lg ? 'min(16px, 4.5cqmin)' : 'min(13px, 3.5cqmin)',
          height: lg ? 'min(16px, 4.5cqmin)' : 'min(13px, 3.5cqmin)',
        }}
      />
      {tool.label}
    </button>
  );
};

const RoutineLibrary: React.FC<{
  routines: RoutineGuideRoutine[];
  filter: RoutineGuideFilter;
  favorites: string[];
  onFilter: (f: RoutineGuideFilter) => void;
  onToggleFavorite: (id: string) => void;
  onSelect: (r: RoutineGuideRoutine) => void;
}> = ({
  routines,
  filter,
  favorites,
  onFilter,
  onToggleFavorite,
  onSelect,
}) => (
  <div className="h-full w-full flex flex-col">
    <div
      role="tablist"
      aria-label="Routine filter"
      className="flex shrink-0 border-b border-slate-200"
      style={{ padding: '0 min(12px, 3cqmin)', gap: 'min(16px, 4cqmin)' }}
    >
      {FILTERS.map((f) => {
        const active = f.id === filter;
        return (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onFilter(f.id)}
            className={`font-bold border-b-2 -mb-px transition-colors ${
              active
                ? 'border-slate-800 text-slate-800'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            style={{
              fontSize: 'min(13px, 4cqmin)',
              padding: 'min(10px, 2.5cqmin) 0',
            }}
          >
            {f.label}
          </button>
        );
      })}
    </div>
    <ul className="flex-1 min-h-0 overflow-y-auto custom-scrollbar divide-y divide-slate-200/70 pb-2">
      {routines.map((r) => {
        const color = getRoutineGuideColor(r.color);
        const fav = favorites.includes(r.id);
        return (
          <li key={r.id} className="flex items-center">
            <button
              type="button"
              onClick={() => onSelect(r)}
              className="flex-1 min-w-0 flex items-center text-left hover:bg-slate-900/5 transition-colors"
              style={{
                gap: 'min(12px, 3cqmin)',
                padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
              }}
            >
              <span
                className="shrink-0 rounded-lg flex items-center justify-center"
                style={{
                  width: 'min(36px, 10cqmin)',
                  height: 'min(36px, 10cqmin)',
                  backgroundColor: color.tint,
                  color: color.ink,
                }}
              >
                <RoutineIcon
                  name={r.icon}
                  style={{
                    width: 'min(20px, 5.5cqmin)',
                    height: 'min(20px, 5.5cqmin)',
                  }}
                />
              </span>
              <span
                className="flex-1 min-w-0 truncate font-bold text-slate-800"
                style={{ fontSize: 'min(16px, 5cqmin)' }}
              >
                {r.name}
              </span>
            </button>
            <button
              type="button"
              aria-label={fav ? `Unfavorite ${r.name}` : `Favorite ${r.name}`}
              aria-pressed={fav}
              onClick={() => onToggleFavorite(r.id)}
              className={`shrink-0 transition-colors ${
                fav ? 'text-amber-500' : 'text-slate-300 hover:text-slate-500'
              }`}
              style={{ padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)' }}
            >
              <Star
                fill={fav ? 'currentColor' : 'none'}
                style={{
                  width: 'min(18px, 5cqmin)',
                  height: 'min(18px, 5cqmin)',
                }}
              />
            </button>
          </li>
        );
      })}
      {routines.length === 0 && (
        <li
          className="text-center text-slate-500 font-medium"
          style={{
            fontSize: 'min(14px, 4.5cqmin)',
            padding: 'min(24px, 6cqmin)',
          }}
        >
          {filter === 'favorites' ? 'No favorites yet' : 'No routines'}
        </li>
      )}
    </ul>
  </div>
);

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
        style={{ padding: 'min(16px, 4cqmin)', gap: 'min(14px, 3.5cqmin)' }}
      >
        <span
          className="rounded-full flex items-center justify-center shrink-0"
          style={{
            width: 'min(96px, 24cqmin)',
            height: 'min(96px, 24cqmin)',
            backgroundColor: color.tint,
            color: color.ink,
          }}
        >
          <RoutineIcon
            name={step.icon}
            style={{ width: '50%', height: '50%' }}
          />
        </span>
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
          style={{ fontSize: 'min(34px, 8.5cqmin)' }}
        >
          {step.text}
        </p>
        <LaunchButton step={step} size="lg" />
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

const AllStepsView: React.FC<{
  steps: RoutineGuideStep[];
  index: number;
  onMove: (i: number) => void;
}> = ({ steps, index, onMove }) => (
  <ol className="h-full w-full overflow-y-auto custom-scrollbar pb-2">
    {steps.map((step, i) => {
      const color = getRoutineGuideColor(step.color);
      const current = i === index;
      return (
        <li key={step.id}>
          <div
            role="button"
            tabIndex={0}
            aria-current={current ? 'step' : undefined}
            onClick={() => onMove(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onMove(i);
              }
            }}
            className={`flex items-center cursor-pointer transition-colors ${
              current ? 'bg-slate-900/[0.06]' : 'hover:bg-slate-900/[0.03]'
            }`}
            style={{
              gap: 'min(12px, 3cqmin)',
              padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
            }}
          >
            <span
              className={`shrink-0 tabular-nums text-right ${
                current
                  ? 'font-black text-slate-900'
                  : 'font-bold text-slate-400'
              }`}
              style={{ fontSize: 'min(16px, 5cqmin)', width: '1.5em' }}
            >
              {i + 1}
            </span>
            <span
              className="shrink-0 rounded-full flex items-center justify-center"
              style={{
                width: 'min(36px, 10cqmin)',
                height: 'min(36px, 10cqmin)',
                backgroundColor: color.tint,
                color: color.ink,
              }}
            >
              <RoutineIcon
                name={step.icon}
                style={{ width: '55%', height: '55%' }}
              />
            </span>
            <span className="flex-1 min-w-0">
              {step.label && (
                <span
                  className="block font-black uppercase tracking-wider"
                  style={{ fontSize: 'min(11px, 3.5cqmin)', color: color.ink }}
                >
                  {step.label}
                </span>
              )}
              <span
                className={`block leading-snug ${
                  current
                    ? 'font-bold text-slate-900'
                    : 'font-medium text-slate-600'
                }`}
                style={{ fontSize: 'min(16px, 5cqmin)' }}
              >
                {step.text}
              </span>
            </span>
            <LaunchButton step={step} size="sm" />
          </div>
        </li>
      );
    })}
  </ol>
);

export const RoutineGuideWidget: React.FC<WidgetComponentProps> = ({
  widget,
}) => {
  const { updateWidget } = useDashboardActions();
  const {
    featurePermissions,
    userGradeLevels,
    savedWidgetPresets,
    saveWidgetPreset,
  } = useAuth();
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
    () => sortRoutinesByName(resolveRoutineGuideLibrary(globalConfig)),
    [globalConfig]
  );

  const visible = useMemo(() => {
    if (filter === 'favorites')
      return library.filter((r) => favorites.includes(r.id));
    if (filter === 'grade' && userGradeLevels.length > 0)
      return library.filter((r) =>
        r.gradeLevels.some((g) => userGradeLevels.includes(g))
      );
    return library;
  }, [library, filter, favorites, userGradeLevels]);

  const update = (patch: Partial<RoutineGuideConfig>) =>
    updateWidget(widget.id, { config: { ...config, ...patch } });

  const routine = config.selectedRoutineId
    ? library.find((r) => r.id === config.selectedRoutineId)
    : undefined;

  if (!routine || routine.steps.length === 0) {
    return (
      <WidgetLayout
        padding="p-0"
        contentClassName="flex-1 min-h-0"
        content={
          <RoutineLibrary
            routines={visible}
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

  return (
    <WidgetLayout
      padding="p-0"
      contentClassName="flex-1 min-h-0"
      header={
        <div
          className="flex items-center border-b border-slate-200"
          style={{
            gap: 'min(10px, 2.5cqmin)',
            padding: `min(8px, 2cqmin) ${CORNER_CLEARANCE}`,
          }}
        >
          <button
            type="button"
            aria-label="All routines"
            onClick={() => update({ selectedRoutineId: null, stepIndex: 0 })}
            className="shrink-0 rounded-md text-slate-500 hover:bg-slate-900/5 hover:text-slate-800 transition-colors"
            style={{ padding: 'min(6px, 1.5cqmin)' }}
          >
            <ArrowLeft
              style={{
                width: 'min(18px, 5cqmin)',
                height: 'min(18px, 5cqmin)',
              }}
            />
          </button>
          <RoutineIcon
            name={routine.icon}
            className="shrink-0"
            style={{
              width: 'min(18px, 5cqmin)',
              height: 'min(18px, 5cqmin)',
              color: routineColor.ink,
            }}
          />
          <h3
            className="flex-1 min-w-0 truncate font-black text-slate-800"
            style={{ fontSize: 'min(16px, 5cqmin)' }}
          >
            {routine.name}
          </h3>
          <div
            role="group"
            aria-label="Step view"
            className="shrink-0 flex rounded-lg border border-slate-200 bg-white"
            style={{ padding: 'min(2px, 0.5cqmin)', gap: 'min(2px, 0.5cqmin)' }}
          >
            <button
              type="button"
              aria-label="Current step"
              aria-pressed={view === 'step'}
              onClick={() => update({ view: 'step' })}
              className={viewBtn(view === 'step')}
              style={{ padding: 'min(5px, 1.25cqmin)' }}
            >
              <RectangleHorizontal
                style={{
                  width: 'min(16px, 4.5cqmin)',
                  height: 'min(16px, 4.5cqmin)',
                }}
              />
            </button>
            <button
              type="button"
              aria-label="All steps"
              aria-pressed={view === 'all'}
              onClick={() => update({ view: 'all' })}
              className={viewBtn(view === 'all')}
              style={{ padding: 'min(5px, 1.25cqmin)' }}
            >
              <List
                style={{
                  width: 'min(16px, 4.5cqmin)',
                  height: 'min(16px, 4.5cqmin)',
                }}
              />
            </button>
          </div>
        </div>
      }
      content={
        view === 'all' ? (
          <AllStepsView
            steps={routine.steps}
            index={stepIndex}
            onMove={(i) => update({ stepIndex: i })}
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
  );
};
