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
import {
  ChevronLeft,
  Hand,
  MousePointerClick,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  GuidedLearningPublicStep,
  GuidedLearningSet,
  GuidedLearningStep,
  TourWidgetLayout,
  WidgetType,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import {
  clearTourLayoutOverrides,
  clearTourWidgetPatches,
  setTourLayoutOverrides,
  setTourWidgetPatches,
  type TourWidgetPatch,
} from '@/context/dashboardCanvasStore';
import { loadBuildingSet } from '@/hooks/useGuidedLearning';
import { loadRunnableTour } from './publishedTours';
import { Z_INDEX } from '@/config/zIndex';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';
import { placeCallout } from '@/components/widgets/GuidedLearning/utils/calloutPlacement';
import {
  CALLOUT_IN_MS,
  cursorMs,
} from '@/components/widgets/GuidedLearning/utils/motion';
import { renderStepText } from '@/components/widgets/GuidedLearning/utils/richText';
import { AnimatedCursor } from '@/components/widgets/GuidedLearning/components/player/AnimatedCursor';
import { TRY_HINT_MS } from '@/components/widgets/GuidedLearning/components/player/playback';
import {
  speechAvailable,
  useReadAloud,
} from '@/components/widgets/GuidedLearning/components/player/useReadAloud';
import {
  clearStudioReturn,
  isTourRunning,
  setTourRunning,
  TOUR_START_EVENT,
  type TourStartRequest,
} from './tourState';
import {
  claimSpawns,
  claimTourWidgets,
  hasStepSlide,
  liveTourStepsOf,
  missingSetupWidgets,
  planTourSetup,
  teacherMustClick,
  tourLayoutOverridesAt,
  tourWelcome,
  tourWidgetIds,
  type SpawnWatch,
  type TourSlots,
  type TourWidgetClaims,
} from './tourSession';
import { ANCHOR_SEARCH_MS, useAnchorElement } from './useAnchorElement';
import { findTourAnchor, isAnchorUsable } from './resolveTourAnchor';
import { prerequisiteWidgetId, satisfyPrerequisite } from './tourPrerequisites';
import { TourDialog } from './TourDialog';
import {
  autoLeadMs,
  autoObserveMs,
  dispatchAutoClick,
  waitFor,
} from './autopilot';
import { TourSpotlight } from './TourSpotlight';
import {
  clearSavedTour,
  readSavedTour,
  writeSavedTour,
  type SavedTour,
} from './tourResume';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';
import { startTourRunLog, type TourRunLog } from './tourRuns';

const TourMiniPlayer = lazy(() => import('./TourMiniPlayer'));

type Phase = 'welcome' | 'practice-offer' | 'running' | 'teardown';

interface LaunchOptions {
  /** Widgets a reloaded run had already added, so teardown can still remove them. */
  claimIds?: readonly string[];
  skipWelcome?: boolean;
  /** Runs the Studio draft instead of the published snapshot. */
  draft?: boolean;
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
  draft?: boolean;
}

const EMPTY_LAYER = {
  tourIds: [] as string[],
  slots: {} as TourSlots,
  moved: {} as Record<number, TourWidgetLayout>,
  spawnWatch: [] as SpawnWatch[],
  restored: [] as string[],
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
type AutoStage = 'demo' | 'waiting' | 'yourTurn' | 'fallback';

const BOARD_WAIT_MS = 2000;
/** How often a step re-applies its anchor's prerequisite while the anchor is missing. */
const PREREQ_RETRY_MS = 400;
const CALLOUT_WIDTH = 320;
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
  const { canAccessFeature, user } = useAuth();
  const dashboard = useDashboard();
  const { activeDashboard, removeWidgets } = dashboard;
  const [tour, setTour] = useState<ActiveTour | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [box, setBox] = useState({ w: CALLOUT_WIDTH, h: 140 });
  const [paused, setPaused] = useState(false);
  const [takenOver, setTakenOver] = useState(false);
  const [auto, setAuto] = useState<{ key: string; stage: AutoStage } | null>(
    null
  );
  const autoClicking = useRef(false);
  const autoWait = useRef<AbortController | null>(null);
  const [readAloud, setReadAloud] = useState(false);
  const [cue, setCue] = useState<CursorCue | null>(null);
  const cueSeq = useRef(0);
  const startingRef = useRef(false);
  const reducedMotion = usePrefersReducedMotion();
  const [resumeOffer, setResumeOffer] = useState<SavedTour | null>(
    readSavedTour
  );
  const calloutRef = useRef<HTMLDivElement | null>(null);
  const runLog = useRef<TourRunLog | null>(null);

  // Async setup reads the newest dashboard actions, not the ones captured when it started.
  const latest = useRef({ dashboard, canAccessFeature, t, uid: user?.uid });
  latest.current = { dashboard, canAccessFeature, t, uid: user?.uid };

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
    if (claims !== tour.claims || spawned.bound.length > 0) {
      const moved = { ...tour.moved };
      for (const layout of spawned.bound) moved[layout.slot] = layout;
      setTour({
        ...tour,
        claims,
        slots: spawned.slots,
        moved,
        spawnWatch: spawned.watches,
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
      latest.current.dashboard.discardTourWidgets?.(tourIdsRef.current);
      clearTourLayoutOverrides();
      clearTourWidgetPatches();
      undoPrerequisites();
    },
    [undoPrerequisites]
  );

  // A running tour survives a reload as {setId, index, addedIds}.
  const saved: SavedTour | null =
    tour?.phase === 'running'
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
  const anchorScope = { widgetIds: added, slots: tour?.slots };
  const stepWidgetId = binding
    ? prerequisiteWidgetId(binding, widgets, anchorScope)
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
    const undo = satisfyPrerequisite({
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
    });
    if (undo && !prereqUndos.current.has(undo.key)) {
      prereqUndos.current.set(undo.key, undo.undo);
    }
  });
  // Sets up what the anchor needs before and while it is searched for.
  // Once the anchor has shown, a teacher who undoes the setup is not overridden until Retry.
  const prereqStep = tour?.index ?? 0;
  const prereqKey = `${prereqStep}:${attempt}`;
  const [prereqDone, setPrereqDone] = useState<string | null>(null);
  if (anchor.status === 'found' && prereqDone !== prereqKey) {
    setPrereqDone(prereqKey);
  }
  const needsPrereq =
    tour?.phase === 'running' &&
    !!binding &&
    anchor.status !== 'found' &&
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
    if (set.tourSetup?.layouts?.length && d.addTourWidget) {
      // Recorded layouts: unsaved tour widgets, and the teacher's own moved for now.
      const plan = planTourSetup(set, steps, current);
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
      uid && !opts.draft
        ? startTourRunLog(set.id, uid, { v: set.updatedAt, furthest: index })
        : null;
    setAttempt(0);
    setPaused(false);
    setTakenOver(false);
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
      draft: opts.draft,
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
      draft: opts.draft,
    });
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
          { ...opts, draft: req.draft }
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
    const { set, steps, index, draft } = tour;
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
    runSetup(set, steps, index, { draft });
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
    if (added.length > 0) {
      setTour({ ...tour, phase: 'teardown' });
      return;
    }
    endTour();
  };

  const goTo = (index: number) => {
    if (!tour) return;
    autoWait.current?.abort();
    setAuto(null);
    if (index >= tour.steps.length) {
      finish(true);
      return;
    }
    noteMiss();
    runLog.current?.update({ furthest: index });
    setAttempt(0);
    const next = Math.max(index, 0);
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

  // A click on the anchor advances once the app has handled it.
  useEffect(() => {
    const el = anchor.element;
    if (!el || step?.tour?.action !== 'click') return;
    let raf = 0;
    const onClick = () => {
      // Autopilot's own click waits for the next anchor instead.
      if (autoClicking.current) return;
      raf = requestAnimationFrame(() => advanceRef.current(stepIndex + 1));
    };
    el.addEventListener('click', onClick, true);
    return () => {
      el.removeEventListener('click', onClick, true);
      cancelAnimationFrame(raf);
    };
  }, [anchor.element, step?.tour?.action, stepIndex]);

  const running = tour?.phase === 'running';
  const offeringResume =
    !tour &&
    resumeOffer !== null &&
    !!activeDashboard &&
    canAccessFeature('gl-live-tours');
  const escapable = tour !== null || offeringResume;
  const active = tour !== null;
  useEffect(() => {
    setTourRunning(active);
    return () => setTourRunning(false);
  }, [active]);
  // Escape never destroys work: Keep on teardown, Cancel on the practice offer.
  const finishRef = useRef(finish);
  finishRef.current = !tour
    ? () => dismissResume(false)
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

  const rect = anchor.status === 'found' ? anchor.rect : null;
  const placement = rect
    ? placeCallout({
        box,
        target: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        container: viewport,
        obstacles: tourObstacles(),
      })
    : null;
  const center = rect
    ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    : null;
  const isClick = step?.tour?.action === 'click';
  // A step with no anchor is a centred card on the dimmed board.
  const plain = running && !!step && !step.tour;
  const cursorAllowed =
    running && center !== null && isClick && !step.cursor?.hide;
  // Guided runs on autopilot until paused or taken over; everything else is Structured.
  const guided = tour?.set.mode === 'guided' && !takenOver;
  const autopilot = guided && !paused;
  const stepKey = `${stepIndex}:${attempt}`;
  const autoStage = auto?.key === stepKey ? auto.stage : null;
  const found = running && anchor.status === 'found';
  const autoRunning = autopilot && (found || plain);
  const waitingOnTeacher = autoStage === 'yourTurn' || autoStage === 'fallback';
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

  // Autopilot clicks the anchor, then waits for the app to show the next step's anchor.
  const autoClick = () => {
    const el = anchor.element;
    if (!tour || !step?.tour || !el || !autopilot) {
      setAuto(null);
      return;
    }
    if (teacherMustClick(step.tour)) {
      setAuto({ key: stepKey, stage: 'yourTurn' });
      return;
    }
    const index = tour.index;
    const next = tour.steps[index + 1];
    setAuto({ key: stepKey, stage: 'waiting' });
    autoClicking.current = true;
    try {
      dispatchAutoClick(el);
    } finally {
      autoClicking.current = false;
    }
    const nextBinding = next?.tour;
    // A plain step next has nothing to wait for.
    if (!nextBinding) {
      requestAnimationFrame(() => advanceRef.current(index + 1));
      return;
    }
    autoWait.current?.abort();
    const ctrl = new AbortController();
    autoWait.current = ctrl;
    void waitFor(
      () =>
        !!findTourAnchor(nextBinding, {
          widgetIds: latestAdded.current,
          slots: latestSlots.current,
          accept: isAnchorUsable,
        }),
      ANCHOR_SEARCH_MS,
      ctrl.signal
    ).then((ok) => {
      if (ctrl.signal.aborted) return;
      if (ok) advanceRef.current(index + 1);
      else setAuto({ key: stepKey, stage: 'fallback' });
    });
  };
  const autoClickRef = useRef(autoClick);
  autoClickRef.current = autoClick;

  const startAutoDemo = useEffectEvent(() => {
    setAuto({ key: stepKey, stage: 'demo' });
    if (cursorAllowed && !reducedMotion) playCursor(true);
    else autoClickRef.current();
  });
  useEffect(() => {
    if (!autoRunning || !isClick || autoStage !== null || !step) return;
    const id = setTimeout(
      () => startAutoDemo(),
      autoLeadMs(step, tour?.set.watchPace)
    );
    return () => clearTimeout(id);
  }, [autoRunning, isClick, autoStage, stepKey, step, tour?.set.watchPace]);

  // Observe steps move on at reading pace.
  const observeMs =
    step && !isClick ? autoObserveMs(step, tour?.set.watchPace) : 0;
  useEffect(() => {
    if (!autoRunning || observeMs <= 0) return;
    const index = stepIndex;
    const id = setTimeout(() => advanceRef.current(index + 1), observeMs);
    return () => clearTimeout(id);
  }, [autoRunning, observeMs, stepIndex, attempt]);

  useEffect(() => () => autoWait.current?.abort(), []);

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
  const pause = () => {
    setPaused(true);
    autoWait.current?.abort();
    stopDemo();
  };
  // Autopilot already clicked this step before the pause, so resuming moves on.
  const resume = () => {
    setPaused(false);
    if (autoStage === 'waiting' && tour) goTo(tour.index + 1);
  };
  const takeOver = () => {
    setTakenOver(true);
    setPaused(false);
    autoWait.current?.abort();
    stopDemo();
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
    enabled: readAloud && canRead,
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

  if (typeof document === 'undefined' || (!tour && !offeringResume)) {
    return null;
  }

  // Keyed by phase so each prompt mounts fresh and takes focus.
  const dialog = (
    title: string,
    body: string,
    actions: React.ReactNode
  ): React.ReactNode => (
    <TourDialog key={tour?.phase ?? 'resume'} title={title} body={body}>
      {actions}
    </TourDialog>
  );

  const secondaryBtn =
    'rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60';
  const iconBtn =
    'rounded-md p-0.5 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60';
  const primaryBtn =
    'rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60';

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
    const { set, steps, index, draft } = tour;
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
          onClick={() => begin(set, steps, index, null, { draft })}
        >
          {t('tours.startTour')}
        </button>
      </>
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
      t('tours.keepWidgetsTitle'),
      t('tours.keepWidgetsBody'),
      <>
        <button
          type="button"
          className={secondaryBtn}
          onClick={() => {
            if (legacyAdded.length > 0) removeWidgets(legacyAdded);
            endTour();
          }}
        >
          {t('tours.removeWidgets')}
        </button>
        <button
          type="button"
          data-autofocus=""
          className={primaryBtn}
          onClick={() => endTour(true)}
        >
          {t('tours.keepWidgets')}
        </button>
      </>
    );
  } else if (step) {
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
    const autoStatus =
      !guided || !(found || plain)
        ? null
        : autoStage === 'yourTurn'
          ? t('tours.yourTurn')
          : autoStage === 'fallback'
            ? t('tours.autoFallback')
            : paused
              ? t('tours.autoPaused')
              : t('tours.autoPlaying');
    const preview = isMissing && hasStepSlide(tour.set, step);
    const width = Math.min(
      preview ? PREVIEW_WIDTH : plain ? PLAIN_WIDTH : CALLOUT_WIDTH,
      viewport.w - VIEWPORT_GUTTER * 2
    );
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
        {(anchor.status === 'found' || plain) && (
          <TourSpotlight rect={rect} onMisclick={misclick} />
        )}
        <div
          key={tour.index}
          ref={measureBox}
          role="dialog"
          aria-modal="false"
          aria-labelledby="tour-step-title"
          tabIndex={-1}
          data-tour-ignore=""
          data-testid="tour-callout"
          data-plain={plain ? '' : undefined}
          className="fixed flex flex-col gap-2 rounded-2xl bg-slate-900/90 px-4 py-3 text-white shadow-2xl ring-1 ring-black/40 border border-white/20 backdrop-blur-xl leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          style={{
            zIndex: Z_INDEX.tourCallout,
            ...(placement
              ? {
                  left: placement.left,
                  top: placement.top,
                  width: placement.width,
                }
              : {
                  left: Math.max(VIEWPORT_GUTTER, (viewport.w - width) / 2),
                  top: Math.max(VIEWPORT_GUTTER, (viewport.h - box.h) / 2),
                  width,
                }),
            animation: reducedMotion
              ? undefined
              : `gl-callout-in ${CALLOUT_IN_MS}ms ease-out both`,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div
              id="tour-step-title"
              ref={headingRef}
              tabIndex={-1}
              data-testid="tour-step-title"
              className="font-bold tracking-tight text-white rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              {title}
            </div>
            <div className="-mr-1 flex shrink-0 items-center gap-0.5">
              {canRead && (
                <button
                  type="button"
                  aria-pressed={readAloud}
                  onClick={() => setReadAloud((on) => !on)}
                  aria-label={t('glPlayer.readAloud')}
                  title={t('glPlayer.readAloud')}
                  className={iconBtn}
                >
                  {readAloud ? (
                    <Volume2 className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <VolumeX className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => finish()}
                aria-label={t('tours.exit')}
                title={t('tours.exit')}
                className={iconBtn}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          {isMissing ? (
            <>
              {preview && (
                <Suspense fallback={null}>
                  <TourMiniPlayer set={tour.set} step={step} />
                </Suspense>
              )}
              <p className="text-sm text-slate-200">
                {t(
                  preview ? 'tours.anchorMissingPreview' : 'tours.anchorMissing'
                )}
              </p>
            </>
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
          {anchor.status === 'searching' && (
            <p role="status" className="text-xs text-slate-300">
              {t('tours.looking')}
            </p>
          )}
          {staticHintOn && !autoStatus && (
            <p
              role="status"
              data-testid="tour-static-hint"
              className="flex items-center gap-1.5 self-start rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-900"
            >
              <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
              {t('tours.yourTurn')}
            </p>
          )}
          {autoStatus && (
            <p
              role="status"
              data-testid="tour-auto-status"
              className={`flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-xs font-semibold ${
                waitingOnTeacher
                  ? 'bg-white text-slate-900'
                  : 'bg-white/10 text-slate-200'
              }`}
            >
              {waitingOnTeacher ? (
                <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
              ) : paused ? (
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {autoStatus}
            </p>
          )}
          {guided && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={paused ? resume : pause}
                className={`${secondaryBtn} flex items-center gap-1`}
              >
                {paused ? (
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {paused ? t('tours.resume') : t('tours.pause')}
              </button>
              <button
                type="button"
                onClick={takeOver}
                className={`${secondaryBtn} flex items-center gap-1`}
              >
                <Hand className="h-3.5 w-3.5" aria-hidden="true" />
                {t('tours.takeOver')}
              </button>
            </div>
          )}
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300">
              {t('tours.progress', { current: tour.index + 1, total })}
            </span>
            <div className="flex items-center gap-1">
              {tour.index > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    // Autopilot never replays a click the teacher went back to see.
                    if (guided) setPaused(true);
                    goTo(tour.index - 1);
                  }}
                  className={`${secondaryBtn} flex items-center gap-1`}
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('tours.back')}
                </button>
              )}
              {hintOn && (
                <button
                  type="button"
                  onClick={showMe}
                  className={`${secondaryBtn} flex items-center gap-1`}
                >
                  <MousePointerClick
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  />
                  {t('tours.showMe')}
                </button>
              )}
              {isMissing && (
                <button
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                  className={secondaryBtn}
                >
                  {t('tours.retry')}
                </button>
              )}
              <button
                type="button"
                onClick={() => goTo(tour.index + 1)}
                className={primaryBtn}
              >
                {tour.index + 1 === total ? t('tours.done') : t('tours.next')}
              </button>
            </div>
          </div>
        </div>
        {cueShown && (
          <div
            className="fixed inset-0"
            style={{ pointerEvents: 'none', zIndex: Z_INDEX.tourCursor }}
          >
            <AnimatedCursor
              key={cueShown.key}
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
  return createPortal(
    <div
      data-tour-ignore=""
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
