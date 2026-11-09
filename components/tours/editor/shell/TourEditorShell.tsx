import React from 'react';
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
  Check,
  Circle,
  GripVertical,
  Loader2,
  MousePointerClick,
  PenLine,
  Play,
  Plus,
  Redo2,
  ScanSearch,
  Send,
  Undo2,
} from 'lucide-react';
import { tourAttr } from '@/config/tourAnchors';
import { secondaryBtn } from '@/components/tours/tourButtons';
import {
  focusRing,
  headerBar,
  headerIconBtn,
  warnChip,
} from '@/components/common/lightChrome';
import { TourShellMenu } from './TourShellMenu';
import type { TourBlocker, TourMainState } from './tourMainAction';
import type { TourShellAdapter, TourShellStep } from './types';

const MAIN_ICON: Record<TourMainState, typeof Play> = {
  write: PenLine,
  check: ScanSearch,
  publish: Send,
  published: Check,
};

const blockerText = (
  blocker: TourBlocker,
  t: ReturnType<typeof useTranslation>['t']
): string => {
  switch (blocker.kind) {
    case 'no-steps':
      return t('tours.shell.blocker_noSteps');
    case 'needs-text':
      return t('tours.shell.blocker_needsText', { count: blocker.count });
    case 'check-needed':
      return t('tours.shell.blocker_checkNeeded');
    case 'checking':
      return t('tours.shell.blocker_checking');
    case 'other':
      return blocker.label;
  }
};

/** Saved state, Draft / Published / Changed since publish, and the one thing in the way. */
export const TourShellStatus: React.FC<{ adapter: TourShellAdapter }> = ({
  adapter,
}) => {
  const { t } = useTranslation();
  const { saveState, publish, main } = adapter;
  const parts: string[] = [];
  if (publish) parts.push(t(`tours.shell.status_${publish}`));
  if (main.blocker) parts.push(blockerText(main.blocker, t));
  return (
    <p
      aria-live="polite"
      data-testid="tour-shell-status"
      className="flex min-w-0 items-center gap-1.5 text-xs text-[#c3cae6]"
    >
      {saveState === 'conflict' || saveState === 'error' ? null : (
        <>
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              saveState === 'saving' ? 'bg-[#c3cae6]' : 'bg-green-400'
            }`}
          />
          <span className="shrink-0">
            {t(saveState === 'saving' ? 'common.saving' : 'common.saved')}
          </span>
        </>
      )}
      {parts.map((part, i) => (
        <span
          key={part}
          className={`min-w-0 truncate ${
            i === parts.length - 1 && main.blocker ? 'text-amber-200' : ''
          }`}
        >
          <span aria-hidden="true" className="mr-1.5">
            ·
          </span>
          {part}
        </span>
      ))}
    </p>
  );
};

/** The main button: Write text, Check tour, Publish, then Published. */
export const TourShellMainButton: React.FC<{ adapter: TourShellAdapter }> = ({
  adapter,
}) => {
  const { t } = useTranslation();
  const { main, publishing, publish } = adapter;
  const Icon = publishing ? Loader2 : MAIN_ICON[main.state];
  const label = publishing
    ? t('tours.shell.main_publishing')
    : main.state === 'publish' && publish === 'changed'
      ? t('tours.shell.main_republish')
      : t(`tours.shell.main_${main.state}`);
  return (
    <button
      type="button"
      data-testid="tour-shell-main"
      data-state={main.state}
      disabled={main.disabled || publishing}
      onClick={() => adapter.onMain(main.state)}
      className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-brand-blue-dark hover:bg-brand-blue-lighter focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed ${
        main.state === 'published'
          ? 'disabled:bg-white/10 disabled:text-[#c3cae6]'
          : 'disabled:opacity-50'
      }`}
      {...tourAttr('tour-editor.main')}
    >
      <Icon
        className={`h-4 w-4 shrink-0 ${
          publishing ? 'animate-spin motion-reduce:animate-none' : ''
        }`}
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
    </button>
  );
};

/** Title, status line, Play, the main button and ⋯; `chrome` holds the window's own buttons. */
export const TourShellHeader: React.FC<{
  adapter: TourShellAdapter;
  chrome?: React.ReactNode;
  alert?: React.ReactNode;
}> = ({ adapter, chrome, alert }) => {
  const { t } = useTranslation();
  const { undo } = adapter;
  return (
    <header
      data-testid="tour-shell-header"
      className={`flex flex-col gap-1.5 px-3 pb-2.5 pt-2.5 ${headerBar}`}
    >
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <TourShellStatus adapter={adapter} />
        </div>
        {undo && (
          <>
            <button
              type="button"
              onClick={undo.onUndo}
              disabled={!undo.canUndo}
              aria-label={t('glStudio.undo')}
              title={t('glStudio.undo')}
              className={`${headerIconBtn} disabled:opacity-40`}
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={undo.onRedo}
              disabled={!undo.canRedo}
              aria-label={t('glStudio.redo')}
              title={t('glStudio.redo')}
              className={`${headerIconBtn} disabled:opacity-40`}
            >
              <Redo2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        )}
        {chrome}
      </div>
      <h2 className="wrap-break-word text-sm font-semibold text-white">
        {adapter.title.trim() || t('tours.welcomeTitle')}
      </h2>
      {alert}
      <div className="mt-0.5 flex items-center gap-1.5">
        {adapter.onPlay && (
          <button
            type="button"
            onClick={adapter.onPlay}
            disabled={adapter.playDisabled}
            title={adapter.playHint}
            data-testid="tour-shell-play"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-white/20 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-40"
            {...tourAttr('tour-editor.play')}
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            {t('tours.shell.play')}
          </button>
        )}
        <TourShellMainButton adapter={adapter} />
        <TourShellMenu items={adapter.menu} footer={adapter.menuFooter} />
      </div>
    </header>
  );
};

/** Where steps are added: Add step and Record steps, plus a kind's extra (Live: Pause). */
export const TourShellOutlineFoot: React.FC<{
  adapter: TourShellAdapter;
  extra?: React.ReactNode;
}> = ({ adapter, extra }) => {
  const { t } = useTranslation();
  if (!adapter.onAddStep && !adapter.onRecord && !extra) return null;
  return (
    <div
      data-testid="tour-shell-outline-foot"
      className="flex items-center gap-1 border-t border-slate-200 bg-slate-50 px-1.5 py-1"
    >
      {adapter.onAddStep && (
        <button
          type="button"
          onClick={adapter.onAddStep}
          className={`${secondaryBtn} flex items-center gap-1.5`}
          {...tourAttr('tour-editor.add-step')}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('tourPicker.addStep')}
        </button>
      )}
      {adapter.onRecord && (
        <button
          type="button"
          onClick={adapter.onRecord}
          aria-pressed={adapter.recording}
          className={`${secondaryBtn} flex items-center gap-1.5`}
          {...tourAttr('tour-editor.record')}
        >
          <Circle className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          {adapter.recordLabel ?? t('tourPicker.recordFromHere')}
        </button>
      )}
      {extra}
    </div>
  );
};

/** Every step, the selected one open as its card; rows drag to reorder when the kind allows. */
export const TourShellOutline: React.FC<{ adapter: TourShellAdapter }> = ({
  adapter,
}) => {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const { steps, onMove } = adapter;
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || !onMove) return;
    const to = steps.findIndex((s) => s.id === over.id);
    if (to >= 0) onMove(String(active.id), to);
  };
  if (steps.length === 0) {
    return (
      <p className="flex-1 px-3 py-4 text-sm text-slate-500">
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
          className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto pb-3"
        >
          {steps.map((step, i) => (
            <OutlineRow
              key={step.id}
              step={step}
              index={i}
              selected={i === adapter.selected}
              adapter={adapter}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
};

const SUBTITLE_TONE: Record<
  NonNullable<TourShellStep['subtitle']>['tone'],
  string
> = {
  muted: 'text-slate-500',
  action: 'font-semibold text-brand-blue-primary',
  error: 'font-semibold text-brand-red-primary',
  warn: `mt-0.5 self-start py-0.5 font-semibold ${warnChip}`,
  busy: 'text-slate-500',
};

const OutlineRow: React.FC<{
  step: TourShellStep;
  index: number;
  selected: boolean;
  adapter: TourShellAdapter;
}> = ({ step, index, selected, adapter }) => {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id, disabled: !adapter.onMove });
  const sub = step.subtitle;
  return (
    <li
      ref={setNodeRef}
      data-testid="tour-editor-step"
      data-step-id={step.id}
      data-status={step.status}
      aria-current={selected ? 'step' : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group ${
        selected
          ? 'border-b border-[#d5daec] bg-brand-blue-lighter shadow-[inset_3px_0_0_#2d3f89]'
          : ''
      } ${isDragging ? 'relative z-10 bg-white shadow-lg' : ''}`}
    >
      <div className="flex items-start">
        <button
          type="button"
          onClick={() => adapter.onSelect(index)}
          className={`flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue-primary/50 ${
            selected ? '' : 'hover:bg-slate-50'
          }`}
        >
          <span
            className={`w-5 shrink-0 pt-px text-right text-xs font-semibold tabular-nums ${
              selected ? 'text-brand-blue-primary' : 'text-slate-400'
            }`}
          >
            {index + 1}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className={`wrap-break-word text-sm ${
                selected ? 'font-semibold text-slate-900' : 'text-slate-700'
              }`}
            >
              {step.title}
            </span>
            {sub && (
              <span
                className={`flex items-start gap-1 text-xs ${SUBTITLE_TONE[sub.tone]}`}
              >
                {sub.tone === 'action' && (
                  <MousePointerClick
                    className="mt-0.5 h-3 w-3 shrink-0"
                    aria-hidden="true"
                  />
                )}
                {sub.tone === 'busy' && (
                  <Loader2
                    className="mt-0.5 h-3 w-3 shrink-0 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                )}
                {(sub.tone === 'error' || sub.tone === 'warn') && (
                  <AlertTriangle
                    className="mt-0.5 h-3 w-3 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0 wrap-break-word">{sub.text}</span>
              </span>
            )}
          </span>
        </button>
        {selected && adapter.rowAction?.(step.id)}
        {adapter.onMove && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={t('tours.editor.reorder', { n: index + 1 })}
            title={t('tours.editor.reorder', { n: index + 1 })}
            className={`mr-1 mt-1.5 cursor-grab touch-none rounded-md p-1 text-slate-400 opacity-0 hover:bg-slate-100 hover:text-slate-700 focus-visible:opacity-100 active:cursor-grabbing group-hover:opacity-100 touch:opacity-100 ${focusRing}`}
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {selected && adapter.renderCard(step.id, index)}
    </li>
  );
};
