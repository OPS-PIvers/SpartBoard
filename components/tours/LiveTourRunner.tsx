import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type {
  GuidedLearningPublicStep,
  GuidedLearningSet,
  GuidedLearningStep,
  TourAutopilotPolicy,
  TourWidgetLayout,
  WidgetType,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import {
  clearTourHidden,
  clearTourLayoutOverrides,
  clearTourWidgetPatches,
  setTourHidden,
  setTourLayoutOverrides,
  setTourWidgetPatches,
  type TourWidgetPatch,
} from '@/context/dashboardCanvasStore';
import { loadBuildingSet } from '@/hooks/useGuidedLearning';
import { loadRunnableTour } from './publishedTours';
import { Z_INDEX } from '@/config/zIndex';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';
import {
  placeCallout,
  tetherFor,
} from '@/components/widgets/GuidedLearning/utils/calloutPlacement';
import { cursorMs } from '@/components/widgets/GuidedLearning/utils/motion';
import { renderStepText } from '@/components/widgets/GuidedLearning/utils/richText';
import { AnimatedCursor } from '@/components/widgets/GuidedLearning/components/player/AnimatedCursor';
import { TRY_HINT_MS } from '@/components/widgets/GuidedLearning/components/player/playback';
import {
  speechAvailable,
  useReadAloud,
} from '@/components/widgets/GuidedLearning/components/player/useReadAloud';
import {
  clearStudioReturn,
  handOffSnapshots,
  isTourRunning,
  setTourRunning,
  TOUR_START_EVENT,
  type TourSnapshots,
  type TourStartRequest,
} from './tourState';
import {
  claimSpawns,
  claimTourWidgets,
  hasStepSlide,
  isActedStep,
  liveTourStepsOf,
  missingSetupWidgets,
  planTourSetup,
  autopilotGate,
  DEFAULT_TOUR_AUTOPILOT_POLICY,
  resolveTourAutopilotPolicy,
  tourLayoutOverridesAt,
  tourWelcome,
  tourWidgetIds,
  type SpawnWatch,
  type TourSlots,
  type TourWidgetClaims,
} from './tourSession';
import { ANCHOR_SEARCH_MS, useAnchorElement } from './useAnchorElement';
import { findTourAnchor, isAnchorReachable } from './resolveTourAnchor';
import {
  prerequisiteWidgetId,
  satisfyPrerequisite,
  settingsUndoKey,
} from './tourPrerequisites';
import { fieldSettingsTab } from './settingsTab';
import { anchorPrerequisite } from '@/config/tourAnchors';
import { markSettingsOpenedLocally } from '@/components/settings/settingsOpenSignal';
import { TourDialog } from './TourDialog';
import { useShowSparty } from '@/components/sparty/useShowSparty';
import type { SpartyPose } from '@/components/sparty/spartyFrames';
import {
  autoLeadMs,
  autoObserveMs,
  canPerform,
  performStep,
  stepValueMet,
  waitFor,
} from './autopilot';
import { TourSpotlight } from './TourSpotlight';
import { TourTip, type TourTipStatus } from './TourTip';
import { TourBar } from './TourBar';
import { centreTip } from './tipPlacement';
import { primaryBtn, secondaryBtn } from './tourButtons';
import {
  clearSavedTour,
  readSavedTour,
  writeSavedTour,
  type SavedTour,
} from './tourResume';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';
import { startTourRunLog, type TourRunLog } from './tourRuns';
import {
  clearTourEdit,
  getTourEdit,
  reportTourEditPlayback,
  selectTourEditStep,
  useTourEditTarget,
} from './editor/tourEditStore';

const TourMiniPlayer = lazy(() => import('./TourMiniPlayer'));

type Phase = 'welcome' | 'practice-offer' | 'running' | 'teardown';

interface LaunchOptions {
  /** Widgets a reloaded run had already added, so teardown can still remove them. */
  claimIds?: readonly string[];
  skipWelcome?: boolean;
  /** Runs the Studio draft instead of the published snapshot. */
  draft?: boolean;
  retake?: TourStartRequest['retake'];
  /** The board editor's draft, played step by step from the outline. */
  edit?: boolean;
}

interface ActiveTour {
  set: GuidedLearningSet;
  /** Every step in the set, so counts match the Studio; plain ones have no anchor. */
  steps: GuidedLearningStep[];
  phase: Phase;
  index: number;
  /** The board setup ran on; claims never match widgets on another board. */
  boardId?: string;
  beforeIds: ReadonlySet<string>;
  addedTypes: WidgetType[];
  /** Tours without recorded layouts: the saved widgets setup added, by type. */
  claims: TourWidgetClaims;
  /** Unsaved widgets the tour added; Keep saves them, anything else discards them. */
  tourIds: string[];
  slots: TourSlots;
  /** The teacher's widgets the tour moves for now, by slot. */
  moved: Record<number, TourWidgetLayout>;
  spawnWatch: SpawnWatch[];
  /** Minimized widgets a step showed for now; they minimize again when the tour ends. */
  restored: string[];
  /** The admin's Autopilot policy, read when the tour started. */
  policy: TourAutopilotPolicy;
  /** The teacher's widgets cleared off the stage until the tour ends. */
  hidden: string[];
  /** A cleared stage: widgets the app adds while the tour runs are tour widgets. */
  clearStage?: boolean;
  draft?: boolean;
  /** Draft runs: whose pictures to retake; steps without one always get one. */
  retake?: TourStartRequest['retake'];
  edit?: boolean;
}

const EMPTY_LAYER = {
  tourIds: [] as string[],
  slots: {} as TourSlots,
  moved: {} as Record<number, TourWidgetLayout>,
  spawnWatch: [] as SpawnWatch[],
  restored: [] as string[],
  hidden: [] as string[],
};

/** A step that opens a widget watches for it from the board it starts on. */
const watchSpawn = (
  tour: Pick<ActiveTour, 'steps' | 'slots' | 'spawnWatch'>,
  index: number,
  boardIds: readonly string[]
): SpawnWatch[] => {
  const layout = tour.steps[index]?.tour?.spawns;
  if (
    !layout ||
    tour.slots[layout.slot] ||
    tour.spawnWatch.some((w) => w.layout.slot === layout.slot)
  )
    return tour.spawnWatch;
  return [...tour.spawnWatch, { layout, seen: boardIds }];
};

interface Point {
  x: number;
  y: number;
}

interface CursorCue {
  key: number;
  index: number;
  attempt: number;
  from: Point;
  to: Point;
  /** Autopilot's glide, which clicks when it lands. */
  auto: boolean;
}

/** Where autopilot is on the current step. */
type AutoStage = 'demo' | 'waiting' | 'confirm' | 'blocked' | 'fallback';

const BOARD_WAIT_MS = 2000;
/** How long a teacher's toggle or choice has to show the recorded value. */
const VALUE_SETTLE_MS = 600;
/** How often a step re-applies its anchor's prerequisite while the anchor is missing. */
const PREREQ_RETRY_MS = 400;
// A board switch this soon after a step's click is that step's own navigation.
const FOLLOW_BOARD_MS = 3000;
const CALLOUT_WIDTH = 320;
/** Lets a scrolled or opened control settle before its picture is taken. */
const SNAPSHOT_SETTLE_MS = 300;

/** A plain step's centred card reads wider than a pointing callout. */
const PLAIN_WIDTH = 400;
/** The 480px mini-player plus the callout's padding. */
const PREVIEW_WIDTH = 512;
const VIEWPORT_GUTTER = 16;

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const readViewport = () =>
  typeof window === 'undefined'
    ? { w: 0, h: 0 }
    : { w: window.innerWidth, h: window.innerHeight };

/** The dock, Sidebar pill and FABs, which the callout keeps clear of. */
const tourObstacles = () =>
  Array.from(document.querySelectorAll('[data-tour-obstacle]'))
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height }));

const SHAKE: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-8px)' },
  { transform: 'translateX(8px)' },
  { transform: 'translateX(-5px)' },
  { transform: 'translateX(5px)' },
  { transform: 'translateX(0)' },
];
// Reduced motion gets a still ring flash in place of the shake.
const FLASH: Keyframe[] = [
  { boxShadow: '0 0 0 0 rgb(255 255 255 / 0)' },
  { boxShadow: '0 0 0 4px rgb(255 255 255 / 0.85)' },
  { boxShadow: '0 0 0 0 rgb(255 255 255 / 0)' },
];

/** Claims keyed by type for widgets a reloaded run added that are still on the board. */
const claimsFromIds = (
  widgets: readonly { id: string; type: WidgetType }[],
  ids: readonly string[] = []
): TourWidgetClaims => {
  const claims: TourWidgetClaims = {};
  for (const w of widgets) {
    if (ids.includes(w.id) && !claims[w.type]) claims[w.type] = w.id;
  }
  return claims;
};

/** Runs a Guided Learning set's live-tour steps against the real app. */
export const LiveTourRunner: React.FC = () => {
  const { t } = useTranslation();
  const { canAccessFeature, user, featurePermissions } = useAuth();
  const dashboard = useDashboard();
  const { activeDashboard, removeWidgets } = dashboard;
  const [tour, setTour] = useState<ActiveTour | null>(null);
  const showSparty = useShowSparty();
  // Set when a run reaches its last step, so the closing prompt can cheer.
  const [finished, setFinished] = useState(false);
  const [cheering, setCheering] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [box, setBox] = useState({ w: CALLOUT_WIDTH, h: 140 });
  // The bar's Autopilot switch; handsOn marks a teacher who turned it off this run.
  const [autoOn, setAutoOn] = useState(false);
  const [handsOn, setHandsOn] = useState(false);
  const [auto, setAuto] = useState<{ key: string; stage: AutoStage } | null>(
    null
  );
  const autoClicking = useRef(false);
  // The step key "Autopilot this step" was pressed on, so it runs with the switch off.
  const manualStep = useRef<string | null>(null);
  const autoWait = useRef<AbortController | null>(null);
  const [readAloud, setReadAloud] = useState(false);
  const [cue, setCue] = useState<CursorCue | null>(null);
  const cueSeq = useRef(0);
  const startingRef = useRef(false);
  const lastStepClickAt = useRef(0);
  const reducedMotion = usePrefersReducedMotion();
  const [resumeOffer, setResumeOffer] = useState<SavedTour | null>(
    readSavedTour
  );
  const calloutRef = useRef<HTMLDivElement | null>(null);
  const runLog = useRef<TourRunLog | null>(null);

  // Async setup reads the newest dashboard actions, not the ones captured when it started.
  const latest = useRef({
    dashboard,
    canAccessFeature,
    t,
    uid: user?.uid,
    featurePermissions,
  });
  latest.current = {
    dashboard,
    canAccessFeature,
    t,
    uid: user?.uid,
    featurePermissions,
  };

  // Edit mode: the board editor's draft, with its selection driving playback.
  const editTarget = useTourEditTarget();
  const [ffTarget, setFfTarget] = useState<number | null>(null);
  const editHandled = useRef<{ selected: number; replay: number } | null>(null);
  // Unsaved edits play as soon as they are made.
  if (tour?.edit && editTarget && editTarget.set !== tour.set) {
    setTour({
      ...tour,
      set: editTarget.set,
      steps: liveTourStepsOf(editTarget.set),
    });
  }
  if (
    ffTarget !== null &&
    tour?.phase === 'running' &&
    (!tour.edit || tour.index >= ffTarget)
  ) {
    setFfTarget(null);
  }
  // Fast-forward: earlier steps play themselves with no lead time or cursor glide.
  const jumping =
    !!tour?.edit &&
    tour.phase === 'running' &&
    ffTarget !== null &&
    tour.index < ffTarget;

  const widgets = activeDashboard?.widgets ?? [];
  const onTourBoard = !!tour && activeDashboard?.id === tour.boardId;
  if (tour && onTourBoard) {
    const claims = claimTourWidgets(
      widgets,
      tour.beforeIds,
      tour.addedTypes,
      tour.claims
    );
    const setupIds = new Set(Object.values(claims));
    const spawned = claimSpawns(
      widgets.filter((w) => !setupIds.has(w.id)),
      tour.spawnWatch,
      tour.slots
    );
    // Unsaved widgets the app opened mid-tour join the Keep/Remove list.
    const opened = widgets
      .filter(
        (w) =>
          w.transient &&
          !tour.beforeIds.has(w.id) &&
          !tour.tourIds.includes(w.id)
      )
      .map((w) => w.id);
    if (
      claims !== tour.claims ||
      spawned.bound.length > 0 ||
      opened.length > 0
    ) {
      const moved = { ...tour.moved };
      for (const layout of spawned.bound) moved[layout.slot] = layout;
      setTour({
        ...tour,
        claims,
        slots: spawned.slots,
        moved,
        spawnWatch: spawned.watches,
        ...(opened.length > 0 ? { tourIds: [...tour.tourIds, ...opened] } : {}),
      });
    }
  }
  // Saved widgets from a tour without layouts; Remove deletes these.
  const legacyAdded =
    tour && onTourBoard ? tourWidgetIds(widgets, tour.claims) : [];
  const tourAdded = tour
    ? widgets.filter((w) => w.transient && tour.tourIds.includes(w.id))
    : [];
  const added = [...legacyAdded, ...tourAdded.map((w) => w.id)];
  const tourIdsRef = useRef<string[]>([]);
  tourIdsRef.current = tour?.tourIds ?? [];

  // Temporary layouts live in the canvas store only while a step is showing.
  const overrides =
    tour?.phase === 'running'
      ? tourLayoutOverridesAt(tour.steps, tour.index, tour.slots, tour.moved)
      : null;
  const overridesKey = overrides ? JSON.stringify([...overrides]) : '';
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  useEffect(() => {
    if (overridesRef.current) setTourLayoutOverrides(overridesRef.current);
    else clearTourLayoutOverrides();
  }, [overridesKey]);

  // The teacher's widgets stay off the stage through teardown; any ending brings them back.
  const hiddenIds =
    tour?.phase === 'running' || tour?.phase === 'teardown' ? tour.hidden : [];
  const hiddenKey = hiddenIds.join(',');
  useEffect(() => {
    if (hiddenKey) setTourHidden(hiddenKey.split(','));
    else clearTourHidden();
  }, [hiddenKey]);

  // The app's own addWidget makes unsaved tour widgets while a cleared-stage tour runs.
  const transientSpawns = tour?.phase === 'running' && !!tour.clearStage;
  useEffect(() => {
    latest.current.dashboard.setTourTransientSpawns?.(transientSpawns);
  }, [transientSpawns]);

  // Undo for each prerequisite a step set up, run when the tour ends.
  const prereqUndos = useRef(new Map<string, () => void>());
  const undoPrerequisites = useCallback(() => {
    const undos = [...prereqUndos.current.values()];
    prereqUndos.current.clear();
    undos.forEach((undo) => undo());
  }, []);

  // Unmounting mid-tour leaves the board as it was.
  useEffect(
    () => () => {
      latest.current.dashboard.setTourTransientSpawns?.(false);
      latest.current.dashboard.discardTourWidgets?.(tourIdsRef.current);
      clearTourLayoutOverrides();
      clearTourWidgetPatches();
      clearTourHidden();
      undoPrerequisites();
    },
    [undoPrerequisites]
  );

  // A running tour survives a reload as {setId, index, addedIds}.
  const saved: SavedTour | null =
    tour?.phase === 'running' && !tour.edit
      ? {
          setId: tour.set.id,
          index: tour.index,
          // Unsaved tour widgets do not survive a reload, so only saved ones are listed.
          addedIds: legacyAdded,
          ...(tour.draft ? { draft: true } : {}),
        }
      : null;
  const savedKey = saved ? JSON.stringify(saved) : null;
  const savedRun = useRef(saved);
  savedRun.current = saved;
  const wroteSaved = useRef(false);
  const ended = tour === null;
  useEffect(() => {
    if (savedKey && savedRun.current) {
      writeSavedTour(savedRun.current);
      wroteSaved.current = true;
    } else if (ended && wroteSaved.current) {
      clearSavedTour();
      wroteSaved.current = false;
    }
  }, [savedKey, ended]);
  const step =
    tour?.phase === 'running' ? (tour.steps[tour.index] ?? null) : null;
  const anchor = useAnchorElement(
    step?.tour ?? null,
    { widgetIds: added, slots: tour?.slots },
    attempt
  );

  // A step aimed at the dock lifts the dock above the dim.
  const liftEl =
    anchor.status === 'found'
      ? (anchor.element?.closest<HTMLElement>('[data-role="dock"]') ?? null)
      : null;
  useEffect(() => {
    if (!liftEl) return;
    const prev = liftEl.style.zIndex;
    liftEl.style.zIndex = String(Z_INDEX.tourLift);
    return () => {
      liftEl.style.zIndex = prev;
    };
  }, [liftEl]);

  const binding = step?.tour ?? null;

  // Draft runs picture each bound step that has no slide yet, or that the Studio asked to retake.
  const snapshots = useRef(new Map<string, TourSnapshots['shots'][number]>());
  const [shotIds, setShotIds] = useState<ReadonlySet<string>>(() => new Set());
  const snapStepId =
    tour?.phase === 'running' &&
    tour.draft &&
    step &&
    binding &&
    anchor.status === 'found' &&
    !shotIds.has(step.id) &&
    (tour.retake === 'all' || tour.retake === step.id || !hasStepSlide(step))
      ? step.id
      : null;
  const snapElement = snapStepId ? anchor.element : null;
  useEffect(() => {
    if (!snapStepId || !snapElement || !binding) return;
    let live = true;
    const people = (latest.current.dashboard.rosters ?? []).flatMap(
      (r) => r.students
    );
    const timer = window.setTimeout(() => {
      void import('./stepSnapshot')
        .then((m) => m.captureStepSnapshot(snapElement, people))
        .then((shot) => {
          if (!live || !shot) return;
          snapshots.current.set(snapStepId, {
            stepId: snapStepId,
            tour: binding,
            ...shot,
          });
          setShotIds((prev) => new Set(prev).add(snapStepId));
        })
        .catch((err: unknown) =>
          console.warn('Live tour step picture failed', err)
        );
    }, SNAPSHOT_SETTLE_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [snapStepId, snapElement, binding]);
  const anchorScope = { widgetIds: added, slots: tour?.slots };
  const onStage = hiddenIds.length
    ? widgets.filter((w) => !hiddenIds.includes(w.id))
    : widgets;
  const stepWidgetId = binding
    ? prerequisiteWidgetId(binding, onStage, anchorScope)
    : null;

  // The anchor's widget comes to the front for the step, and restored widgets show; neither is saved.
  const foundWidgetId =
    anchor.status === 'found'
      ? (anchor.element
          ?.closest('[data-tour-widget]')
          ?.getAttribute('data-tour-widget') ?? null)
      : null;
  const raiseId = foundWidgetId ?? stepWidgetId;
  const patches = new Map<string, TourWidgetPatch>();
  if (tour?.phase === 'running') {
    for (const id of tour.restored) patches.set(id, { restored: true });
    const raised = raiseId ? widgets.find((w) => w.id === raiseId) : undefined;
    const top = Math.max(
      0,
      ...widgets.filter((w) => w.id !== raiseId).map((w) => w.z ?? 0)
    );
    if (raised && (raised.z ?? 0) <= top) {
      patches.set(raised.id, { ...patches.get(raised.id), z: top + 1 });
    }
  }
  const patchesKey = JSON.stringify([...patches]);
  const patchesRef = useRef(patches);
  patchesRef.current = patches;
  useEffect(() => {
    if (patchesRef.current.size > 0) setTourWidgetPatches(patchesRef.current);
    else clearTourWidgetPatches();
  }, [patchesKey]);

  const satisfy = useEffectEvent(() => {
    if (!binding) return;
    // Undo runs at teardown, so each check reads the newest dashboard, not this one.
    const d = () => latest.current.dashboard;
    const onBoard = (id: string) =>
      d().activeDashboard?.widgets.find((w) => w.id === id);
    const undos = satisfyPrerequisite({
      binding,
      scope: anchorScope,
      widgetId: stepWidgetId,
      isMinimized: (id) => !!onBoard(id)?.minimized,
      isSelected: (id) => d().selectedWidgetId === id,
      select: (id) => d().setSelectedWidgetId(id),
      restore: (id) =>
        setTour((t) =>
          t && !t.restored.includes(id)
            ? { ...t, restored: [...t.restored, id] }
            : t
        ),
      isSettingsOpen: (id) => !!onBoard(id)?.flipped,
      setSettingsOpen: (id, open) => {
        if (open) markSettingsOpenedLocally(id);
        d().updateWidget(id, { flipped: open });
      },
      fieldTab: fieldSettingsTab,
    });
    for (const undo of undos) {
      if (!prereqUndos.current.has(undo.key)) {
        prereqUndos.current.set(undo.key, undo.undo);
      }
    }
  });
  // A drawer the tour opened stays open across its widget's drawer steps and closes on a step aimed elsewhere.
  const drawerWidgetId =
    binding && anchorPrerequisite(binding.anchor) === 'settings-open'
      ? stepWidgetId
      : null;
  const leavesDrawer = !!binding && tour?.phase === 'running';
  const drawerStep = tour?.index ?? 0;
  useEffect(() => {
    if (!leavesDrawer) return;
    const keep = drawerWidgetId ? settingsUndoKey(drawerWidgetId) : null;
    for (const [key, undo] of prereqUndos.current) {
      if (key.startsWith(settingsUndoKey('')) && key !== keep) {
        prereqUndos.current.delete(key);
        undo();
      }
    }
  }, [leavesDrawer, drawerWidgetId, drawerStep]);
  // Sets up what the anchor needs before and while it is searched for.
  // Once the anchor has shown, a teacher who undoes the setup is not overridden until Retry.
  const prereqStep = tour?.index ?? 0;
  const prereqKey = `${prereqStep}:${attempt}`;
  const [prereqDone, setPrereqDone] = useState<string | null>(null);
  // Missing also ends the retries, so a step that never resolves stops fighting the teacher.
  const prereqSettled =
    anchor.status === 'found' || anchor.status === 'missing';
  if (prereqSettled && prereqDone !== prereqKey) {
    setPrereqDone(prereqKey);
  }
  const needsPrereq =
    tour?.phase === 'running' &&
    !!binding &&
    !handsOn &&
    !prereqSettled &&
    prereqDone !== prereqKey;
  useEffect(() => {
    if (!needsPrereq) return;
    satisfy();
    const id = setInterval(() => satisfy(), PREREQ_RETRY_MS);
    return () => clearInterval(id);
  }, [needsPrereq, prereqStep, attempt]);

  const runSetup = (
    set: GuidedLearningSet,
    steps: GuidedLearningStep[],
    from = 0,
    opts: LaunchOptions = {}
  ) => {
    const { dashboard: d } = latest.current;
    const current = d.activeDashboard?.widgets ?? [];
    const claims = claimsFromIds(current, opts.claimIds);
    const beforeIds = new Set(current.map((w) => w.id));
    const tourIds: string[] = [];
    const slots: Record<number, string> = {};
    const moved: Record<number, TourWidgetLayout> = {};
    let missing: WidgetType[] = [];
    // A cleared stage hides the teacher's widgets and always adds fresh tour widgets.
    const clearStage = !set.tourSetup?.useTeacherBoard && !!d.addTourWidget;
    const hidden = clearStage
      ? current.filter((w) => !w.transient).map((w) => w.id)
      : [];
    if (clearStage) setTourHidden(hidden);
    if ((clearStage || set.tourSetup?.layouts?.length) && d.addTourWidget) {
      // Recorded layouts: unsaved tour widgets, and the teacher's own moved for now.
      const plan = planTourSetup(set, steps, clearStage ? [] : current);
      for (const { layout, widgetId } of plan.bind) {
        slots[layout.slot] = widgetId;
        moved[layout.slot] = layout;
      }
      for (const layout of plan.add) {
        const { slot: _slot, type, ...place } = layout;
        const id = d.addTourWidget(type, place);
        if (id) {
          slots[layout.slot] = id;
          tourIds.push(id);
        }
      }
      for (const type of plan.addTypes) {
        const id = d.addTourWidget(type);
        if (id) tourIds.push(id);
      }
    } else {
      missing = missingSetupWidgets(set, current);
      missing.forEach((type) => d.addWidget(type));
    }
    const index = Math.min(Math.max(from, 0), steps.length - 1);
    runLog.current?.end({ done: false });
    // Studio test runs of a draft are not field data.
    const uid = latest.current.uid;
    runLog.current =
      uid && !opts.draft && !opts.edit
        ? startTourRunLog(set.id, uid, { v: set.updatedAt, furthest: index })
        : null;
    setAttempt(0);
    setAutoOn(
      !opts.edit && (set.mode === 'guided' || set.tourSetup?.autopilot === true)
    );
    setHandsOn(false);
    setAuto(null);
    setCue(null);
    setTour({
      set,
      steps,
      phase: 'running',
      index,
      boardId: d.activeDashboard?.id,
      beforeIds,
      addedTypes: missing,
      claims,
      tourIds,
      slots,
      moved,
      spawnWatch: watchSpawn({ steps, slots, spawnWatch: [] }, index, [
        ...beforeIds,
        ...tourIds,
      ]),
      restored: [],
      policy: resolveTourAutopilotPolicy(latest.current.featurePermissions),
      hidden,
      clearStage,
      draft: opts.draft,
      retake: opts.retake,
      edit: opts.edit,
    });
  };

  // Welcome first, then a practice board if this one is view-only, then setup.
  const begin = (
    set: GuidedLearningSet,
    steps: GuidedLearningStep[],
    from: number,
    phase: 'welcome' | null = null,
    opts: LaunchOptions = {}
  ) => {
    const pending = (p: Phase): ActiveTour => ({
      set,
      steps,
      phase: p,
      index: from,
      beforeIds: new Set(),
      addedTypes: [],
      claims: {},
      ...EMPTY_LAYER,
      policy: DEFAULT_TOUR_AUTOPILOT_POLICY,
      draft: opts.draft,
      retake: opts.retake,
      edit: opts.edit,
    });
    setCheering(false);
    setFinished(false);
    if (phase === 'welcome') setTour(pending('welcome'));
    else if (latest.current.dashboard.isActiveBoardReadOnly)
      setTour(pending('practice-offer'));
    else runSetup(set, steps, from, opts);
  };
  const beginRef = useRef(begin);
  beginRef.current = begin;

  const launch = (req: TourStartRequest, opts: LaunchOptions = {}) => {
    const { canAccessFeature: can, dashboard: d, t: tr } = latest.current;
    if (
      !req?.setId ||
      !can('gl-live-tours') ||
      startingRef.current ||
      isTourRunning()
    )
      return;
    startingRef.current = true;
    setResumeOffer(null);
    // A failed launch drops its Studio return and any saved run, so neither comes back later.
    const launchFailed = () => {
      clearStudioReturn();
      clearSavedTour();
      d.addToast(tr('tours.unavailable'), 'error');
    };
    void (async () => {
      try {
        const set = req.draft
          ? await loadBuildingSet(req.setId)
          : await loadRunnableTour(req.setId);
        const steps = set ? liveTourStepsOf(set) : [];
        if (!set || steps.length === 0) {
          launchFailed();
          return;
        }
        // The welcome opens a tour from the start, not a run from a chosen step.
        const from = req.fromStep ?? 0;
        beginRef.current(
          set,
          steps,
          from,
          from === 0 && !opts.skipWelcome && tourWelcome(set) !== null
            ? 'welcome'
            : null,
          {
            ...opts,
            draft: req.draft,
            ...(req.draft && req.retake ? { retake: req.retake } : {}),
          }
        );
      } catch (err) {
        console.error('LiveTourRunner: could not load tour', err);
        launchFailed();
      } finally {
        startingRef.current = false;
      }
    })();
  };
  const launchRef = useRef(launch);
  launchRef.current = launch;

  useEffect(() => {
    const onStart = (e: Event) =>
      launchRef.current((e as CustomEvent<TourStartRequest>).detail);
    window.addEventListener(TOUR_START_EVENT, onStart);
    return () => window.removeEventListener(TOUR_START_EVENT, onStart);
  }, []);

  const resumeTour = () => {
    if (!resumeOffer) return;
    const { setId, index, addedIds, draft } = resumeOffer;
    launch(
      { setId, fromStep: index, draft },
      { claimIds: addedIds, skipWelcome: true }
    );
  };
  const dismissResume = (removeAdded: boolean) => {
    if (!resumeOffer) return;
    if (removeAdded) {
      const onBoard = new Set(
        (latest.current.dashboard.activeDashboard?.widgets ?? []).map(
          (w) => w.id
        )
      );
      const ids = resumeOffer.addedIds.filter((id) => onBoard.has(id));
      if (ids.length > 0) removeWidgets(ids);
    }
    clearSavedTour();
    setResumeOffer(null);
  };

  // Keep saves the tour's widgets; every other ending discards them.
  const endTour = (keep = false) => {
    if (tour?.edit) clearTourEdit();
    if (tour?.draft && snapshots.current.size > 0) {
      const shots = [...snapshots.current.values()];
      handOffSnapshots({
        setId: tour.set.id,
        stepId: shots[shots.length - 1].stepId,
        shots,
      });
    }
    snapshots.current = new Map();
    setShotIds(new Set());
    if (tour) {
      const d = latest.current.dashboard;
      if (keep) d.commitTourWidgets?.(tour.tourIds);
      else d.discardTourWidgets?.(tour.tourIds);
    }
    undoPrerequisites();
    setTour(null);
  };

  // Leaving before the run starts also drops a resumed run's saved state.
  const abandon = () => {
    clearSavedTour();
    endTour();
  };

  const startOnPracticeBoard = async () => {
    if (!tour) return;
    const { set, steps, index, draft, retake, edit } = tour;
    const id = await latest.current.dashboard.createNewDashboard(
      latest.current.t('tours.practiceBoardName')
    );
    if (!id) {
      abandon();
      return;
    }
    const deadline = performance.now() + BOARD_WAIT_MS;
    while (
      latest.current.dashboard.activeDashboard?.id !== id &&
      performance.now() < deadline
    ) {
      await nextFrame();
    }
    if (latest.current.dashboard.activeDashboard?.id !== id) {
      latest.current.dashboard.addToast(
        latest.current.t('tours.practiceFailed'),
        'error'
      );
      abandon();
      return;
    }
    runSetup(set, steps, index, { draft, retake, edit });
  };

  // A step left while its anchor was still missing counts as a field miss.
  const noteMiss = () => {
    if (step?.tour && anchor.status === 'missing')
      runLog.current?.miss(step.id);
  };

  const finish = (done = false) => {
    if (!tour) return;
    if (tour.phase === 'running') {
      noteMiss();
      runLog.current?.end(done ? { done } : { done, exit: tour.index });
      runLog.current = null;
    }
    setFinished(done);
    if (added.length > 0) {
      setTour({ ...tour, phase: 'teardown' });
      return;
    }
    endTour();
    if (done && showSparty) setCheering(true);
  };

  const goTo = (index: number) => {
    if (!tour) return;
    autoWait.current?.abort();
    manualStep.current = null;
    setAuto(null);
    if (index >= tour.steps.length) {
      if (!tour.edit) finish(true);
      return;
    }
    noteMiss();
    runLog.current?.update({ furthest: index });
    setAttempt(0);
    const next = Math.max(index, 0);
    // The outline follows playback; a fast-forward already shows where it is heading.
    if (tour.edit && (ffTarget === null || next > ffTarget)) {
      editHandled.current = {
        selected: next,
        replay: editHandled.current?.replay ?? 0,
      };
      selectTourEditStep(next);
    }
    const boardIds = (
      latest.current.dashboard.activeDashboard?.widgets ?? []
    ).map((w) => w.id);
    setTour({
      ...tour,
      index: next,
      spawnWatch: watchSpawn(tour, next, boardIds),
    });
  };

  const advanceRef = useRef(goTo);
  advanceRef.current = goTo;
  const stepIndex = tour?.index ?? 0;

  // Edit mode: rebuilds the stage, and the start effect below replays up to the selection.
  const resetEdit = () => {
    if (!tour) return;
    autoWait.current?.abort();
    autoClicking.current = false;
    setAuto(null);
    setCue(null);
    latest.current.dashboard.discardTourWidgets?.(tour.tourIds);
    undoPrerequisites();
    setFfTarget(null);
    setTour(null);
  };
  // Stops a fast-forward where it is; the outline selects that step.
  const stopJump = () => {
    if (!tour || !jumping) return;
    autoWait.current?.abort();
    autoClicking.current = false;
    setAuto(null);
    setFfTarget(null);
    editHandled.current = {
      selected: tour.index,
      replay: editHandled.current?.replay ?? 0,
    };
    selectTourEditStep(tour.index);
  };

  // The editor's draft plays from step 1 on a fresh stage, then fast-forwards to the selection.
  const editIdle =
    !!editTarget && editTarget.set.steps.length > 0 && tour === null;
  const startEdit = useEffectEvent(() => {
    const req = getTourEdit();
    if (!req || startingRef.current || !canAccessFeature('gl-live-tours'))
      return;
    const steps = liveTourStepsOf(req.set);
    if (steps.length === 0) return;
    const selected = Math.min(req.selected, steps.length - 1);
    editHandled.current = { selected, replay: req.replay };
    setResumeOffer(null);
    beginRef.current(req.set, steps, 0, null, { edit: true });
    setFfTarget(selected > 0 ? selected : null);
  });
  useEffect(() => {
    if (editIdle) startEdit();
  }, [editIdle]);

  // Leaving the editor tears the stage down.
  const editEnded = !editTarget && !!tour?.edit;
  const endEdit = useEffectEvent(() => endTour());
  useEffect(() => {
    if (editEnded) endEdit();
  }, [editEnded]);

  // A later step fast-forwards from here; an earlier one, or a reorder, replays from step 1.
  const followEdit = useEffectEvent(() => {
    const req = getTourEdit();
    const handled = editHandled.current;
    if (!req || !handled || !tour?.edit || tour.phase !== 'running') return;
    if (req.selected === handled.selected && req.replay === handled.replay)
      return;
    editHandled.current = { selected: req.selected, replay: req.replay };
    if (req.replay === handled.replay && req.selected >= tour.index) {
      autoWait.current?.abort();
      autoClicking.current = false;
      manualStep.current = null;
      setAuto(null);
      setCue(null);
      setFfTarget(req.selected > tour.index ? req.selected : null);
      return;
    }
    resetEdit();
  });
  const editSelected = editTarget?.selected;
  const editReplay = editTarget?.replay;
  useEffect(() => {
    followEdit();
  }, [editSelected, editReplay]);

  const acted = isActedStep(step?.tour);
  const action = step?.tour?.action;
  const stepValue = step?.tour?.value;
  // A click on the anchor advances once the app has handled it; typing and native selects advance on change.
  useEffect(() => {
    const el = anchor.element;
    if (!el || !acted || !action) return;
    const onChange =
      action === 'type' ||
      (action === 'select' &&
        (el instanceof HTMLSelectElement || !!el.querySelector('select')));
    const eventName = onChange ? 'change' : 'click';
    const binding = { action, value: stepValue };
    const ctrl = new AbortController();
    let raf = 0;
    const onClick = () => {
      lastStepClickAt.current = Date.now();
      // Autopilot's own click waits for the next anchor instead.
      if (autoClicking.current) return;
      // Toggle and select steps wait for the recorded value; a control that can't say counts any click.
      const met = () =>
        (action !== 'toggle' && action !== 'select') ||
        !el.isConnected ||
        stepValueMet(el, binding) !== false;
      raf = requestAnimationFrame(() => {
        if (met()) advanceRef.current(stepIndex + 1);
        else
          void waitFor(met, VALUE_SETTLE_MS, ctrl.signal).then((ok) => {
            if (ok) advanceRef.current(stepIndex + 1);
          });
      });
    };
    el.addEventListener(eventName, onClick, true);
    return () => {
      el.removeEventListener(eventName, onClick, true);
      cancelAnimationFrame(raf);
      ctrl.abort();
    };
  }, [anchor.element, acted, action, stepValue, stepIndex]);

  const running = tour?.phase === 'running';
  const offeringResume =
    !tour &&
    resumeOffer !== null &&
    !!activeDashboard &&
    canAccessFeature('gl-live-tours');
  // The editor keeps Escape for its own controls, except to stop a fast-forward.
  const escapable =
    (tour !== null && (!tour.edit || jumping)) || offeringResume;
  const active = tour !== null;
  useEffect(() => {
    setTourRunning(active);
    return () => setTourRunning(false);
  }, [active]);
  // Escape never destroys work: Keep on teardown, Cancel on the practice offer.
  const finishRef = useRef(finish);
  finishRef.current = !tour
    ? () => dismissResume(false)
    : tour.edit
      ? () => stopJump()
      : tour.phase === 'teardown'
        ? () => endTour(true)
        : tour.phase === 'practice-offer'
          ? abandon
          : () => finish();

  // Switching boards ends the tour with no prompt; its unsaved widgets go with it.
  const boardSwitched =
    !!tour?.boardId &&
    (tour.phase === 'running' || tour.phase === 'teardown') &&
    !!activeDashboard &&
    activeDashboard.id !== tour.boardId;
  const endOnBoardSwitch = useEffectEvent(() => {
    const board = latest.current.dashboard.activeDashboard;
    // The editor follows the admin to the new board and replays there.
    if (tour?.edit) {
      resetEdit();
      return;
    }
    // A step that teaches board navigation follows the teacher to the new board.
    if (
      tour?.phase === 'running' &&
      board &&
      Date.now() - lastStepClickAt.current < FOLLOW_BOARD_MS
    ) {
      setTour({
        ...tour,
        boardId: board.id,
        beforeIds: new Set(board.widgets.map((w) => w.id)),
        addedTypes: [],
      });
      return;
    }
    // Saved widgets from a tour without layouts stay on the old board; say so.
    if (tour && Object.keys(tour.claims).length > 0) {
      latest.current.dashboard.addToast(
        latest.current.t('tours.widgetsLeftBehind'),
        'info'
      );
    }
    if (tour?.phase === 'running') {
      noteMiss();
      runLog.current?.end({ done: false, exit: tour.index });
      runLog.current = null;
    }
    endTour();
  });
  useEffect(() => {
    if (boardSwitched) endOnBoardSwitch();
  }, [boardSwitched]);

  // The callout re-places itself when the window changes size.
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    if (!active) return;
    const onResize = () =>
      setViewport((prev) => {
        const next = readViewport();
        return prev.w === next.w && prev.h === next.h ? prev : next;
      });
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [active]);
  useEffect(() => {
    if (!escapable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isEscapeFromWidgetInput(e)) return;
      // Escape inside an app dialog or panel closes that, not the tour.
      const target = e.target instanceof Element ? e.target : null;
      if (
        target &&
        !target.closest('[data-tour-ignore]') &&
        target.closest('[role="dialog"], [data-widget-portal]')
      )
        return;
      e.stopPropagation();
      e.preventDefault();
      finishRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [escapable]);

  const missingStepId = anchor.status === 'missing' ? step?.id : undefined;
  const setId = tour?.set.id;
  const missingAnchor = step?.tour?.anchor;
  useEffect(() => {
    if (!missingStepId) return;
    console.warn('Live tour anchor not found', {
      setId,
      stepId: missingStepId,
      anchor: missingAnchor,
    });
  }, [missingStepId, setId, missingAnchor]);

  // Re-places the tip after the bar is dragged.
  const [, setBarMoves] = useState(0);
  const onBarPlace = useCallback(() => setBarMoves((n) => n + 1), []);
  const rect = anchor.status === 'found' ? anchor.rect : null;
  const target = rect
    ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
    : null;
  const obstacles = tour ? tourObstacles() : [];
  const placement = target
    ? placeCallout({ box, target, container: viewport, obstacles })
    : null;
  const tether =
    placement && target
      ? tetherFor(
          { x: placement.left, y: placement.top, w: placement.width, h: box.h },
          target
        )
      : null;
  const center = rect
    ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    : null;
  const isClick = acted;
  // A step with no anchor is a centred card on the dimmed board.
  const plain = running && !!step && !step.tour;
  // The dim stays up while the next step's anchor is found, so back-to-back spotlights never flash.
  const dimNow = running && (anchor.status === 'found' || plain);
  const [dimHeld, setDimHeld] = useState(false);
  if (dimNow !== dimHeld && (dimNow || anchor.status !== 'searching')) {
    setDimHeld(dimNow);
  }
  const showDim = dimNow || (running && dimHeld);
  const cursorAllowed =
    running && center !== null && isClick && !step?.cursor?.hide;
  // Guided sets start with the Autopilot switch on; the teacher can flip it either way.
  const autopilot = tour?.edit ? jumping : autoOn;
  const stepKey = `${stepIndex}:${attempt}`;
  const autoStage = auto?.key === stepKey ? auto.stage : null;
  const found = running && anchor.status === 'found';
  const autoRunning = autopilot && (found || plain);
  const waitingOnTeacher = autoStage === 'blocked' || autoStage === 'fallback';
  const autoBusy =
    autoStage === 'demo' || autoStage === 'waiting' || autoStage === 'confirm';
  const hintOn = cursorAllowed && (!autopilot || waitingOnTeacher);

  // The demo cursor glides from the callout to the anchor.
  const playCursor = (isAuto = false) => {
    if (!tour || !center || !cursorAllowed) return;
    const from = placement
      ? { x: placement.left + box.w / 2, y: placement.top + box.h / 2 }
      : { x: viewport.w / 2, y: viewport.h / 2 };
    cueSeq.current += 1;
    setCue({
      key: cueSeq.current,
      index: tour.index,
      attempt,
      from,
      to: center,
      auto: isAuto,
    });
  };
  const cursorCue = useEffectEvent(() => playCursor());
  // An anchor that moves mid-glide gets the cursor aimed at where it is now.
  if (
    cue &&
    center &&
    cue.index === tour?.index &&
    cue.attempt === attempt &&
    Math.hypot(cue.to.x - center.x, cue.to.y - center.y) >= 8
  ) {
    setCue({ ...cue, to: center });
  }
  const cueRef = useRef(cue);
  cueRef.current = cue;
  // A glide cut short when the anchor vanished never lands, so start the step over.
  if (autoStage === 'demo' && !found) setAuto(null);
  // Structured hints after 5s without progress; reduced motion gets a still line instead of the glide.
  const [staticHint, setStaticHint] = useState<string | null>(null);
  useEffect(() => {
    if (!hintOn) return;
    const key = stepKey;
    const id = setTimeout(() => {
      if (reducedMotion) setStaticHint(key);
      else cursorCue();
    }, TRY_HINT_MS);
    return () => clearTimeout(id);
  }, [hintOn, stepKey, reducedMotion]);
  const staticHintOn = hintOn && staticHint === stepKey;

  const latestAdded = useRef(added);
  latestAdded.current = added;
  const latestSlots = useRef<TourSlots | undefined>(tour?.slots);
  latestSlots.current = tour?.slots;

  // Autopilot performs the step, then waits for the app to show the next step's anchor.
  const autoClick = (consented = false) => {
    const el = anchor.element;
    const binding = step?.tour;
    if (
      !tour ||
      !binding ||
      !el ||
      !(autopilot || manualStep.current === stepKey)
    ) {
      setAuto(null);
      return;
    }
    const gate = canPerform(binding)
      ? autopilotGate(binding, tour.policy)
      : 'teacher';
    if (gate === 'teacher' || (gate === 'confirm' && !consented)) {
      setAuto({ key: stepKey, stage: gate === 'teacher' ? 'blocked' : gate });
      return;
    }
    const index = tour.index;
    const nextBinding = tour.steps[index + 1]?.tour;
    setAuto({ key: stepKey, stage: 'waiting' });
    autoWait.current?.abort();
    const ctrl = new AbortController();
    autoWait.current = ctrl;
    autoClicking.current = true;
    let performed: Promise<void>;
    try {
      performed = performStep(el, binding, {
        instant: reducedMotion || jumping,
        signal: ctrl.signal,
      });
    } catch {
      performed = Promise.resolve();
    }
    void performed
      .catch(() => undefined)
      .then(() => {
        autoClicking.current = false;
        if (ctrl.signal.aborted) return;
        // A plain step next has nothing to wait for.
        if (!nextBinding) {
          requestAnimationFrame(() => advanceRef.current(index + 1));
          return;
        }
        void waitFor(
          () =>
            !!findTourAnchor(nextBinding, {
              widgetIds: latestAdded.current,
              slots: latestSlots.current,
              accept: isAnchorReachable,
            }),
          ANCHOR_SEARCH_MS,
          ctrl.signal
        ).then((ok) => {
          if (ctrl.signal.aborted) return;
          if (ok || jumping) advanceRef.current(index + 1);
          else setAuto({ key: stepKey, stage: 'fallback' });
        });
      });
  };
  const autoClickRef = useRef(autoClick);
  autoClickRef.current = autoClick;

  const runAuto = () => {
    setAuto({ key: stepKey, stage: 'demo' });
    if (cursorAllowed && !reducedMotion && !jumping) playCursor(true);
    else autoClickRef.current();
  };
  const startAutoDemo = useEffectEvent(runAuto);
  // "Autopilot this step" performs just this step, whatever the switch says.
  const runStep = () => {
    manualStep.current = stepKey;
    runAuto();
  };
  useEffect(() => {
    if (!autoRunning || !isClick || autoStage !== null || !step) return;
    const id = setTimeout(
      () => startAutoDemo(),
      jumping ? 0 : autoLeadMs(step, tour?.set.watchPace)
    );
    return () => clearTimeout(id);
  }, [
    autoRunning,
    isClick,
    autoStage,
    stepKey,
    step,
    tour?.set.watchPace,
    jumping,
  ]);

  // Observe steps move on at reading pace.
  const observeMs =
    step && !isClick
      ? jumping
        ? 1
        : autoObserveMs(step, tour?.set.watchPace)
      : 0;
  useEffect(() => {
    if (!autoRunning || observeMs <= 0) return;
    const index = stepIndex;
    const id = setTimeout(() => advanceRef.current(index + 1), observeMs);
    return () => clearTimeout(id);
  }, [autoRunning, observeMs, stepIndex, attempt]);

  useEffect(() => () => autoWait.current?.abort(), []);

  // A fast-forward passes over a step whose control isn't on the board.
  const skipMissing = jumping && anchor.status === 'missing';
  useEffect(() => {
    if (skipMissing) advanceRef.current(stepIndex + 1);
  }, [skipMissing, stepIndex]);

  // The outline marks steps whose control wasn't found when they last played.
  const [missingIds, setMissingIds] = useState<readonly string[]>([]);
  if (tour?.edit && step?.tour) {
    const listed = missingIds.includes(step.id);
    if (anchor.status === 'missing' && !listed)
      setMissingIds([...missingIds, step.id]);
    else if (anchor.status === 'found' && listed)
      setMissingIds(missingIds.filter((id) => id !== step.id));
  }
  const editBlocked =
    autoStage === 'blocked' ||
    autoStage === 'confirm' ||
    autoStage === 'fallback';
  const editRect =
    tour?.edit && rect
      ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
      : null;
  const playbackKey = tour?.edit
    ? JSON.stringify([
        stepIndex,
        plain ? 'found' : anchor.status,
        editRect,
        jumping,
        editBlocked,
        missingIds,
        tour.slots,
      ])
    : '';
  const playbackRef = useRef({
    index: stepIndex,
    anchor: anchor.status,
    rect: editRect,
    jumping,
    blocked: editBlocked,
    missing: missingIds,
    slots: tour?.slots ?? {},
  });
  playbackRef.current = {
    index: stepIndex,
    anchor: plain ? 'found' : anchor.status,
    rect: editRect,
    jumping,
    blocked: editBlocked,
    missing: missingIds,
    slots: tour?.slots ?? {},
  };
  useEffect(() => {
    if (playbackKey) reportTourEditPlayback(playbackRef.current);
  }, [playbackKey]);

  // Run stats reach Firestore when the page hides or the runner unmounts mid-run.
  useEffect(() => {
    const flush = () => runLog.current?.flush();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  const stopDemo = () => {
    if (autoStage !== 'demo') return;
    setAuto(null);
    setCue(null);
  };
  const stopAutopilot = () => {
    setAutoOn(false);
    setHandsOn(true);
    autoWait.current?.abort();
    autoClicking.current = false;
    stopDemo();
  };
  // Autopilot already clicked this step before it was switched off, so switching on moves on.
  const setAutopilot = (on: boolean) => {
    if (!on) {
      stopAutopilot();
      return;
    }
    setAutoOn(true);
    setHandsOn(false);
    if (autoStage === 'waiting' && tour) goTo(tour.index + 1);
  };

  // "Show me" replays the demo once.
  const showMe = () => playCursor();

  // A click on the dim shakes the callout and brings the hint early.
  const misclick = () => {
    const el = calloutRef.current;
    if (el && typeof el.animate === 'function') {
      el.animate(reducedMotion ? FLASH : SHAKE, {
        duration: reducedMotion ? 600 : 400,
        easing: 'ease-in-out',
      });
    }
    if (hintOn) playCursor();
  };

  // Every step moves focus to its heading so keyboard and screen reader users land on it.
  const headingRef = useRef<HTMLDivElement | null>(null);
  const showingStep = running && !!step;
  useEffect(() => {
    if (!showingStep) return;
    headingRef.current?.focus({ preventScroll: true });
  }, [showingStep, stepIndex]);

  const canRead = !!step && (!!step.narration?.url || speechAvailable());
  useReadAloud({
    enabled: (tour?.edit ? !!editTarget?.readAloud : readAloud) && canRead,
    step: step as unknown as GuidedLearningPublicStep | null,
    stepKey: step && tour ? `${tour.set.id}:${tour.index}:${attempt}` : null,
  });

  const boxObserver = useRef<ResizeObserver | null>(null);
  const measureBox = useCallback((el: HTMLDivElement | null) => {
    calloutRef.current = el;
    boxObserver.current?.disconnect();
    boxObserver.current = null;
    if (!el) return;
    boxObserver.current = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setBox((prev) =>
          prev.w === r.width && prev.h === r.height
            ? prev
            : { w: r.width, h: r.height }
        );
      }
    });
    boxObserver.current.observe(el);
  }, []);

  if (typeof document === 'undefined') return null;
  if (!tour && !offeringResume) {
    if (!cheering) return null;
    return createPortal(
      <div
        data-tour-ignore=""
        data-click-outside-ignore="true"
        onClick={(e) => e.stopPropagation()}
        className="contents"
      >
        <TourDialog
          key="cheer"
          title={t('tours.completeTitle')}
          body=""
          sparty="cheer"
        >
          <button
            type="button"
            data-autofocus=""
            className={primaryBtn}
            onClick={() => setCheering(false)}
          >
            {t('tours.done')}
          </button>
        </TourDialog>
      </div>,
      document.body
    );
  }

  // Keyed by phase so each prompt mounts fresh and takes focus.
  const dialog = (
    title: string,
    body: string,
    actions: React.ReactNode,
    sparty?: SpartyPose
  ): React.ReactNode => (
    <TourDialog
      key={tour?.phase ?? 'resume'}
      title={title}
      body={body}
      sparty={showSparty ? sparty : undefined}
    >
      {actions}
    </TourDialog>
  );

  let content: React.ReactNode = null;
  let announcement = '';

  if (!tour) {
    const hasAdded =
      !!resumeOffer && widgets.some((w) => resumeOffer.addedIds.includes(w.id));
    content = dialog(
      t('tours.resumeTitle'),
      t('tours.resumeBody'),
      <>
        <button
          type="button"
          className={secondaryBtn}
          onClick={() => dismissResume(hasAdded)}
        >
          {hasAdded ? t('tours.removeAddedWidgets') : t('tours.endTour')}
        </button>
        <button
          type="button"
          data-autofocus=""
          className={primaryBtn}
          onClick={resumeTour}
        >
          {t('tours.resumeTour')}
        </button>
      </>
    );
  } else if (tour.phase === 'welcome') {
    const { set, steps, index, draft, retake } = tour;
    content = dialog(
      set.title.trim() || t('tours.welcomeTitle'),
      tourWelcome(set) ?? '',
      <>
        <button
          type="button"
          className={secondaryBtn}
          onClick={() => endTour()}
        >
          {t('tours.notNow')}
        </button>
        <button
          type="button"
          data-autofocus=""
          className={primaryBtn}
          onClick={() => begin(set, steps, index, null, { draft, retake })}
        >
          {t('tours.startTour')}
        </button>
      </>,
      'wave'
    );
  } else if (tour.phase === 'practice-offer') {
    content = dialog(
      t('tours.readOnlyTitle'),
      t('tours.readOnlyBody'),
      <>
        <button type="button" className={secondaryBtn} onClick={abandon}>
          {t('tours.cancel')}
        </button>
        <button
          type="button"
          data-autofocus=""
          className={primaryBtn}
          onClick={() => void startOnPracticeBoard()}
        >
          {t('tours.startPractice')}
        </button>
      </>
    );
  } else if (tour.phase === 'teardown') {
    content = dialog(
      t('tours.keepWidgetsTitle', { count: added.length }),
      '',
      <>
        <button
          type="button"
          className={secondaryBtn}
          onClick={() => {
            if (legacyAdded.length > 0) removeWidgets(legacyAdded);
            endTour();
          }}
        >
          {t('tours.putBoardBack')}
        </button>
        <button
          type="button"
          data-autofocus=""
          className={primaryBtn}
          onClick={() => endTour(true)}
        >
          {t('tours.keepWidgets')}
        </button>
      </>,
      finished ? 'cheer' : undefined
    );
  } else if (step && !(jumping && !editBlocked)) {
    const total = tour.steps.length;
    const title = step.label?.trim()
      ? step.label
      : t('tours.stepFallbackTitle');
    announcement = [
      t('tours.progress', { current: tour.index + 1, total }),
      title,
      step.text?.replace(/\*\*/g, '') ?? '',
    ]
      .filter(Boolean)
      .join('. ');
    const isMissing = anchor.status === 'missing';
    const autoText =
      autoStage === 'blocked'
        ? t(tour.edit ? 'tours.editor.youClick' : 'tours.autoSkipped')
        : autoStage === 'fallback'
          ? t('tours.autoFallback')
          : autoOn && autoStage !== 'confirm'
            ? t('tours.autoPlaying')
            : null;
    const autoStatus: TourTipStatus | null =
      autoText && (found || plain)
        ? {
            text: autoText,
            kind: waitingOnTeacher ? 'turn' : 'playing',
            testId: 'tour-auto-status',
          }
        : null;
    const binding = step.tour;
    // Hidden where Autopilot would only hand the step back, and while the switch is already playing it.
    const offerAutoStep =
      found &&
      !!binding &&
      binding.action !== 'observe' &&
      canPerform(binding) &&
      autopilotGate(binding, tour.policy) !== 'teacher' &&
      !autoBusy &&
      autoStage !== 'blocked' &&
      (!autoOn || autoStage === 'fallback');
    // Steps the teacher finishes by clicking the target, or that Autopilot moves on, need no Next here.
    const showTipNext =
      !autoRunning &&
      !autoBusy &&
      (!acted || action === 'type' || isMissing) &&
      !(tour.edit && tour.index + 1 === total);
    const status: TourTipStatus | null =
      autoStatus ??
      (staticHintOn
        ? {
            text: t('tours.yourTurn'),
            kind: 'turn',
            testId: 'tour-static-hint',
          }
        : null);
    const preview = isMissing && hasStepSlide(step);
    const width = Math.min(
      preview ? PREVIEW_WIDTH : plain ? PLAIN_WIDTH : CALLOUT_WIDTH,
      viewport.w - VIEWPORT_GUTTER * 2
    );
    const centred = placement
      ? null
      : centreTip({ w: width, h: box.h }, viewport, obstacles, VIEWPORT_GUTTER);
    const cueShown =
      cue &&
      center &&
      cue.index === tour.index &&
      cue.attempt === attempt &&
      Math.hypot(cue.to.x - center.x, cue.to.y - center.y) < 8
        ? cue
        : null;
    content = (
      <>
        {showDim && (
          <TourSpotlight
            rect={rect}
            onMisclick={misclick}
            pulse={anchor.centred}
          />
        )}
        {!tour.edit && (
          <TourBar
            current={tour.index + 1}
            total={total}
            onBack={
              tour.index > 0
                ? () => {
                    // Autopilot never replays a click the teacher went back to see.
                    if (autoOn) stopAutopilot();
                    goTo(tour.index - 1);
                  }
                : undefined
            }
            onNext={() => goTo(tour.index + 1)}
            onRetry={isMissing ? () => setAttempt((n) => n + 1) : undefined}
            autopilot={{ on: autoOn, onChange: setAutopilot }}
            readAloud={
              canRead
                ? { on: readAloud, onToggle: () => setReadAloud((on) => !on) }
                : undefined
            }
            onExit={() => finish()}
            onPlace={onBarPlace}
          />
        )}
        <TourTip
          key={tour.index}
          boxRef={measureBox}
          headingRef={headingRef}
          left={placement ? placement.left : (centred?.left ?? 0)}
          top={placement ? placement.top : (centred?.top ?? 0)}
          width={placement ? placement.width : width}
          tether={tether}
          plain={plain}
          animate={!reducedMotion}
          title={title}
          looking={anchor.status === 'searching'}
          status={status}
          onShowMe={hintOn && !autoBusy ? showMe : undefined}
          autopilotStep={offerAutoStep ? { onRun: runStep } : undefined}
          next={
            showTipNext
              ? {
                  onNext: () => goTo(tour.index + 1),
                  last: tour.index + 1 === total,
                }
              : undefined
          }
          confirm={
            autoStage === 'confirm'
              ? {
                  onYes: () => autoClickRef.current(true),
                  onNo: () => setAuto({ key: stepKey, stage: 'blocked' }),
                }
              : undefined
          }
        >
          {preview && (
            <Suspense fallback={null}>
              <TourMiniPlayer step={step} />
            </Suspense>
          )}
          {isMissing ? (
            <p className="text-sm text-slate-200">
              {t(
                preview ? 'tours.anchorMissingPreview' : 'tours.anchorMissing'
              )}
            </p>
          ) : (
            <>
              {step.text && (
                <p className="text-sm text-slate-100">
                  {renderStepText(step.text)}
                </p>
              )}
              {plain && step.question?.text.trim() && (
                <p className="text-sm font-semibold text-white">
                  {step.question.text}
                </p>
              )}
            </>
          )}
        </TourTip>
        {cueShown && (
          <div
            className="fixed inset-0"
            style={{ pointerEvents: 'none', zIndex: Z_INDEX.tourCursor }}
          >
            <AnimatedCursor
              key={`${cueShown.key}:${cueShown.to.x}:${cueShown.to.y}`}
              from={cueShown.from}
              to={cueShown.to}
              durationMs={cursorMs(
                Math.hypot(
                  cueShown.to.x - cueShown.from.x,
                  cueShown.to.y - cueShown.from.y
                ),
                { speed: 1, reducedMotion }
              )}
              ripple
              onDone={
                cueShown.auto
                  ? () => {
                      if (cueRef.current?.key === cueShown.key) {
                        autoClickRef.current();
                      }
                    }
                  : undefined
              }
            />
          </div>
        )}
      </>
    );
  }

  // No box of its own, so each layer stacks on its own z-index around a lifted dock.
  // Clicks on the tour's own controls must not reach the board, which deselects the widget a step points at.
  return createPortal(
    <div
      data-tour-ignore=""
      data-click-outside-ignore="true"
      onClick={(e) => e.stopPropagation()}
      data-testid="live-tour"
      className="contents pointer-events-none [&>*]:pointer-events-auto [&>svg]:pointer-events-none"
    >
      <div
        aria-live="polite"
        aria-atomic="true"
        data-testid="tour-announcer"
        className="sr-only"
      >
        {announcement}
      </div>
      {content}
    </div>,
    document.body
  );
};
