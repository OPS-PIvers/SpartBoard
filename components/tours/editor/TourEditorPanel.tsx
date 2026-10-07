import React, { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  GripVertical,
  LayoutDashboard,
  Loader2,
  MousePointerClick,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  GuidedLearningStep,
  GuidedLearningTourAction,
  TourWidgetLayout,
} from '@/types';
import { Z_INDEX } from '@/config/zIndex';
import { WHOLE_BOARD_ANCHOR } from '@/config/tourAnchors';
import { DashboardContext } from '@/context/DashboardContextValue';
import { DialogContext } from '@/context/DialogContextValue';
import { useTourHidden } from '@/context/dashboardCanvasStore';
import { teacherMustClick } from '@/components/tours/tourSession';
import {
  iconBtn,
  primaryBtn,
  secondaryBtn,
} from '@/components/tours/tourButtons';
import {
  boardLayoutOf,
  buildRecordedLayouts,
} from '@/components/widgets/GuidedLearning/components/recorder/recordedLayouts';
import { MAX_TYPED_CHARS } from '@/components/widgets/GuidedLearning/components/recorder/useTourCapture';
import type { TourEditPlayback } from './tourEditStore';
import {
  PANEL_EDGE,
  PANEL_WIDTH,
  RAIL_WIDTH,
  TOUR_EDITOR_COLLAPSED_KEY,
  TOUR_EDITOR_SIDE_KEY,
  panelSide,
  readStored,
  writeStored,
  type Side,
} from './panelPlacement';
import type { TourEditorSession } from './useTourEditorSession';
import { TourAnchorPicker } from './TourAnchorPicker';
import { TourAnchorList } from './TourAnchorList';
import { applyAnchorPick, type TourAnchorPick } from './pickAnchor';
import {
  TOUR_ACTIONS,
  isRedStatus,
  tourControlLabel,
  tourStepStatus,
  withAction,
  type TourStepStatus,
} from './stepStatus';

const inputClass =
  'w-full rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm font-normal text-white placeholder:text-slate-400 [color-scheme:dark] focus:border-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40';
const labelClass = 'flex flex-col gap-1 text-xs font-semibold text-slate-300';

interface TourEditorPanelProps {
  session: TourEditorSession;
  playback: TourEditPlayback;
  readAloud: { on: boolean; onToggle: () => void };
  onClose: () => void;
  /** The Settings tab's body; the tab shows only when given. */
  settings?: React.ReactNode;
  /** Harness: starts collapsed or on a side regardless of what was remembered. */
  initialCollapsed?: boolean;
  initialSide?: Side;
}

/** The board editor's docked outline: every step, the selected one open for editing. */
export const TourEditorPanel: React.FC<TourEditorPanelProps> = ({
  session,
  playback,
  readAloud,
  onClose,
  settings,
  initialCollapsed,
  initialSide,
}) => {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(
    () => initialCollapsed ?? readStored(TOUR_EDITOR_COLLAPSED_KEY) === 'true'
  );
  const [preferred, setPreferred] = useState<Side>(
    () =>
      initialSide ??
      (readStored(TOUR_EDITOR_SIDE_KEY) === 'left' ? 'left' : 'right')
  );
  const [tab, setTab] = useState<'steps' | 'settings'>('steps');
  // Which step is choosing its control, on the board or from the list.
  const [picking, setPicking] = useState<{
    stepId: string;
    from: 'board' | 'list';
  } | null>(null);
  const width = collapsed ? RAIL_WIDTH : PANEL_WIDTH;
  const side = panelSide(
    preferred,
    playback.rect,
    typeof window === 'undefined' ? 0 : window.innerWidth,
    width
  );
  const { set, selected } = session;
  const total = set.steps.length;
  const pickingStep = picking
    ? set.steps.find((s) => s.id === picking.stepId)
    : undefined;
  const bindPick = (pick: TourAnchorPick) => {
    if (pickingStep)
      session.setBinding(
        pickingStep.id,
        applyAnchorPick(pickingStep.tour, pick)
      );
    setPicking(null);
  };
  const addStep = () => {
    const created = session.insertStepAfter(set.steps[selected]?.id ?? null);
    setPicking({ stepId: created.id, from: 'board' });
  };

  const toggleCollapsed = () => {
    setCollapsed((was) => {
      writeStored(TOUR_EDITOR_COLLAPSED_KEY, String(!was));
      return !was;
    });
  };
  const swapSide = () => {
    const next: Side = side === 'right' ? 'left' : 'right';
    setPreferred(next);
    writeStored(TOUR_EDITOR_SIDE_KEY, next);
  };

  const back = selected > 0 ? () => session.select(selected - 1) : undefined;
  const next =
    selected + 1 < total ? () => session.select(selected + 1) : undefined;

  const frame: React.CSSProperties = {
    zIndex: Z_INDEX.tourCallout,
    width,
    top: PANEL_EDGE,
    ...(collapsed ? {} : { bottom: PANEL_EDGE }),
    [side]: PANEL_EDGE,
  };
  const shell =
    'fixed flex flex-col overflow-hidden rounded-2xl border border-white/20 bg-slate-900/90 text-white shadow-2xl ring-1 ring-black/40 backdrop-blur-xl';
  const progress = t('tours.progress', {
    current: Math.min(selected + 1, total),
    total,
  });

  if (collapsed) {
    return (
      <aside
        aria-label={t('tours.editor.panel')}
        data-tour-ignore=""
        data-tour-obstacle=""
        data-click-outside-ignore="true"
        data-testid="tour-editor-panel"
        data-side={side}
        data-collapsed="true"
        onClick={(e) => e.stopPropagation()}
        className={`${shell} items-center gap-1 py-2`}
        style={frame}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={t('tours.editor.expand')}
          title={t('tours.editor.expand')}
          className={iconBtn}
        >
          {side === 'right' ? (
            <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronsRight className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        <span className="py-2 text-xs font-semibold tabular-nums text-slate-200">
          {Math.min(selected + 1, total)}/{total}
        </span>
        <button
          type="button"
          onClick={back}
          disabled={!back}
          aria-label={t('tours.back')}
          className={`${iconBtn} disabled:opacity-40`}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={next}
          disabled={!next}
          aria-label={t('tours.next')}
          className={`${iconBtn} disabled:opacity-40`}
        >
          <ChevronLeft className="h-4 w-4 rotate-180" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('tours.editor.close')}
          title={t('tours.editor.close')}
          className={iconBtn}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label={t('tours.editor.panel')}
      data-tour-ignore=""
      data-tour-obstacle=""
      data-click-outside-ignore="true"
      data-testid="tour-editor-panel"
      data-side={side}
      onClick={(e) => e.stopPropagation()}
      className={shell}
      style={frame}
    >
      <header className="flex flex-col gap-0.5 border-b border-white/10 px-3 pb-2 pt-2.5">
        <div className="flex items-start gap-1">
          <h2 className="min-w-0 flex-1 break-words pt-1 text-sm font-semibold text-slate-100">
            {set.title.trim() || t('tours.welcomeTitle')}
          </h2>
          <button
            type="button"
            onClick={session.undo}
            disabled={!session.canUndo}
            aria-label={t('glStudio.undo')}
            title={t('glStudio.undo')}
            className={`${iconBtn} disabled:opacity-40`}
          >
            <Undo2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={session.redo}
            disabled={!session.canRedo}
            aria-label={t('glStudio.redo')}
            title={t('glStudio.redo')}
            className={`${iconBtn} disabled:opacity-40`}
          >
            <Redo2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-pressed={readAloud.on}
            onClick={readAloud.onToggle}
            aria-label={t('glPlayer.readAloud')}
            title={t('glPlayer.readAloud')}
            className={iconBtn}
          >
            {readAloud.on ? (
              <Volume2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <VolumeX className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={swapSide}
            aria-label={t('tours.editor.swapSide')}
            title={t('tours.editor.swapSide')}
            className={iconBtn}
          >
            {side === 'right' ? (
              <PanelLeft className="h-4 w-4" aria-hidden="true" />
            ) : (
              <PanelRight className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={t('tours.editor.collapse')}
            title={t('tours.editor.collapse')}
            className={iconBtn}
          >
            {side === 'right' ? (
              <ChevronsRight className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('tours.editor.close')}
            title={t('tours.editor.close')}
            className={iconBtn}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <SaveLine state={session.saveState} />
      </header>
      {settings && (
        <div
          role="tablist"
          className="flex gap-1 border-b border-white/10 px-2 py-1.5"
        >
          {(['steps', 'settings'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                tab === id
                  ? 'bg-white/15 text-white'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              {t(`tours.editor.tab_${id}`)}
            </button>
          ))}
        </div>
      )}
      {tab === 'settings' && settings ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3">
          {settings}
        </div>
      ) : (
        <>
          {pickingStep && picking?.from === 'list' ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-300">
                  {t('tourPicker.listTitle')}
                </span>
                <button
                  type="button"
                  onClick={() => setPicking(null)}
                  className={secondaryBtn}
                >
                  {t('tourPicker.cancel')}
                </button>
              </div>
              <TourAnchorList
                value={pickingStep.tour?.anchor}
                onPick={bindPick}
              />
            </div>
          ) : (
            <>
              <StepOutline
                session={session}
                playback={playback}
                onPick={(stepId) => setPicking({ stepId, from: 'board' })}
              />
              <button
                type="button"
                onClick={addStep}
                className="flex items-center gap-2 border-t border-white/10 px-3 py-2 text-left text-sm font-semibold text-slate-200 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('tourPicker.addStep')}
              </button>
            </>
          )}
          {pickingStep && picking?.from === 'board' && (
            <TourAnchorPicker
              slots={playback.slots}
              onPick={bindPick}
              onCancel={() => setPicking(null)}
              onChooseFromList={() =>
                setPicking({ stepId: pickingStep.id, from: 'list' })
              }
            />
          )}
          <footer className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
            <span className="flex-1 text-xs font-semibold tabular-nums text-slate-300">
              {progress}
            </span>
            <button
              type="button"
              onClick={back}
              disabled={!back}
              className={`${secondaryBtn} flex items-center gap-1 pl-2 disabled:opacity-40`}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {t('tours.back')}
            </button>
            <button
              type="button"
              onClick={next}
              disabled={!next}
              className={`${primaryBtn} disabled:opacity-40`}
            >
              {t('tours.next')}
            </button>
          </footer>
        </>
      )}
    </aside>
  );
};

const SaveLine: React.FC<{ state: TourEditorSession['saveState'] }> = ({
  state,
}) => {
  const { t } = useTranslation();
  if (state === 'conflict' || state === 'error') {
    return (
      <p
        role="alert"
        className="flex items-start gap-1 text-xs font-semibold text-red-300"
      >
        <AlertTriangle
          className="mt-px h-3.5 w-3.5 shrink-0"
          aria-hidden="true"
        />
        {t(
          state === 'conflict'
            ? 'tours.editor.saveConflict'
            : 'tours.editor.saveFailed'
        )}
      </p>
    );
  }
  return (
    <p aria-live="polite" className="text-xs text-slate-300">
      {t(state === 'saving' ? 'common.saving' : 'common.saved')}
    </p>
  );
};

const StepOutline: React.FC<{
  session: TourEditorSession;
  playback: TourEditPlayback;
  onPick: (stepId: string) => void;
}> = ({ session, playback, onPick }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const { steps } = session.set;
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const to = steps.findIndex((s) => s.id === over.id);
    if (to >= 0) session.moveStep(String(active.id), to);
  };
  const { t } = useTranslation();
  if (steps.length === 0) {
    return (
      <p className="flex-1 px-3 py-4 text-sm text-slate-300">
        {t('tours.editor.empty')}
      </p>
    );
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={steps.map((s) => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <ol
          data-testid="tour-editor-outline"
          className="min-h-0 flex-1 divide-y divide-white/10 overflow-y-auto pb-3"
        >
          {steps.map((step, i) => (
            <OutlineRow
              key={step.id}
              step={step}
              index={i}
              selected={i === session.selected}
              status={tourStepStatus(step, playback.missing)}
              jumping={i === session.selected && playback.jumping}
              waiting={
                i === playback.index && playback.jumping && playback.blocked
              }
              session={session}
              onPick={onPick}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
};

const OutlineRow: React.FC<{
  step: GuidedLearningStep;
  index: number;
  selected: boolean;
  status: TourStepStatus;
  jumping: boolean;
  /** A fast-forward is stopped here for the admin's click. */
  waiting: boolean;
  session: TourEditorSession;
  onPick: (stepId: string) => void;
}> = ({ step, index, selected, status, jumping, waiting, session, onPick }) => {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });
  const control = tourControlLabel(step.tour);
  const label = step.label?.trim();
  const title =
    [label, control].find((part) => !!part) ?? t('tours.editor.untitled');
  const red = isRedStatus(status);
  const subtitle = waiting
    ? t('tours.editor.youClick')
    : jumping
      ? t('tours.editor.jumping')
      : status === 'missing'
        ? t('tours.editor.missing')
        : status === 'unregistered'
          ? t('tours.editor.unregistered')
          : status === 'unbound'
            ? t('tours.editor.unbound')
            : status === 'board'
              ? t('tours.editor.wholeBoard')
              : label
                ? control
                : null;
  return (
    <li
      ref={setNodeRef}
      data-testid="tour-editor-step"
      data-step-id={step.id}
      data-status={status}
      aria-current={selected ? 'step' : undefined}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`group ${selected ? 'bg-white/[0.07]' : ''} ${
        isDragging ? 'relative z-10 bg-slate-800' : ''
      }`}
    >
      <div className="flex items-start">
        <button
          type="button"
          onClick={() => session.select(index)}
          className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2 text-left hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
        >
          <span className="w-5 shrink-0 pt-px text-right text-xs font-semibold tabular-nums text-slate-300">
            {index + 1}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className={`break-words text-sm ${
                selected ? 'font-semibold text-white' : 'text-slate-100'
              }`}
            >
              {title}
            </span>
            {subtitle && (
              <span
                className={`flex items-start gap-1 text-xs ${
                  waiting
                    ? 'font-semibold text-white'
                    : red && !jumping
                      ? 'font-semibold text-red-300'
                      : 'text-slate-300'
                }`}
              >
                {waiting && (
                  <MousePointerClick
                    className="mt-0.5 h-3 w-3 shrink-0"
                    aria-hidden="true"
                  />
                )}
                {jumping && (
                  <Loader2
                    className="mt-0.5 h-3 w-3 shrink-0 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                )}
                {red && !jumping && !waiting && (
                  <AlertTriangle
                    className="mt-0.5 h-3 w-3 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0 break-words">{subtitle}</span>
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t('tours.editor.reorder', { n: index + 1 })}
          title={t('tours.editor.reorder', { n: index + 1 })}
          className="mr-1 mt-1.5 cursor-grab touch-none rounded-md p-1 text-slate-400 opacity-0 hover:bg-white/10 hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 active:cursor-grabbing group-hover:opacity-100"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {selected && (
        <StepCard
          step={step}
          session={session}
          onPick={() => onPick(step.id)}
        />
      )}
    </li>
  );
};

/** The selected step's fields, under its outline row. */
const StepCard: React.FC<{
  step: GuidedLearningStep;
  session: TourEditorSession;
  onPick: () => void;
}> = ({ step, session, onPick }) => {
  const { t } = useTranslation();
  const tour = step.tour;
  const update = (patch: Partial<GuidedLearningStep>, field?: string) =>
    session.updateStep(step.id, patch, field);
  const bind = (next: NonNullable<GuidedLearningStep['tour']>) =>
    session.setBinding(step.id, next);
  return (
    <div
      data-testid="tour-editor-card"
      className="flex flex-col gap-3 px-3 pb-3 pl-[42px] pt-1"
    >
      <label className={labelClass}>
        {t('glStudio.stepTitle')}
        <input
          type="text"
          value={step.label ?? ''}
          onChange={(e) => update({ label: e.target.value }, 'label')}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        {t('glStudio.stepText')}
        <textarea
          rows={3}
          value={step.text ?? ''}
          onChange={(e) => update({ text: e.target.value }, 'text')}
          className={`${inputClass} resize-y`}
        />
      </label>
      <div className={labelClass}>
        {t('tourPicker.control')}
        <div className="flex items-start gap-2">
          <span
            data-testid="tour-editor-control"
            className="min-w-0 flex-1 break-words pt-1 text-sm font-normal text-slate-100"
          >
            {tour?.anchor === WHOLE_BOARD_ANCHOR || !tour
              ? t('tourPicker.wholeBoard')
              : (tourControlLabel(tour) ?? t('tours.editor.unbound'))}
          </span>
          <button
            type="button"
            onClick={onPick}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
            {t('tourPicker.pick')}
          </button>
        </div>
      </div>
      {tour && (
        <label className={labelClass}>
          {t('glStudio.tourAction')}
          <select
            value={tour.action}
            onChange={(e) =>
              bind(withAction(tour, e.target.value as GuidedLearningTourAction))
            }
            className={inputClass}
          >
            {TOUR_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {t(`glStudio.tourAction_${action}`)}
              </option>
            ))}
          </select>
        </label>
      )}
      {tour?.action === 'toggle' && (
        <label className={labelClass}>
          {t('glStudio.tourValueToggle')}
          <select
            value={tour.value === false ? 'off' : 'on'}
            onChange={(e) => bind({ ...tour, value: e.target.value === 'on' })}
            className={inputClass}
          >
            <option value="on">{t('glStudio.tourValueOn')}</option>
            <option value="off">{t('glStudio.tourValueOff')}</option>
          </select>
        </label>
      )}
      {(tour?.action === 'select' || tour?.action === 'type') && (
        <label className={labelClass}>
          {t(
            tour.action === 'type'
              ? 'glStudio.tourValueType'
              : 'glStudio.tourValueSelect'
          )}
          <input
            type="text"
            value={typeof tour.value === 'string' ? tour.value : ''}
            maxLength={MAX_TYPED_CHARS}
            onChange={(e) => bind({ ...tour, value: e.target.value })}
            className={inputClass}
          />
        </label>
      )}
      {tour?.action === 'click' && (
        <label className="flex items-center gap-2 text-sm text-slate-100">
          <input
            type="checkbox"
            checked={teacherMustClick(tour, 'destructive-only')}
            onChange={(e) =>
              bind({ ...tour, teacherMustClick: e.target.checked })
            }
            className="h-4 w-4 shrink-0 rounded border-white/30 accent-white"
          />
          {t('glStudio.tourTeacherMustClick')}
        </label>
      )}
      <div className="flex flex-wrap items-center justify-between gap-1 pt-1">
        <CaptureLayoutButton
          onCapture={(layouts) =>
            session.updateSet({
              tourSetup: {
                ...session.set.tourSetup,
                widgets: session.set.tourSetup?.widgets ?? [],
                layouts,
              },
            })
          }
        />
        <button
          type="button"
          onClick={() => session.deleteStep(step.id)}
          className="-mr-2 flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t('glStudio.deleteStep')}
        </button>
      </div>
    </div>
  );
};

/** Records the widgets now on the stage as the tour's layout, after a confirm. */
const CaptureLayoutButton: React.FC<{
  onCapture: (layouts: TourWidgetLayout[]) => void;
}> = ({ onCapture }) => {
  const { t } = useTranslation();
  const dialog = useContext(DialogContext);
  const hidden = useTourHidden();
  const board = (
    useContext(DashboardContext)?.activeDashboard?.widgets ?? []
  ).filter((w) => !hidden.has(w.id));
  const capture = async () => {
    if (board.length === 0) return;
    const message = t('glStudio.tourLayoutConfirm');
    const ok = dialog
      ? await dialog.showConfirm(message, {
          title: t('glStudio.tourLayoutCapture'),
          confirmLabel: t('glStudio.tourLayoutCaptureConfirm'),
        })
      : window.confirm(message);
    if (ok) onCapture(buildRecordedLayouts(boardLayoutOf(board), []).layouts);
  };
  return (
    <button
      type="button"
      onClick={() => void capture()}
      disabled={board.length === 0}
      title={t('glStudio.tourLayoutHint')}
      className="-ml-2 flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
    >
      <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
      {t('glStudio.tourLayoutCapture')}
    </button>
  );
};
