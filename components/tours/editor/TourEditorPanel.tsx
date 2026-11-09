import React, { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeftRight,
  Camera,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCopy,
  LayoutDashboard,
  MousePointerClick,
  Pause,
  Play,
  Trash2,
  Volume2,
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
import {
  getTourLayoutOverrides,
  useTourHidden,
} from '@/context/dashboardCanvasStore';
import {
  teacherMustClick,
  type TourSlots,
} from '@/components/tours/tourSession';
import {
  iconBtn,
  primaryBtn,
  secondaryBtn,
} from '@/components/tours/tourButtons';
import {
  chromeHairline,
  chromeMuted,
  chromeSurface,
  focusRing,
  headerIconBtn,
} from '@/components/common/lightChrome';
import {
  boardLayoutOf,
  buildRecordedLayouts,
} from '@/components/widgets/GuidedLearning/components/recorder/recordedLayouts';
import { MAX_TYPED_CHARS } from '@/components/widgets/GuidedLearning/components/recorder/useTourCapture';
import {
  getTourEdit,
  getTourEditPlayback,
  replayTourEditFromStart,
  subscribeTourEditPlayback,
  resumeTourEdit,
  retakeTourEditThumbnail,
  setTourEditPaused,
  setTourEditPicking,
  setTourEditRecording,
  useTourEditTarget,
  type TourEditPlayback,
} from './tourEditStore';
import { bakeTourOverrides, captureStepStart } from './captureStepStart';
import { tourThumbnail } from '@/components/widgets/GuidedLearning/utils/liveTour';
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
import type { LiveTourPublish } from './useLiveTourPublish';
import { TourAnchorPicker } from './TourAnchorPicker';
import { RecordFromHere } from './RecordFromHere';
import { TourAnchorList } from './TourAnchorList';
import { ClaudeNoteField } from './ClaudeNoteField';
import { TourWidgetFields } from './TourWidgetFields';
import { TourConditionFields } from './TourConditionFields';
import { applyAnchorPick, type TourAnchorPick } from './pickAnchor';
import { bindWithStarterText, type ChoiceLabel } from './starterText';
import { asChoiceStep, nativeSelectOf, selectChoices } from './nativeSelect';
import {
  actionsFor,
  isRedStatus,
  tourControlLabel,
  tourStepStatus,
  withAction,
} from './stepStatus';
import {
  TourShellHeader,
  TourShellOutline,
  TourShellOutlineFoot,
} from './shell/TourEditorShell';
import { TourStepCard } from './shell/TourStepCard';
import {
  cardInput as inputClass,
  cardLabel as labelClass,
  focusStepTitle,
} from './shell/stepCardParts';
import { stepNeedsText, tourMainAction } from './shell/tourMainAction';
import type {
  TourShellAdapter,
  TourShellMenuItem,
  TourShellStep,
} from './shell/types';

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
  /** Copies a Claude connector prompt for the tour, or for one step; shown only when given. */
  onCopyForClaude?: (stepId?: string) => void;
  /** Publishing for the header's main button; without it the button waits. */
  publish?: LiveTourPublish;
  /** Playtest notes are open and the tour hasn't been played through since. */
  checkNeeded?: boolean;
}

/** The board editor: the shared tour editor shell docked over the real board. */
export const TourEditorPanel: React.FC<TourEditorPanelProps> = ({
  session,
  playback,
  readAloud,
  onClose,
  settings,
  initialCollapsed,
  initialSide,
  onCopyForClaude,
  publish,
  checkNeeded = false,
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
  const [picking, setPickingState] = useState<{
    stepId: string;
    from: 'board' | 'list';
  } | null>(null);
  // Picking on the board clears the tour off the stage so the control can be clicked.
  const setPicking = (next: typeof picking) => {
    setPickingState(next);
    setTourEditPicking(next?.from === 'board');
  };
  const editTarget = useTourEditTarget();
  const v2 = !!editTarget?.v2;
  const paused = !!editTarget?.paused;
  const dialogs = useContext(DialogContext);
  const dashboard = useContext(DashboardContext);
  const hiddenIds = useTourHidden();
  const pause = () => {
    setPicking(null);
    bakeTourOverrides(
      dashboard?.activeDashboard?.widgets ?? [],
      getTourLayoutOverrides(),
      (id, patch) => dashboard?.updateWidget(id, patch)
    );
    setTourEditPaused(true);
  };
  // Resuming can keep the arranged board as where this step starts.
  const resume = async () => {
    const step = set.steps[selected];
    const message = t('tours.editor.saveStartBody', { n: selected + 1 });
    const keep =
      !!step?.tour &&
      (dialogs
        ? await dialogs.showConfirm(message, {
            title: t('tours.editor.saveStartTitle'),
            confirmLabel: t('tours.editor.saveStart'),
            cancelLabel: t('tours.editor.justResume'),
          })
        : window.confirm(message));
    const draft = getTourEdit()?.set ?? set;
    if (!keep || !step?.tour) {
      resumeTourEdit();
      return;
    }
    const captured = captureStepStart({
      widgets: dashboard?.activeDashboard?.widgets ?? [],
      hidden: hiddenIds,
      overrides: getTourLayoutOverrides(),
      slots: playback.slots,
      set: draft,
      untitledLabel: t('tours.materials.madeInTour'),
    });
    if (captured.addedMaterial) {
      session.updateSet({
        tourSetup: {
          ...draft.tourSetup,
          widgets: draft.tourSetup?.widgets ?? [],
          materials: [
            ...(draft.tourSetup?.materials ?? []),
            captured.addedMaterial,
          ],
        },
      });
    }
    session.setBinding(step.id, { ...step.tour, start: captured.start });
    resumeTourEdit(captured.slots);
  };
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
      session.updateStep(
        pickingStep.id,
        bindWithStarterText(
          pickingStep,
          asChoiceStep(applyAnchorPick(pickingStep.tour, pick), playback.slots)
        )
      );
    setPicking(null);
  };
  const addStep = () => {
    const created = session.insertStepAfter(set.steps[selected]?.id ?? null);
    setPicking({ stepId: created.id, from: 'board' });
  };
  // The step new recorded clicks go after; the panel steps aside while recording.
  const [recording, setRecording] = useState<{ afterId: string | null } | null>(
    null
  );
  const startRecording = () => {
    setPicking(null);
    setTourEditRecording(true);
    setRecording({ afterId: set.steps[selected]?.id ?? null });
  };
  const endRecording = () => {
    setTourEditRecording(false);
    setRecording(null);
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
  const shell = `fixed flex flex-col overflow-hidden rounded-2xl ${chromeSurface}`;
  const progress = t('tours.progress', {
    current: Math.min(selected + 1, total),
    total,
  });

  if (recording) {
    return (
      <RecordFromHere
        slots={playback.slots}
        goal={set.title}
        onDone={(steps, imagePaths) => {
          endRecording();
          session.insertStepsAfter(recording.afterId, steps, imagePaths);
        }}
        onCancel={endRecording}
      />
    );
  }

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
        <span className="py-2 text-xs font-semibold tabular-nums text-slate-600">
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

  const main = tourMainAction({
    kind: 'live',
    stepCount: total,
    stepsWithoutText: set.steps.filter(stepNeedsText).length,
    publish: publish?.status ?? null,
    checkNeeded,
    busy: !!publish?.publishing,
  });
  const menu: TourShellMenuItem[] = [
    ...(onCopyForClaude
      ? [
          {
            id: 'copy-for-claude' as const,
            label: t('glStudio.copyForClaude'),
            icon: ClipboardCopy,
            onSelect: () => onCopyForClaude(),
          },
        ]
      : []),
    {
      id: 'read-aloud',
      label: t('glPlayer.readAloud'),
      icon: Volume2,
      pressed: readAloud.on,
      onSelect: readAloud.onToggle,
    },
    {
      id: 'swap-side',
      label: t('tours.editor.swapSide'),
      icon: ArrowLeftRight,
      onSelect: swapSide,
    },
  ];
  const adapter: TourShellAdapter = {
    kind: 'live',
    title: set.title,
    saveState: session.saveState,
    publish: publish?.status ?? null,
    publishing: publish?.publishing,
    main,
    onMain: (state) => {
      if (state === 'write') {
        const at = set.steps.findIndex(stepNeedsText);
        if (at < 0) return;
        setTab('steps');
        session.select(at);
        focusTitleOnArrival(set.steps[at].id, at);
      } else if (state === 'check') {
        setTab('steps');
        replayTourEditFromStart();
      } else if (state === 'publish') publish?.publish();
    },
    onPlay: () => {
      setTab('steps');
      setPicking(null);
      replayTourEditFromStart();
    },
    playDisabled: total === 0 || paused,
    playHint: t('tours.shell.playLiveHint'),
    menu,
    steps: set.steps.map((step, i) =>
      outlineStep(step, i, session.selected, playback, t)
    ),
    selected,
    onSelect: session.select,
    onMove: session.moveStep,
    renderCard: (stepId) => {
      const step = set.steps.find((s) => s.id === stepId);
      return step ? (
        <LiveStepCard
          step={step}
          session={session}
          slots={playback.slots}
          onPick={() => setPicking({ stepId, from: 'board' })}
        />
      ) : null;
    },
    rowAction: onCopyForClaude
      ? (stepId) => (
          <button
            type="button"
            onClick={() => onCopyForClaude(stepId)}
            aria-label={t('glStudio.copyForClaude')}
            title={t('glStudio.copyForClaude')}
            data-testid="tour-editor-step-copy-for-claude"
            className={`mt-1.5 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 ${focusRing}`}
          >
            <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
          </button>
        )
      : undefined,
    onAddStep: addStep,
    onRecord: startRecording,
    undo: {
      onUndo: session.undo,
      onRedo: session.redo,
      canUndo: session.canUndo,
      canRedo: session.canRedo,
    },
  };

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
      <TourShellHeader
        adapter={adapter}
        alert={<SaveAlert state={session.saveState} />}
        chrome={
          <>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={t('tours.editor.collapse')}
              title={t('tours.editor.collapse')}
              className={headerIconBtn}
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
              className={headerIconBtn}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        }
      />
      {publish && <PublishNotice publish={publish} />}
      {settings && (
        <div
          role="tablist"
          className="flex gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5"
        >
          {(['steps', 'settings'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${focusRing} ${
                tab === id
                  ? 'bg-white text-brand-blue-dark shadow-xs'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
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
              <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-600">
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
                slots={playback.slots}
              />
            </div>
          ) : (
            <>
              {paused && (
                <p
                  role="status"
                  className="border-b border-slate-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900"
                >
                  {t('tours.editor.pausedNote')}
                </p>
              )}
              <TourShellOutline adapter={adapter} />
              <TourShellOutlineFoot adapter={adapter} />
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
          <footer className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-2">
            {v2 && (
              <button
                type="button"
                onClick={paused ? () => void resume() : pause}
                aria-pressed={paused}
                title={t('tours.editor.pauseHint')}
                className={`${secondaryBtn} -ml-2 flex items-center gap-1 whitespace-nowrap px-2`}
              >
                {paused ? (
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {t(paused ? 'tours.editor.resume' : 'tours.editor.pause')}
              </button>
            )}
            <span
              title={progress}
              className={`flex-1 whitespace-nowrap text-xs font-semibold tabular-nums ${chromeMuted}`}
            >
              <span aria-hidden="true">
                {Math.min(selected + 1, total)} / {total}
              </span>
              <span className="sr-only">{progress}</span>
            </span>
            <button
              type="button"
              onClick={back}
              disabled={!back}
              aria-label={t('tours.back')}
              title={t('tours.back')}
              className={`${secondaryBtn} flex items-center px-2 disabled:opacity-40`}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={next}
              disabled={!next}
              className={`${primaryBtn} whitespace-nowrap disabled:opacity-40`}
            >
              {t('tours.next')}
            </button>
          </footer>
        </>
      )}
    </aside>
  );
};

/** Focuses the step's Title now and again once the runner shows it, since a new step's tip takes focus. */
const focusTitleOnArrival = (stepId: string, index: number): void => {
  focusStepTitle(stepId);
  const timer = { id: 0 };
  const stop = subscribeTourEditPlayback(() => {
    const pb = getTourEditPlayback();
    if (pb.index !== index || pb.jumping || pb.anchor === 'searching') return;
    stop();
    window.clearTimeout(timer.id);
    focusStepTitle(stepId);
  });
  timer.id = window.setTimeout(stop, 5000);
};

/** A Live step's outline row: its title, and what the runner last saw of it. */
const outlineStep = (
  step: GuidedLearningStep,
  index: number,
  selected: number,
  playback: TourEditPlayback,
  t: ReturnType<typeof useTranslation>['t']
): TourShellStep => {
  const status = tourStepStatus(step, playback.missing);
  const jumping = index === selected && playback.jumping;
  const waiting =
    index === playback.index && playback.jumping && playback.blocked;
  const control = tourControlLabel(step.tour);
  const label = step.label?.trim();
  const title =
    [label, control].find((part) => !!part) ?? t('tours.editor.untitled');
  const red = isRedStatus(status);
  const needsText = stepNeedsText(step);
  const warn = status === 'unbound' || needsText;
  const text = waiting
    ? t('tours.editor.youClick')
    : jumping
      ? t('tours.editor.jumping')
      : status === 'missing'
        ? t('tours.editor.missing')
        : status === 'unregistered'
          ? t('tours.editor.unregistered')
          : needsText
            ? [
                status === 'unbound' ? t('tours.editor.unbound') : null,
                t('tours.shell.needsText'),
              ]
                .filter(Boolean)
                .join(' · ')
            : status === 'unbound'
              ? t('tours.editor.unbound')
              : status === 'board'
                ? t('tours.editor.wholeBoard')
                : label
                  ? control
                  : null;
  return {
    id: step.id,
    title,
    titleIsFallback: !label,
    status,
    subtitle: text
      ? {
          text,
          tone: waiting
            ? 'action'
            : jumping
              ? 'busy'
              : red
                ? 'error'
                : warn
                  ? 'warn'
                  : 'muted',
        }
      : null,
  };
};

const SaveAlert: React.FC<{ state: TourEditorSession['saveState'] }> = ({
  state,
}) => {
  const { t } = useTranslation();
  if (state !== 'conflict' && state !== 'error') return null;
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
};

/** Under the header: broken links to confirm before publishing, or a failed publish. */
const PublishNotice: React.FC<{ publish: LiveTourPublish }> = ({ publish }) => {
  const { t } = useTranslation();
  if (publish.confirming)
    return (
      <div
        role="alert"
        data-testid="tour-editor-publish-confirm"
        className="flex flex-col gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-slate-900"
      >
        <p className="flex items-start gap-1.5 font-semibold">
          <AlertTriangle
            className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600"
            aria-hidden="true"
          />
          {t('glStudio.tourPublish.brokenTitle', {
            count: publish.broken.length,
          })}
        </p>
        <ul className="flex flex-col gap-0.5 pl-5 text-slate-600">
          {publish.broken.map(({ step, number, problem }) => (
            <li key={step.id} className="list-disc">
              {t('glStudio.tourPublish.brokenStep', {
                number,
                reason: t(`glStudio.tourPublish.problem_${problem}`),
              })}
            </li>
          ))}
        </ul>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={publish.publishAnyway}
            className={primaryBtn}
          >
            {t('glStudio.tourPublish.publishAnyway')}
          </button>
          <button
            type="button"
            onClick={publish.cancel}
            className={secondaryBtn}
          >
            {t('glStudio.tourPublish.cancel')}
          </button>
        </div>
      </div>
    );
  if (publish.failed)
    return (
      <p
        role="alert"
        className="border-b border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-brand-red-primary"
      >
        {t('glStudio.tourPublish.failed')}
      </p>
    );
  return null;
};

/** The selected Live step in the shared card: Title, Tip, its control and action; rare tools under More. */
const LiveStepCard: React.FC<{
  step: GuidedLearningStep;
  session: TourEditorSession;
  slots: TourSlots;
  onPick: () => void;
}> = ({ step, session, slots, onPick }) => {
  const { t } = useTranslation();
  const tour = step.tour;
  // A choice step on a native dropdown lists its real options instead of a raw value.
  const dropdown =
    tour?.action === 'select' ? nativeSelectOf(tour, slots) : null;
  const choices = dropdown ? selectChoices(dropdown) : [];
  const labelOf: ChoiceLabel = (value) =>
    choices.find((c) => c.value === value)?.label;
  const update = (patch: Partial<GuidedLearningStep>, field?: string) =>
    session.updateStep(step.id, patch, field);
  const bind = (next: NonNullable<GuidedLearningStep['tour']>) =>
    session.updateStep(step.id, bindWithStarterText(step, next, labelOf));
  const thumb = tourThumbnail(step);
  const bound = !!tour?.anchor && tour.anchor !== WHOLE_BOARD_ANCHOR;
  // An unbound step can carry a picture from where it came from (a recording or a converted slide).
  const pictured = bound || (!!tour && !tour.anchor);
  const type = (
    <>
      <div className={labelClass}>
        {t('tourPicker.control')}
        <div className="flex items-start gap-2">
          <span
            data-testid="tour-editor-control"
            className="min-w-0 flex-1 wrap-break-word pt-1 text-sm font-normal text-slate-900"
          >
            {tour?.anchor === WHOLE_BOARD_ANCHOR || !tour
              ? t('tourPicker.wholeBoard')
              : (tourControlLabel(tour) ?? t('tours.editor.unbound'))}
          </span>
          <button
            type="button"
            onClick={onPick}
            className={`${secondaryBtn} flex shrink-0 items-center gap-1.5 px-2 text-xs`}
          >
            <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
            {t('tourPicker.pick')}
          </button>
        </div>
      </div>
      {tour && (
        <TourWidgetFields
          tour={tour}
          onChange={bind}
          labelClass={labelClass}
          inputClass={inputClass}
        />
      )}
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
            {actionsFor(tour.anchor).map((action) => (
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
      {tour?.action === 'select' && choices.length > 0 && (
        <label className={labelClass}>
          {t('glStudio.tourValueSelect')}
          {/* no-tour-anchor: the tour editor is never a tour target */}
          <select
            value={typeof tour.value === 'string' ? tour.value : ''}
            onChange={(e) => {
              const { value: _old, ...rest } = tour;
              bind(e.target.value ? { ...rest, value: e.target.value } : rest);
            }}
            className={inputClass}
          >
            <option value="">{t('glStudio.tourValueAnyChoice')}</option>
            {typeof tour.value === 'string' &&
              tour.value !== '' &&
              !choices.some((c) => c.value === tour.value) && (
                <option value={tour.value}>{tour.value}</option>
              )}
            {choices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {((tour?.action === 'select' && choices.length === 0) ||
        tour?.action === 'type') && (
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
    </>
  );
  const more = (
    <>
      {tour?.action === 'click' && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={teacherMustClick(tour, 'destructive-only')}
            onChange={(e) =>
              bind({ ...tour, teacherMustClick: e.target.checked })
            }
            className="h-4 w-4 shrink-0 rounded-sm border-slate-300 accent-brand-blue-primary scheme-light"
          />
          {t('glStudio.tourTeacherMustClick')}
        </label>
      )}
      {tour && (
        <TourConditionFields
          tour={tour}
          onChange={(next) => session.setBinding(step.id, next)}
          labelClass={labelClass}
          inputClass={inputClass}
        />
      )}
      <ClaudeNoteField
        setId={session.set.id}
        target={step.id}
        testId="tour-editor-step-note"
      />
      {tour?.start && (
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <LayoutDashboard
            className="h-3.5 w-3.5 shrink-0 text-slate-400"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">{t('tours.editor.startSaved')}</span>
          <button
            type="button"
            onClick={() => {
              const { start: _start, ...rest } = tour;
              bind(rest);
            }}
            className={`rounded-md px-1.5 py-0.5 font-semibold text-slate-600 hover:bg-slate-100 ${focusRing}`}
          >
            {t('tours.editor.clearStart')}
          </button>
        </div>
      )}
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
    </>
  );
  return (
    <TourStepCard
      stepId={step.id}
      title={step.label ?? ''}
      tip={step.text ?? ''}
      onTitle={(label) => update({ label }, 'label')}
      onTip={(text) => update({ text }, 'text')}
      picture={
        tour && pictured && thumb
          ? {
              node: (
                <img
                  src={thumb.url}
                  alt=""
                  data-testid="tour-editor-thumbnail"
                  className={`max-h-32 w-full rounded-lg border ${chromeHairline} bg-white object-contain`}
                />
              ),
              dimmed: thumb.anchor !== tour.anchor,
              tools: bound ? (
                <button
                  type="button"
                  onClick={() => retakeTourEditThumbnail(step.id)}
                  aria-label={t('tours.editor.retake')}
                  title={t('tours.editor.retakeHint')}
                  className={`rounded-lg bg-white p-1.5 text-slate-700 shadow-sm hover:bg-slate-50 ${focusRing}`}
                >
                  <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : undefined,
            }
          : null
      }
      type={type}
      more={more}
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => session.deleteStep(step.id)}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-red-primary hover:bg-red-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-red-primary/40"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t('glStudio.deleteStep')}
          </button>
        </div>
      }
    />
  );
};

/** Records the widgets now on the stage as the tour's layout, after a confirm; hidden on an empty board. */
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
  // An empty board has no layout to capture.
  if (board.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => void capture()}
      title={t('glStudio.tourLayoutHint')}
      className={`${secondaryBtn} -ml-2 flex items-center gap-1.5 self-start whitespace-nowrap px-2 text-xs`}
    >
      <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
      {t('glStudio.tourLayoutCapture')}
    </button>
  );
};
