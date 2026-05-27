import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import {
  WidgetData,
  RandomConfig,
  WidgetConfig,
  TimeToolConfig,
  RandomGroup,
  SharedGroup,
  ScoreboardTeam,
  Student,
} from '@/types';
import { Button } from '@/components/common/Button';
import { ActiveClassChip } from '@/components/common/ActiveClassChip';
import { AbsentButton } from '@/components/common/AbsentButton';
import { AbsentStudentsModal } from '@/components/common/AbsentStudentsModal';
import {
  Users,
  RefreshCw,
  Shuffle,
  Layers,
  RotateCcw,
  Trophy,
  UserX,
  UserPlus,
  Puzzle,
  Home,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { getAudioCtx, playTick, playWinner } from './audioUtils';
import { getLocalIsoDate } from '@/utils/localDate';
import { logError } from '@/utils/logError';
import { beginWidgetDrag, endWidgetDrag } from '@/utils/widgetDragFlag';
import {
  makeJigsawExpertGroups,
  makeNameGroups,
  makeNameGroupsByCount,
  makeRestrictedGroups,
  makeRestrictedGroupsByCount,
} from './groupMaker';
import {
  toggleLockedName,
  moveNameToGroup,
  mergeLockedWithFresh,
  shuffleWithLocks,
} from './randomEditHelpers';
import { withViewTransition } from '@/utils/viewTransition';

import { SCOREBOARD_COLORS as TEAM_COLORS } from '@/config/scoreboard';
import { RandomWheel } from './RandomWheel';
import { RandomSlots } from './RandomSlots';
import { RandomFlash, RANDOM_FLASH_PLACEHOLDER } from './RandomFlash';

// Cached length of the placeholder text so the result-text font formula can
// size around the exact string RandomFlash renders when no winner is set.
const PLACEHOLDER_LENGTH = RANDOM_FLASH_PLACEHOLDER.length;
import { RandomGroups } from './RandomGroups';
import { GroupSizeStepper } from './GroupSizeStepper';
import { ShuffleList } from './ShuffleList';

import { WidgetLayout } from '../WidgetLayout';

interface ModeCycleEntry {
  id: string;
  labelKey: string;
  defaultLabel: string;
  icon: LucideIcon;
}

const MODE_CYCLE: readonly ModeCycleEntry[] = [
  {
    id: 'single',
    labelKey: 'widgets.random.modes.single',
    defaultLabel: 'Pick One',
    icon: UserPlus,
  },
  {
    id: 'shuffle',
    labelKey: 'widgets.random.modes.shuffle',
    defaultLabel: 'Shuffle',
    icon: Layers,
  },
  {
    id: 'groups',
    labelKey: 'widgets.random.modes.groups',
    defaultLabel: 'Groups',
    icon: Users,
  },
  {
    id: 'jigsaw',
    labelKey: 'widgets.random.modes.jigsaw',
    defaultLabel: 'Jigsaw',
    icon: Puzzle,
  },
];

export const RandomWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { t } = useTranslation();
  const {
    updateWidget,
    updateDashboard,
    addWidget,
    addToast,
    rosters,
    activeRosterId,
    activeDashboard,
  } = useDashboard();
  const config = widget.config as RandomConfig;
  const {
    firstNames = '',
    lastNames = '',
    mode = 'single',
    soundEnabled = true,
    rosterMode = 'class',
    autoStartTimer = false,
    visualStyle = 'flash',
    groupSize: configGroupSize,
    jigsawHomeGroups,
    jigsawExpertGroups,
    jigsawView = 'home',
    numExpertGroups: configNumExpertGroups,
    numHomeGroups: configNumHomeGroups,
  } = config;
  const lockedNames = useMemo(
    () => (Array.isArray(config.lockedNames) ? config.lockedNames : []),
    [config.lockedNames]
  );
  const doneNames = useMemo(
    () => (Array.isArray(config.doneNames) ? config.doneNames : []),
    [config.doneNames]
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  // Classic jigsaw is "4 home groups of 4 → 4 expert groups of 4", so default
  // to 4 in jigsaw mode when the user hasn't explicitly set a size. Other
  // modes keep the historical default of 3. An explicit user choice always
  // wins (slider writes config.groupSize, which short-circuits the fallback).
  const groupSize = configGroupSize ?? (mode === 'jigsaw' ? 4 : 3);

  const remainingStudents = Array.isArray(config.remainingStudents)
    ? config.remainingStudents
    : [];

  const normalizeLastResult = (
    raw: RandomConfig['lastResult']
  ): string | string[] | string[][] | RandomGroup[] => {
    if (
      Array.isArray(raw) &&
      raw.length > 0 &&
      typeof raw[0] === 'object' &&
      raw[0] !== null &&
      'names' in raw[0]
    ) {
      return raw as RandomGroup[];
    }
    return (raw as string | string[] | string[][]) ?? '';
  };

  const [isSpinning, setIsSpinning] = useState(false);
  const [displayResult, setDisplayResult] = useState<
    string | string[] | string[][] | RandomGroup[]
  >(() => normalizeLastResult(config.lastResult));
  const [rotation, setRotation] = useState(0);

  // Monotonic generation counter for in-flight picks. Bumped whenever the
  // user resets, cycles modes, or the active roster changes mid-spin so the
  // deferred jigsaw/groups setTimeout can detect that its result is stale
  // and bail before clobbering the new state.
  const spinGenRef = useRef(0);

  // Sync displayResult when config.lastResult changes (e.g. mode switch clears
  // it) using the "adjusting state while rendering" pattern. Doing this in a
  // useEffect would leave displayResult stale for one render, which crashed
  // RandomFlash when the old value was RandomGroup[] and the new mode is
  // 'single'.
  const [prevLastResult, setPrevLastResult] = useState(config.lastResult);
  if (config.lastResult !== prevLastResult) {
    setPrevLastResult(config.lastResult);
    setDisplayResult(normalizeLastResult(config.lastResult));
  }

  // Local jigsaw groups state: render falls back to this when config hasn't
  // round-tripped yet (the gap between setIsSpinning(false) and the Firestore
  // listener replay) or when updateWidget is a no-op (e.g. view-only board).
  // Without it the UI stays empty after a Pick on view-only boards because
  // the jigsaw render reads exclusively from config.
  const [localJigsaw, setLocalJigsaw] = useState<{
    home: RandomGroup[];
    expert: RandomGroup[];
  } | null>(() => {
    const h = config.jigsawHomeGroups;
    const e = config.jigsawExpertGroups;
    if (Array.isArray(h) && h.length > 0) {
      return { home: h, expert: Array.isArray(e) ? e : [] };
    }
    return null;
  });

  // Adjust localJigsaw when the config-side jigsaw groups change (mode swap,
  // roster swap, manual reset). Reference equality is sufficient because
  // updateWidget rewrites the array on every change.
  const [prevJigsawHome, setPrevJigsawHome] = useState(jigsawHomeGroups);
  if (jigsawHomeGroups !== prevJigsawHome) {
    setPrevJigsawHome(jigsawHomeGroups);
    if (Array.isArray(jigsawHomeGroups) && jigsawHomeGroups.length > 0) {
      setLocalJigsaw({
        home: jigsawHomeGroups,
        expert: Array.isArray(jigsawExpertGroups) ? jigsawExpertGroups : [],
      });
    } else {
      setLocalJigsaw(null);
    }
  }

  // Track active roster to only clear when it actually changes
  const lastRosterRef = useRef<{ id: string | null; mode: string }>({
    id: activeRosterId,
    mode: rosterMode,
  });

  // Clear session data when active roster changes to avoid cross-contamination
  useEffect(() => {
    const changed =
      activeRosterId !== lastRosterRef.current.id ||
      rosterMode !== lastRosterRef.current.mode;

    if (changed) {
      lastRosterRef.current = { id: activeRosterId, mode: rosterMode };
      // Only write when there is actually transient state to clear —
      // otherwise every roster swap costs a Firestore round-trip.
      const hasTransientState =
        config.lastResult != null ||
        (config.remainingStudents?.length ?? 0) > 0 ||
        (config.jigsawHomeGroups?.length ?? 0) > 0 ||
        (config.jigsawExpertGroups?.length ?? 0) > 0 ||
        (config.lockedNames?.length ?? 0) > 0 ||
        (config.unassignedNames?.length ?? 0) > 0;
      if (hasTransientState) {
        spinGenRef.current += 1;
        const update: Partial<RandomConfig> = {
          lastResult: null,
          remainingStudents: [],
          jigsawHomeGroups: null,
          jigsawExpertGroups: null,
          jigsawView: 'home',
          lockedNames: [],
          unassignedNames: [],
        };
        updateWidget(widget.id, { config: update as WidgetConfig });
        setLocalJigsaw(null);
      }
    }
  }, [activeRosterId, widget.id, updateWidget, config, rosterMode]);

  const lastExternalTriggerRef = useRef(config.externalTrigger ?? 0);

  const activeRoster = useMemo(
    () => rosters.find((r) => r.id === activeRosterId),
    [rosters, activeRosterId]
  );

  const presentClassStudents = useMemo<Student[]>(() => {
    if (rosterMode !== 'class' || !activeRoster) return [];
    const today = getLocalIsoDate();
    const absentIds =
      activeRoster.absent?.date === today
        ? new Set(activeRoster.absent.studentIds)
        : new Set<string>();
    return activeRoster.students.filter((s) => !absentIds.has(s.id));
  }, [activeRoster, rosterMode]);

  const students = useMemo(() => {
    if (rosterMode === 'class' && activeRoster) {
      return presentClassStudents.map((s) =>
        `${s.firstName} ${s.lastName}`.trim()
      );
    }

    const firsts = firstNames
      .split('\n')
      .map((n: string) => n.trim())
      .filter((n: string) => n);

    const lasts = lastNames
      .split('\n')
      .map((n: string) => n.trim())
      .filter((n: string) => n);

    const count = Math.max(firsts.length, lasts.length);
    const combined = [];
    for (let i = 0; i < count; i++) {
      const f = firsts[i] || '';
      const l = lasts[i] || '';
      const name = `${f} ${l}`.trim();
      if (name) combined.push(name);
    }
    return combined;
  }, [firstNames, lastNames, activeRoster, rosterMode, presentClassStudents]);

  // Inline stepper display: mirror the call-site default so the on-widget
  // controls show what Pick will actually use until the user sets explicit
  // values. groupSize already has its own default applied above.
  const estimatedHomeGroupCount = Math.max(
    1,
    Math.ceil(students.length / Math.max(1, groupSize))
  );
  // Jigsaw HOME stepper drives a target home-group COUNT (parallel to the
  // EXPERT stepper). Fall back to the count implied by `groupSize` for
  // widgets created before `numHomeGroups` existed. Clamp to >= 2 so the
  // stepper/slider min (also 2) and the displayed value can never disagree
  // on tiny inputs (1 student, or groupSize > students).
  const displayNumHomeGroups = Math.max(
    2,
    configNumHomeGroups ?? estimatedHomeGroupCount
  );
  // EXPERT default is "2 home groups per expert group". Base it on the
  // home-group count the widget will actually use at pick time
  // (`displayNumHomeGroups`), not on the legacy `estimatedHomeGroupCount`
  // — otherwise an explicit `numHomeGroups` change wouldn't shift the
  // EXPERT default in sync.
  const displayNumExpertGroups =
    configNumExpertGroups ?? Math.max(2, Math.ceil(displayNumHomeGroups / 2));

  const setGroupSize = (next: number) => {
    // updateWidget merges partial config into existing state — don't spread
    // ...config here, since it's a closure-captured snapshot that may be stale.
    updateWidget(widget.id, {
      config: { groupSize: next } as WidgetConfig,
    });
  };
  const setNumExpertGroups = (next: number) => {
    updateWidget(widget.id, {
      config: { numExpertGroups: next } as WidgetConfig,
    });
  };
  const setNumHomeGroups = (next: number) => {
    updateWidget(widget.id, {
      config: { numHomeGroups: next } as WidgetConfig,
    });
  };

  // ───────── Manual editing state (locks, unassigned, placeholders) ─────────
  //
  // When mode is groups/jigsaw and no result exists yet, we still want to
  // show empty group cards so teachers can manually drag students into them.
  // Placeholders are kept in component state with stable UUIDs so chip
  // dragIds and droppable zone ids don't churn across renders. They only
  // regenerate when the desired count (group size / number of home groups /
  // student count) changes.
  const desiredPlaceholderCount = useMemo(() => {
    if (mode === 'jigsaw') return Math.max(1, displayNumHomeGroups);
    if (mode === 'groups') return Math.max(1, estimatedHomeGroupCount);
    return 0;
  }, [mode, displayNumHomeGroups, estimatedHomeGroupCount]);

  const buildPlaceholders = (count: number): RandomGroup[] =>
    Array.from({ length: count }, () => ({
      id: crypto.randomUUID(),
      names: [],
    }));

  const [placeholderGroups, setPlaceholderGroups] = useState<RandomGroup[]>(
    () => buildPlaceholders(desiredPlaceholderCount)
  );
  const [prevDesiredPlaceholderCount, setPrevDesiredPlaceholderCount] =
    useState(desiredPlaceholderCount);
  if (prevDesiredPlaceholderCount !== desiredPlaceholderCount) {
    setPrevDesiredPlaceholderCount(desiredPlaceholderCount);
    setPlaceholderGroups(buildPlaceholders(desiredPlaceholderCount));
  }

  const absentCount = useMemo(() => {
    if (rosterMode !== 'class' || !activeRoster) return 0;
    const today = getLocalIsoDate();
    if (activeRoster.absent?.date !== today) return 0;
    return activeRoster.absent.studentIds.length;
  }, [activeRoster, rosterMode]);

  const [absentModalOpen, setAbsentModalOpen] = useState(false);

  const shuffle = <T,>(array: T[]): T[] => {
    const newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
  };

  const handleReset = () => {
    spinGenRef.current += 1;
    const update: Partial<RandomConfig> = {
      remainingStudents: [],
      lastResult: null,
      jigsawHomeGroups: null,
      jigsawExpertGroups: null,
      jigsawView: 'home',
      lockedNames: [],
      unassignedNames: [],
    };
    updateWidget(widget.id, { config: update as WidgetConfig });
    setLocalJigsaw(null);
    setDisplayResult('');
    setRotation(0);
  };

  const currentModeMeta =
    MODE_CYCLE.find((m) => m.id === mode) ?? MODE_CYCLE[0];
  const currentModeLabel = t(currentModeMeta.labelKey, {
    defaultValue: currentModeMeta.defaultLabel,
  });
  const ModeIcon = currentModeMeta.icon;

  const cycleMode = () => {
    const idx = MODE_CYCLE.findIndex((m) => m.id === mode);
    const next = MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    spinGenRef.current += 1;
    const update: Partial<RandomConfig> = {
      mode: next.id,
      lastResult: null,
      jigsawHomeGroups: null,
      jigsawExpertGroups: null,
      jigsawView: 'home',
      lockedNames: [],
      unassignedNames: [],
    };
    updateWidget(widget.id, { config: update as WidgetConfig });
    setLocalJigsaw(null);
  };

  const setJigsawView = (view: 'home' | 'expert') => {
    if (jigsawView === view) return;
    updateWidget(widget.id, {
      config: { jigsawView: view },
    });
  };

  // Render-side jigsaw groups: prefer config (the source of truth that
  // survives reload) but fall back to localJigsaw so the UI never goes blank
  // between a Pick and the Firestore round-trip — and so view-only boards
  // (where updateWidget is a no-op) still show the picked groups locally.
  const renderedHomeGroups: RandomGroup[] | null =
    (Array.isArray(jigsawHomeGroups) && jigsawHomeGroups.length > 0
      ? jigsawHomeGroups
      : null) ??
    localJigsaw?.home ??
    null;
  const renderedExpertGroups: RandomGroup[] | null =
    (Array.isArray(jigsawExpertGroups) && jigsawExpertGroups.length > 0
      ? jigsawExpertGroups
      : null) ??
    localJigsaw?.expert ??
    null;
  const hasJigsawGroups =
    (renderedHomeGroups?.length ?? 0) > 0 ||
    (renderedExpertGroups?.length ?? 0) > 0;

  // ───────── Editable groups + unassigned tray plumbing ─────────
  //
  // currentGroups is whatever the user is currently looking at and may edit:
  //  • mode 'groups' with a result   → displayResult as RandomGroup[]
  //  • mode 'groups' empty           → placeholder groups (committed on first edit)
  //  • mode 'jigsaw' home view       → renderedHomeGroups, or placeholders
  //  • mode 'jigsaw' expert view     → renderedExpertGroups (no placeholder
  //                                    — expert groups are derived, so the
  //                                    "fresh" empty state happens only on
  //                                    the home tab)
  //  • mode 'shuffle' / 'single'     → null (handled elsewhere)
  const groupsFromDisplay = useMemo<RandomGroup[] | null>(() => {
    if (
      Array.isArray(displayResult) &&
      displayResult.length > 0 &&
      typeof displayResult[0] === 'object' &&
      displayResult[0] !== null &&
      'names' in (displayResult[0] as RandomGroup)
    ) {
      return displayResult as RandomGroup[];
    }
    return null;
  }, [displayResult]);

  const currentGroups = useMemo<RandomGroup[] | null>(() => {
    if (mode === 'groups') return groupsFromDisplay ?? placeholderGroups;
    if (mode === 'jigsaw') {
      if (jigsawView === 'expert') {
        return renderedExpertGroups ?? null;
      }
      return renderedHomeGroups ?? placeholderGroups;
    }
    return null;
  }, [
    mode,
    jigsawView,
    groupsFromDisplay,
    renderedHomeGroups,
    renderedExpertGroups,
    placeholderGroups,
  ]);

  // Commit a fresh groups array back to config under the right field for
  // the current mode/view. Mirrors the original handlePick `performUpdate`
  // shape but doesn't trigger any of the sound/effect/sharedGroups logic.
  const commitGroups = useCallback(
    (nextGroups: RandomGroup[], extra?: Partial<RandomConfig>) => {
      let update: Partial<RandomConfig> = { ...(extra ?? {}) };
      if (mode === 'groups') {
        update = { ...update, lastResult: nextGroups };
        setDisplayResult(nextGroups);
      } else if (mode === 'jigsaw') {
        if (jigsawView === 'expert') {
          update = { ...update, jigsawExpertGroups: nextGroups };
          setLocalJigsaw((prev) =>
            prev ? { ...prev, expert: nextGroups } : null
          );
        } else {
          // Editing home groups invalidates the previously-derived expert
          // groups — teachers expect to re-launch jigsaw after a manual
          // home edit. Clear expert so the next Randomize regenerates it.
          update = {
            ...update,
            jigsawHomeGroups: nextGroups,
            lastResult: nextGroups,
            jigsawExpertGroups: null,
          };
          setLocalJigsaw({ home: nextGroups, expert: [] });
        }
      }
      updateWidget(widget.id, { config: update as WidgetConfig });
    },
    [mode, jigsawView, updateWidget, widget.id]
  );

  const handleToggleLock = useCallback(
    (name: string) => {
      const next = toggleLockedName(lockedNames, name);
      updateWidget(widget.id, {
        config: { lockedNames: next } as WidgetConfig,
      });
    },
    [lockedNames, updateWidget, widget.id]
  );

  const handleToggleDone = useCallback(
    (name: string) => {
      const next = doneNames.includes(name)
        ? doneNames.filter((n) => n !== name)
        : [...doneNames, name];
      updateWidget(widget.id, {
        config: { doneNames: next } as WidgetConfig,
      });
    },
    [doneNames, updateWidget, widget.id]
  );

  // Transient flag that pulses on each rotate click so the rotate icon can
  // briefly spin (visual feedback that something happened — the rest of
  // the widget changes in place and doesn't otherwise hint at the action).
  const [isRotating, setIsRotating] = useState(false);
  const rotateAnimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rotate students one group forward (Group N's unlocked members go to
  // Group N+1; wraps around). Group IDs / names / colors stay put, so
  // sharedGroups customization survives. Mirrors the Stations widget's
  // clockwise rotate semantic — useful for jigsaw / station-style rotations
  // without needing a fresh randomize.
  const handleRotate = useCallback(() => {
    if (mode !== 'groups') return;
    if (!groupsFromDisplay || groupsFromDisplay.length < 2) {
      addToast(
        t('widgets.random.rotateNeedsTwoGroups', {
          defaultValue: 'Need at least two groups to rotate.',
        }),
        'info'
      );
      return;
    }
    const lockedSet = new Set(lockedNames);
    const N = groupsFromDisplay.length;
    // Unlocked members per group, in their current order.
    const unlockedByGroup = groupsFromDisplay.map((g) =>
      g.names.filter((n) => !lockedSet.has(n))
    );
    // Each group i RECEIVES the unlocked names from group (i-1+N)%N.
    const rotated = groupsFromDisplay.map((g, i) => {
      const kept = g.names.filter((n) => lockedSet.has(n));
      const incoming = unlockedByGroup[(i - 1 + N) % N];
      return { ...g, names: [...kept, ...incoming] };
    });
    // Wrap in a View Transition so chips visibly slide from their old
    // group cards to their new ones (when the browser supports it).
    withViewTransition(() => commitGroups(rotated));
    // Brief icon spin — matches the Randomize button's spin idiom so the
    // controls feel consistent under touch.
    if (rotateAnimTimer.current) clearTimeout(rotateAnimTimer.current);
    setIsRotating(true);
    rotateAnimTimer.current = setTimeout(() => setIsRotating(false), 500);
  }, [mode, groupsFromDisplay, lockedNames, commitGroups, addToast, t]);

  // Clean up the rotate-animation timer on unmount so it doesn't fire into
  // a dead component.
  useEffect(() => {
    return () => {
      if (rotateAnimTimer.current) clearTimeout(rotateAnimTimer.current);
    };
  }, []);

  const handleDragStart = useCallback((_event: DragStartEvent) => {
    beginWidgetDrag();
  }, []);

  const handleDragCancel = useCallback(() => {
    endWidgetDrag();
  }, []);

  const handleRenameGroup = useCallback(
    (groupId: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed || !groupId || groupId.startsWith('__no_id__:')) return;
      const existing = activeDashboard?.sharedGroups ?? [];
      const idx = existing.findIndex((g) => g.id === groupId);
      let next: SharedGroup[];
      if (idx >= 0) {
        next = existing.map((g, i) =>
          i === idx ? { ...g, name: trimmed } : g
        );
      } else {
        next = [...existing, { id: groupId, name: trimmed }];
      }
      updateDashboard({ sharedGroups: next });
    },
    [activeDashboard?.sharedGroups, updateDashboard]
  );

  const handleChangeGroupColor = useCallback(
    (groupId: string, color: string | null) => {
      if (!groupId || groupId.startsWith('__no_id__:')) return;
      const existing = activeDashboard?.sharedGroups ?? [];
      const idx = existing.findIndex((g) => g.id === groupId);
      let next: SharedGroup[];
      if (idx >= 0) {
        next = existing.map((g, i) => {
          if (i !== idx) return g;
          if (color) return { ...g, color };
          // Clearing the override: drop the color field so SharedGroup
          // doesn't leak undefined into Firestore.
          const { color: _drop, ...rest } = g;
          return rest;
        });
      } else if (color) {
        // First-touch: invent an entry so we have somewhere to store the
        // color. Name falls back to the synthetic default in RandomGroups.
        next = [...existing, { id: groupId, name: '', color }];
      } else {
        return;
      }
      updateDashboard({ sharedGroups: next });
    },
    [activeDashboard?.sharedGroups, updateDashboard]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      endWidgetDrag();
      const { active, over } = event;
      if (!over) return;
      const data = active.data.current as
        | { name?: string; sourceZoneId?: string }
        | undefined;
      const name = data?.name;
      const sourceZoneId = data?.sourceZoneId;
      if (!name || !sourceZoneId) return;

      const rawTargetId = String(over.id);
      // Resolve the target zone id (group id or shuffle row). Drops outside
      // a valid target are no-ops — removal happens through the AbsentButton
      // (roster level), not via the widget.
      let targetZoneId: string;
      if (rawTargetId.startsWith('group:')) {
        targetZoneId = rawTargetId.slice('group:'.length);
      } else if (rawTargetId.startsWith('shuffle-row:')) {
        targetZoneId = rawTargetId;
      } else if (rawTargetId === 'shuffle-list') {
        targetZoneId = 'shuffle-list';
      } else {
        return;
      }
      if (sourceZoneId === targetZoneId) return;

      // Shuffle: list + per-row drop targets.
      if (mode === 'shuffle') {
        const current = Array.isArray(displayResult)
          ? [...(displayResult as string[])]
          : [];
        const filtered = current.filter((n) => n !== name);
        let nextShuffle = filtered;

        if (targetZoneId.startsWith('shuffle-row:')) {
          const targetIdx = parseInt(
            targetZoneId.slice('shuffle-row:'.length),
            10
          );
          const clamped = Math.max(
            0,
            Math.min(
              filtered.length,
              Number.isFinite(targetIdx) ? targetIdx : filtered.length
            )
          );
          nextShuffle = [
            ...filtered.slice(0, clamped),
            name,
            ...filtered.slice(clamped),
          ];
        } else if (targetZoneId === 'shuffle-list') {
          nextShuffle = [...filtered, name];
        }

        setDisplayResult(nextShuffle);
        updateWidget(widget.id, {
          config: {
            lastResult: nextShuffle,
          } as WidgetConfig,
        });
        return;
      }

      // Groups / jigsaw
      if (!currentGroups) return;
      const nextGroups = moveNameToGroup(currentGroups, name, targetZoneId);
      commitGroups(nextGroups);
    },
    [mode, currentGroups, displayResult, commitGroups, updateWidget, widget.id]
  );

  const handleSendToScoreboard = () => {
    // 1. Normalize current groups from displayResult
    const rawResult = displayResult;
    let groups: RandomGroup[] | null = null;

    if (Array.isArray(rawResult) && rawResult.length > 0) {
      const first = rawResult[0];
      // Case A: Already in RandomGroup[] shape
      if (
        typeof first === 'object' &&
        first !== null &&
        'names' in (first as RandomGroup)
      ) {
        groups = rawResult as RandomGroup[];
      }
      // Case B: Legacy string[][] shape – convert to RandomGroup[]
      else if (Array.isArray(first)) {
        const stringGroups = rawResult as string[][];
        groups = stringGroups.map((names): RandomGroup => ({ names }));
      }
    }

    if (!groups || groups.length === 0) {
      return;
    }

    // 2. Map to ScoreboardTeam — inherit name AND color from sharedGroups
    // when available so a custom-colored group header in the Randomizer
    // shows up as the matching color on the Scoreboard. Falls back to the
    // sequential palette only for groups the teacher hasn't customized.
    const newTeams: ScoreboardTeam[] = groups.map((group, index) => {
      let name = `Group ${index + 1}`;
      let color: string = TEAM_COLORS[index % TEAM_COLORS.length];
      if (group.id && activeDashboard?.sharedGroups) {
        const shared = activeDashboard.sharedGroups.find(
          (g) => g.id === group.id
        );
        if (shared) {
          if (shared.name?.trim()) name = shared.name;
          if (shared.color) color = shared.color;
        }
      }

      return {
        id: crypto.randomUUID(),
        name,
        score: 0,
        color,
        linkedGroupId: group.id,
      };
    });

    // 3. Find or Create Scoreboard Widget
    const existingScoreboard = activeDashboard?.widgets.find(
      (w) => w.type === 'scoreboard'
    );

    if (existingScoreboard) {
      updateWidget(existingScoreboard.id, {
        config: {
          ...existingScoreboard.config,
          teams: newTeams,
        },
      });
      addToast(
        t('widgets.random.scoreboardUpdated', { count: newTeams.length }),
        'success'
      );
    } else {
      // Create new widget
      addWidget('scoreboard', {
        config: {
          teams: newTeams,
        },
      });
      addToast(
        t('widgets.random.scoreboardCreated', { count: newTeams.length }),
        'success'
      );
    }
  };

  // Collect this widget's prior-pick RandomGroup IDs so we can drop them
  // from dashboard.sharedGroups before adding the new ones — otherwise the
  // collection grows unboundedly across re-picks. Downstream consumers
  // (e.g. ScoreboardTeam.linkedGroupId) keep their own name field, so
  // dropping the link gracefully degrades to "name only" rather than
  // erroring.
  const collectPriorGroupIds = (): Set<string> => {
    const ids = new Set<string>();
    const fields: unknown[] = [
      config.lastResult,
      config.jigsawHomeGroups,
      config.jigsawExpertGroups,
    ];
    for (const field of fields) {
      if (!Array.isArray(field)) continue;
      for (const item of field) {
        if (
          item &&
          typeof item === 'object' &&
          'id' in item &&
          typeof (item as RandomGroup).id === 'string' &&
          (item as RandomGroup).id
        ) {
          ids.add((item as RandomGroup).id as string);
        }
      }
    }
    return ids;
  };

  const handlePick = async () => {
    if (students.length === 0) return;

    // CRITICAL: Resume AudioContext within the click handler to unlock sound
    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (e) {
        logError('RandomWidget.audioResume', e, { widgetId: widget.id });
      }
    }

    if (isSpinning) return;
    setIsSpinning(true);

    const performUpdate = (
      result: string | string[] | string[][] | RandomGroup[],
      remaining?: string[],
      nextUnassignedNames?: string[]
    ) => {
      try {
        // Firestore doesn't support nested arrays (e.g., string[][]).
        // If we have groups, we transform them into an array of objects.
        let syncResult = result;

        if (mode === 'groups' && Array.isArray(result) && result.length > 0) {
          // Check if it's string[][] (legacy)
          if (Array.isArray(result[0])) {
            syncResult = (result as string[][]).map((names) => ({
              names,
              id: crypto.randomUUID(),
            }));
          }
          // If it is already RandomGroup[] (has .names), we keep it
        }

        // If we have RandomGroups with IDs, sync them to Dashboard sharedGroups
        if (
          mode === 'groups' &&
          Array.isArray(syncResult) &&
          syncResult.length > 0 &&
          typeof syncResult[0] === 'object' &&
          'id' in syncResult[0]
        ) {
          const groups = syncResult as RandomGroup[];
          const newSharedGroups: SharedGroup[] = groups.map((g, i) => ({
            id: g.id ?? '',
            name: `Group ${i + 1}`,
          }));

          const existing = activeDashboard?.sharedGroups ?? [];
          // IDs that are being reused on this randomize carry the user's
          // rename + color — never drop those, only prune the truly dead
          // ones (e.g. group count went from 6 → 4 and the last 2 ids
          // disappear).
          const newIdSet = new Set(
            newSharedGroups.map((g) => g.id).filter(Boolean)
          );
          const dropIds = collectPriorGroupIds();
          const filtered = existing.filter(
            (g) => !dropIds.has(g.id) || newIdSet.has(g.id)
          );
          const uniqueNew = newSharedGroups.filter(
            (n) => n.id && !filtered.some((e) => e.id === n.id)
          );

          if (uniqueNew.length > 0 || filtered.length !== existing.length) {
            updateDashboard({ sharedGroups: [...filtered, ...uniqueNew] });
          }
        }

        // Optimized update: only send what changed.
        // DashboardContext now handles deep merging of config.
        const updates: Partial<RandomConfig> = {
          lastResult: syncResult as string | string[] | RandomGroup[],
        };
        if (remaining) {
          updates.remainingStudents = remaining;
        }
        if (nextUnassignedNames) {
          updates.unassignedNames = nextUnassignedNames;
        }

        updateWidget(widget.id, { config: updates as WidgetConfig });

        // Nexus: Auto-Start Timer Logic
        if (autoStartTimer && activeDashboard && mode === 'single') {
          const timeWidget = activeDashboard.widgets.find(
            (w) => w.type === 'time-tool'
          );

          if (timeWidget) {
            const timeConfig = timeWidget.config as TimeToolConfig;
            // Only start if not already running to avoid resetting start time unexpectedly
            if (!timeConfig.isRunning) {
              updateWidget(timeWidget.id, {
                config: {
                  ...timeConfig,
                  isRunning: true,
                  startTime: Date.now(),
                } as WidgetConfig,
              });
            }
          }
        }
      } catch (err) {
        logError('RandomWidget.pickSync', err, { widgetId: widget.id });
      }
    };

    if (mode === 'single') {
      let pool =
        remainingStudents.length > 0 ? remainingStudents : [...students];
      pool = pool.filter((s) => students.includes(s));

      if (pool.length === 0) {
        pool = [...students];
      }

      const winnerIndexInPool = Math.floor(Math.random() * pool.length);
      const winnerName = pool[winnerIndexInPool];
      const nextRemaining = pool.filter((_, i) => i !== winnerIndexInPool);

      if (visualStyle === 'flash') {
        let count = 0;
        const interval = setInterval(() => {
          const randomName =
            students[Math.floor(Math.random() * students.length)];
          setDisplayResult(randomName);
          if (soundEnabled) playTick(150 + Math.random() * 50);
          count++;
          if (count > 20) {
            clearInterval(interval);
            setDisplayResult(winnerName);
            if (soundEnabled) playWinner();
            setIsSpinning(false);
            performUpdate(winnerName, nextRemaining);
          }
        }, 80);
      } else if (visualStyle === 'wheel') {
        const extraSpins = 5;
        let winnerIndex = students.indexOf(winnerName);
        if (winnerIndex === -1) winnerIndex = 0;

        const segmentAngle = 360 / students.length;
        const targetRotation =
          rotation +
          360 * extraSpins +
          (360 - (winnerIndex * segmentAngle + segmentAngle / 2)) -
          (rotation % 360);

        setRotation(targetRotation);

        const duration = 4000;
        const startTime = Date.now();

        const tickSequence = (count: number) => {
          const elapsed = Date.now() - startTime;
          if (elapsed >= duration) {
            setDisplayResult(winnerName);
            if (soundEnabled) playWinner();
            setIsSpinning(false);
            performUpdate(winnerName, nextRemaining);
            return;
          }
          if (soundEnabled) playTick(150);
          const progress = elapsed / duration;
          const nextInterval = 50 + Math.pow(progress, 2) * 400;
          setTimeout(() => {
            tickSequence(count + 1);
          }, nextInterval);
        };
        tickSequence(0);
      } else if (visualStyle === 'slots') {
        let count = 0;
        const max = 25;
        const interval = setInterval(() => {
          const randomName =
            students[Math.floor(Math.random() * students.length)];
          setDisplayResult(randomName);
          if (soundEnabled) playTick(150, 0.05);
          count++;
          if (count > max) {
            clearInterval(interval);
            setDisplayResult(winnerName);
            if (soundEnabled) playWinner();
            setIsSpinning(false);
            performUpdate(winnerName, nextRemaining);
          }
        }, 100);
      }
    } else if (mode === 'jigsaw') {
      const myGen = ++spinGenRef.current;
      setTimeout(() => {
        // Bail if the user reset / cycled mode / changed class while the
        // 500 ms timeout was pending — otherwise we'd write home/expert
        // groups for a mode the user already moved away from.
        if (myGen !== spinGenRef.current) {
          setIsSpinning(false);
          return;
        }
        const lockedSet = new Set(lockedNames);
        // Locked students keep their existing group/position; everyone else
        // gets reshuffled. Roster-level absence is the only "sit-out" path.
        const includeName = (name: string) => !lockedSet.has(name);
        const existingHome = renderedHomeGroups;
        const useLockPath =
          lockedSet.size > 0 &&
          Array.isArray(existingHome) &&
          existingHome.length > 0;

        // Reuse the existing home-group IDs in order so sharedGroups custom
        // names/colors survive re-randomize. Expert groups regenerate from
        // scratch (their composition is derived) so they get fresh IDs and
        // are intentionally NOT preserved here.
        const preserveHomeIds = (gs: RandomGroup[]): RandomGroup[] => {
          if (!Array.isArray(existingHome)) return gs;
          return gs.map((g, i) => ({
            ...g,
            id: existingHome[i]?.id ?? g.id,
          }));
        };

        let homeGroups: RandomGroup[];
        if (rosterMode === 'class' && activeRoster) {
          const poolStudents = presentClassStudents.filter((s) =>
            includeName(`${s.firstName} ${s.lastName}`.trim())
          );
          const targetCount = useLockPath
            ? existingHome.length
            : displayNumHomeGroups;
          const { groups, unsatisfied } = makeRestrictedGroupsByCount(
            poolStudents,
            targetCount
          );
          homeGroups = useLockPath
            ? mergeLockedWithFresh({
                currentGroups: existingHome,
                lockedNames,
                freshGroups: groups,
              })
            : preserveHomeIds(groups);
          if (unsatisfied > 0) {
            addToast(
              t('widgets.random.restrictionsUnsatisfied', {
                defaultValue:
                  "Couldn't satisfy all restrictions — try again or adjust group size.",
              }),
              'warning'
            );
          }
        } else {
          const pool = students.filter(includeName);
          const targetCount = useLockPath
            ? existingHome.length
            : displayNumHomeGroups;
          const fresh = makeNameGroupsByCount(pool, targetCount);
          homeGroups = useLockPath
            ? mergeLockedWithFresh({
                currentGroups: existingHome,
                lockedNames,
                freshGroups: fresh,
              })
            : preserveHomeIds(fresh);
        }
        const numExpertGroups =
          configNumExpertGroups ??
          Math.max(2, Math.ceil(homeGroups.length / 2));
        const expertGroups = makeJigsawExpertGroups(
          homeGroups,
          numExpertGroups
        );

        // With < 2 home groups, "expert groups" degenerate into 1-person
        // singletons (each has nobody to compare notes with). With the
        // count-based HOME control, this only happens when the class itself
        // has fewer than 2 students — adjusting Number of Home Groups can't
        // help, so the message points at the only remedy.
        if (homeGroups.length < 2) {
          addToast(
            t('widgets.random.jigsawNeedsMultipleGroups', {
              defaultValue:
                'Jigsaw needs at least 2 students to form home groups — add more students.',
            }),
            'warning'
          );
        } else if (
          configNumHomeGroups != null &&
          homeGroups.length < configNumHomeGroups
        ) {
          // User requested more home groups than the class can fill —
          // makeNameGroupsByCount / makeRestrictedGroupsByCount clamp to
          // students.length to avoid empty groups, so surface the discrepancy.
          addToast(
            t('widgets.random.homeGroupCountReduced', {
              count: homeGroups.length,
              requested: configNumHomeGroups,
              defaultValue:
                'Only {{count}} home groups fit this class — lower the Number of Home Groups setting or add more students.',
            }),
            'warning'
          );
        } else if (
          configNumExpertGroups != null &&
          expertGroups.length < configNumExpertGroups
        ) {
          // The user explicitly set numExpertGroups too high for this class
          // size — the algorithm filtered empty buckets / merged singletons
          // and produced fewer groups than requested. Surface this so the
          // stepper value doesn't silently disagree with the visible result.
          addToast(
            t('widgets.random.expertGroupCountReduced', {
              count: expertGroups.length,
              requested: configNumExpertGroups,
              defaultValue:
                'Only {{count}} expert groups fit this class — lower the Number of Expert Groups setting or add more students.',
            }),
            'warning'
          );
        }

        if (soundEnabled) playWinner();
        // Wrap home-group state updates in a View Transition so chips
        // visibly move from old groups to new ones on re-randomize.
        withViewTransition(() => {
          setLocalJigsaw({ home: homeGroups, expert: expertGroups });
          setDisplayResult(homeGroups);
          setIsSpinning(false);
        });

        try {
          const newHomeShared: SharedGroup[] = homeGroups.map((g, i) => ({
            id: g.id ?? '',
            name: `Home Group ${i + 1}`,
          }));
          const newExpertShared: SharedGroup[] = expertGroups.map((g, i) => ({
            id: g.id ?? '',
            name: `Expert Group ${i + 1}`,
          }));
          const existing = activeDashboard?.sharedGroups ?? [];
          // Preserve user renames/colors on ids that survive — only drop
          // entries for ids that vanished entirely on this regenerate.
          const newIdSet = new Set(
            [...newHomeShared, ...newExpertShared]
              .map((g) => g.id)
              .filter(Boolean)
          );
          const dropIds = collectPriorGroupIds();
          const filtered = existing.filter(
            (g) => !dropIds.has(g.id) || newIdSet.has(g.id)
          );
          const uniqueNew = [...newHomeShared, ...newExpertShared].filter(
            (n) => n.id && !filtered.some((e) => e.id === n.id)
          );
          if (uniqueNew.length > 0 || filtered.length !== existing.length) {
            updateDashboard({ sharedGroups: [...filtered, ...uniqueNew] });
          }

          const update: Partial<RandomConfig> = {
            jigsawHomeGroups: homeGroups,
            jigsawExpertGroups: expertGroups,
            jigsawView: 'home',
            lastResult: homeGroups,
            // Clear any legacy "sit out" entries from older builds — those
            // are now expressed via roster absence, not widget state.
            unassignedNames: [],
          };
          updateWidget(widget.id, { config: update as WidgetConfig });
        } catch (err) {
          logError('RandomWidget.jigsawSync', err, { widgetId: widget.id });
        }
      }, 500);
    } else {
      const myGen = ++spinGenRef.current;
      setTimeout(() => {
        if (myGen !== spinGenRef.current) {
          setIsSpinning(false);
          return;
        }
        const lockedSet = new Set(lockedNames);
        // Locked students keep their existing slot/group; everyone else
        // gets reshuffled. Roster-level absence is the only "sit-out" path.
        const includeName = (name: string) => !lockedSet.has(name);

        let result: string[] | RandomGroup[];
        if (mode === 'shuffle') {
          const existing =
            Array.isArray(displayResult) &&
            displayResult.length > 0 &&
            typeof displayResult[0] === 'string'
              ? (displayResult as string[])
              : null;
          if (existing && lockedSet.size > 0) {
            // Lock-aware: keep locked names at their current indices,
            // shuffle the rest.
            result = shuffleWithLocks(existing, lockedNames);
          } else {
            result = shuffle(students);
          }
        } else {
          const existingGroups = groupsFromDisplay;
          const useLockPath =
            lockedSet.size > 0 &&
            Array.isArray(existingGroups) &&
            existingGroups.length > 0;

          // Reuse the existing group IDs in order, so any sharedGroups
          // entries (custom name + color) stay attached to the same "slot"
          // across re-randomize. The lock-aware path already preserves IDs
          // via mergeLockedWithFresh; this helper handles the no-lock paths.
          const preserveIds = (gs: RandomGroup[]): RandomGroup[] => {
            if (!Array.isArray(existingGroups)) return gs;
            return gs.map((g, i) => ({
              ...g,
              id: existingGroups[i]?.id ?? g.id,
            }));
          };

          if (rosterMode === 'class' && activeRoster) {
            const poolStudents = presentClassStudents.filter((s) =>
              includeName(`${s.firstName} ${s.lastName}`.trim())
            );
            if (useLockPath) {
              const targetCount = existingGroups.length;
              const { groups, unsatisfied } = makeRestrictedGroupsByCount(
                poolStudents,
                targetCount
              );
              result = mergeLockedWithFresh({
                currentGroups: existingGroups,
                lockedNames,
                freshGroups: groups,
              });
              if (unsatisfied > 0) {
                addToast(
                  t('widgets.random.restrictionsUnsatisfied', {
                    defaultValue:
                      "Couldn't satisfy all restrictions — try again or adjust group size.",
                  }),
                  'warning'
                );
              }
            } else {
              const { groups, unsatisfied } = makeRestrictedGroups(
                poolStudents,
                groupSize
              );
              result = preserveIds(groups);
              if (unsatisfied > 0) {
                addToast(
                  t('widgets.random.restrictionsUnsatisfied', {
                    defaultValue:
                      "Couldn't satisfy all restrictions — try again or adjust group size.",
                  }),
                  'warning'
                );
              }
            }
          } else {
            if (useLockPath) {
              const targetCount = existingGroups.length;
              const unlockedPool = students.filter((n) => !lockedSet.has(n));
              const fresh = makeNameGroupsByCount(unlockedPool, targetCount);
              result = mergeLockedWithFresh({
                currentGroups: existingGroups,
                lockedNames,
                freshGroups: fresh,
              });
            } else {
              result = preserveIds(makeNameGroups(students, groupSize));
            }
          }
        }
        if (soundEnabled) playWinner();
        // Wrap the state updates in a View Transition so chips slide from
        // their old positions to new ones (groups + shuffle modes) instead
        // of snapping. Falls back to a plain update on browsers without
        // View Transition support.
        withViewTransition(() => {
          setDisplayResult(result);
          setIsSpinning(false);
          // Always clear legacy unassignedNames after a successful pick.
          performUpdate(result, undefined, []);
        });
      }, 500);
    }
  };

  const handlePickRef = useRef(handlePick);
  handlePickRef.current = handlePick;

  useEffect(() => {
    if (
      config.externalTrigger &&
      config.externalTrigger > lastExternalTriggerRef.current
    ) {
      lastExternalTriggerRef.current = config.externalTrigger;
      if (!isSpinning) {
        void handlePickRef.current();
      }
    }
  }, [config.externalTrigger, isSpinning]);

  // Use the longest individual word (not full name length) so that a single
  // word is never forced to wrap. cqw (container-width-relative) units ensure
  // the chosen font size fits within the widget's actual width regardless of
  // the widget's aspect ratio.
  const maxWordLength = useMemo(
    () =>
      students
        .flatMap((name) => name.trim().split(/\s+/))
        .reduce((maxLen, word) => Math.max(maxLen, word.length), 0),
    [students]
  );

  // Size the result text to fit the CURRENTLY DISPLAYED string so short
  // winners ("1.") fill the widget instead of being pinned to whatever the
  // longest student name in the roster happens to be.
  //
  // Horizontal fit: 75/N cqw guarantees an N-char single word fits inside
  // the widget. The numerator comes from Lexend bold uppercase running
  // ~1.13× font-size per char (wider than typical sans-serif because of
  // letters like R/E/A/D/W) with a ~15 % safety margin —
  // i.e. 100 % / (1.13 × 1.15) ≈ 75 cqw per character. Multi-word strings
  // wrap at ASCII whitespace (white-space normal, no mid-word breaks)
  // so the formula only needs to fit the longest single word.
  //
  // Caps: cqw clamps to [4, 80]. The 80 ceiling lets 1-2 char results
  // ("1.", "X") grow into available vertical space without being clipped
  // by an artificially tight horizontal cap. cqh cap of 60 gives single-
  // word results room to fill ~60 % of widget height while still leaving
  // two lines' worth of room for a typical FirstName-LastName pick that
  // wraps (60×2 = 120 cqh; vertical clipping only kicks in on widgets
  // shorter than ~83 % of the line-height-doubled font, which is rare for
  // teacher-sized widgets).
  //
  // NBSP-joined names ("Mary[NBSP]Smith"): we split on ASCII whitespace
  // only, NOT \s, because CSS `white-space: normal` does not wrap at NBSP
  // — splitting on it would size the font for a single word but the
  // browser would render the NBSP-joined string as one unbreakable unit
  // and overflow horizontally.
  //
  // Falls back to `PLACEHOLDER_LENGTH` ("Ready?") when displayResult is
  // empty / not a string (e.g. Groups mode), so the formula stays defined
  // independently of roster contents (a 1-letter "Q" roster must not
  // shrink the placeholder font formula).
  const displayedWordLength = useMemo(() => {
    if (typeof displayResult !== 'string' || displayResult.length === 0) {
      return 0;
    }
    return displayResult
      .trim()
      .split(/[ \t\n\r\f\v]+/)
      .reduce((maxLen, word) => Math.max(maxLen, word.length), 0);
  }, [displayResult]);
  const resFontSize = useMemo(() => {
    // Three regimes — keep them in sync with the tests in
    // tests/components/widgets/RandomWidget.test.tsx "text scaling" block:
    //   - Spinning: use the roster's worst-case word so the font is stable
    //     across animation ticks (otherwise every random name swap retriggers
    //     a font-size transition mid-spin).
    //   - Settled winner: size to the actually-displayed string so short
    //     winners ("1.") fill the widget.
    //   - Placeholder (no displayResult): use PLACEHOLDER_LENGTH so the
    //     placeholder text RandomFlash renders ("Ready?") fits regardless
    //     of what roster (or empty roster) is loaded.
    let effectiveLength: number;
    if (isSpinning) {
      effectiveLength = maxWordLength > 0 ? maxWordLength : PLACEHOLDER_LENGTH;
    } else if (displayedWordLength > 0) {
      effectiveLength = displayedWordLength;
    } else {
      effectiveLength = PLACEHOLDER_LENGTH;
    }
    const cqwValue = Math.min(
      80,
      Math.max(4, Math.round(75 / effectiveLength))
    );
    return `min(${cqwValue}cqw, 60cqh)`;
  }, [isSpinning, displayedWordLength, maxWordLength]);

  const renderSinglePick = () => {
    if (visualStyle === 'wheel' && students.length > 0) {
      const wheelSize = Math.min(widget.w * 0.95, widget.h * 0.8);

      return (
        <RandomWheel
          students={students}
          rotation={rotation}
          wheelSize={wheelSize}
          displayResult={displayResult as string | string[] | string[][] | null}
          isSpinning={isSpinning}
          resultFontSize={resFontSize}
        />
      );
    }

    if (visualStyle === 'slots') {
      return (
        <RandomSlots
          displayResult={displayResult as string | string[] | string[][] | null}
          fontSize={resFontSize}
          slotHeight={widget.h * 0.5}
        />
      );
    }

    return (
      <RandomFlash
        displayResult={displayResult as string | string[] | string[][] | null}
        isSpinning={isSpinning}
        fontSize={resFontSize}
      />
    );
  };

  const absentModal =
    activeRoster && rosterMode === 'class' ? (
      <AbsentStudentsModal
        isOpen={absentModalOpen}
        onClose={() => setAbsentModalOpen(false)}
        roster={activeRoster}
      />
    ) : null;

  if (students.length === 0) {
    const everyoneAbsent =
      rosterMode === 'class' &&
      activeRoster &&
      activeRoster.students.length > 0 &&
      absentCount >= activeRoster.students.length;

    return (
      <>
        <div
          className="flex flex-col items-center justify-center h-full text-slate-400 text-center"
          style={{
            padding: 'min(24px, 5cqmin)',
            gap: 'min(12px, 3cqmin)',
          }}
        >
          <Users
            className="opacity-20"
            style={{
              width: 'min(48px, 12cqmin)',
              height: 'min(48px, 12cqmin)',
            }}
          />
          <div>
            <p
              className="uppercase tracking-widest font-bold"
              style={{
                fontSize: 'min(14px, 3.5cqmin)',
                marginBottom: 'min(4px, 1cqmin)',
              }}
            >
              {everyoneAbsent
                ? t('widgets.random.everyoneAbsentTitle', {
                    defaultValue: 'Everyone Absent Today',
                  })
                : t('widgets.random.noNamesTitle', {
                    defaultValue: 'No Names Provided',
                  })}
            </p>
            <p style={{ fontSize: 'min(12px, 3cqmin)' }}>
              {everyoneAbsent
                ? t('widgets.random.everyoneAbsentSubtitle', {
                    defaultValue: 'Tap below to update attendance.',
                  })
                : t('widgets.random.noNamesSubtitle', {
                    defaultValue:
                      'Flip this widget to enter your student roster.',
                  })}
            </p>
          </div>
          {everyoneAbsent && (
            <button
              onClick={() => setAbsentModalOpen(true)}
              className="flex items-center bg-brand-blue-primary text-white rounded-full font-bold hover:bg-brand-blue-dark transition-colors"
              style={{
                marginTop: 'min(8px, 2cqmin)',
                gap: 'min(8px, 2cqmin)',
                padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
                fontSize: 'min(14px, 3.5cqmin)',
              }}
            >
              <UserX
                style={{
                  width: 'min(14px, 3.5cqmin)',
                  height: 'min(14px, 3.5cqmin)',
                }}
              />
              {t('widgets.random.updateAttendance', {
                defaultValue: 'Update attendance',
              })}
            </button>
          )}
        </div>
        {absentModal}
      </>
    );
  }

  return (
    <>
      <WidgetLayout
        padding="p-0"
        header={
          <div
            className="flex justify-between items-center w-full"
            style={{
              padding:
                'clamp(4px, 1.5cqmin, 12px) clamp(8px, 2.5cqmin, 20px) 0',
            }}
          >
            <div
              className="flex items-center"
              style={{ gap: 'clamp(6px, 2cqmin, 14px)' }}
            >
              <button
                type="button"
                onClick={cycleMode}
                disabled={isSpinning}
                className="flex items-center rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-brand-blue-primary focus-visible:outline-offset-2"
                style={{
                  gap: 'clamp(6px, 1.5cqmin, 10px)',
                  padding:
                    'clamp(6px, 1.5cqmin, 10px) clamp(10px, 2.5cqmin, 18px)',
                  minHeight: 'clamp(32px, 8cqmin, 48px)',
                }}
                aria-label={t('widgets.random.modeChipAria', {
                  mode: currentModeLabel,
                  defaultValue: 'Operation mode: {{mode}}',
                })}
                title={t('widgets.random.modeChipTitle', {
                  mode: currentModeLabel,
                  defaultValue: 'Mode: {{mode}} — click to cycle',
                })}
              >
                <ModeIcon
                  className="text-brand-blue-primary shrink-0"
                  style={{
                    width: 'clamp(14px, 4cqmin, 22px)',
                    height: 'clamp(14px, 4cqmin, 22px)',
                  }}
                />
                <span
                  className="font-black uppercase text-brand-blue-primary truncate min-w-0 tracking-widest"
                  style={{ fontSize: 'clamp(13px, 3.5cqmin, 18px)' }}
                >
                  {currentModeLabel}
                </span>
              </button>
              {mode === 'single' && (
                <>
                  <button
                    onClick={handleReset}
                    disabled={
                      isSpinning ||
                      (remainingStudents.length === 0 && !displayResult)
                    }
                    className="hover:bg-slate-100 rounded-full text-slate-400 hover:text-brand-blue-primary transition-all disabled:opacity-30"
                    style={{ padding: 'clamp(6px, 2cqmin, 14px)' }}
                    title="Reset student pool"
                  >
                    <RotateCcw
                      style={{
                        width: 'clamp(14px, 4cqmin, 28px)',
                        height: 'clamp(14px, 4cqmin, 28px)',
                      }}
                    />
                  </button>
                  {remainingStudents.length > 0 && (
                    <span
                      className="font-black text-slate-500 uppercase tracking-tight bg-slate-50 rounded border border-slate-200"
                      style={{
                        fontSize: 'clamp(10px, 2.6cqmin, 18px)',
                        padding:
                          'clamp(2px, 0.7cqmin, 6px) clamp(6px, 2cqmin, 14px)',
                      }}
                    >
                      {remainingStudents.length} Left
                    </span>
                  )}
                </>
              )}
            </div>
            <div
              className="flex items-center"
              style={{ gap: 'clamp(6px, 1.5cqmin, 10px)' }}
            >
              {/* AbsentButton is the canonical "remove a student" entry
                  point — only valid when a class roster is active, since
                  absence is stored on the roster doc. */}
              {activeRoster && rosterMode === 'class' && (
                <AbsentButton
                  roster={activeRoster}
                  onClick={() => setAbsentModalOpen(true)}
                />
              )}
              {/* Class selector is always visible so teachers can pick or
                  switch a class straight from the header, regardless of
                  whether the widget started in custom-names mode. */}
              <ActiveClassChip compact />
            </div>
          </div>
        }
        content={
          mode === 'single' ? (
            <div className="flex-1 flex flex-col w-full h-full self-stretch min-h-0 overflow-hidden items-center justify-center">
              {renderSinglePick()}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={pointerWithin}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div className="flex-1 flex flex-col w-full h-full self-stretch min-h-0 overflow-hidden">
                <div
                  className="w-full flex-1 min-h-0 flex flex-col"
                  style={{
                    padding: 'clamp(6px, 1.5cqmin, 12px) min(8px, 2cqmin) 0',
                  }}
                >
                  {mode === 'jigsaw' ? (
                    <RandomGroups
                      displayResult={
                        jigsawView === 'expert'
                          ? renderedExpertGroups
                          : (renderedHomeGroups ?? placeholderGroups)
                      }
                      sharedGroups={activeDashboard?.sharedGroups}
                      groupNamePrefix={
                        jigsawView === 'expert' ? 'Expert Group' : 'Home Group'
                      }
                      editable
                      lockedNames={lockedNames}
                      onToggleLock={handleToggleLock}
                      onRenameGroup={handleRenameGroup}
                      onChangeGroupColor={handleChangeGroupColor}
                    />
                  ) : mode === 'shuffle' ? (
                    <ShuffleList
                      names={
                        Array.isArray(displayResult) &&
                        (displayResult.length === 0 ||
                          !Array.isArray(displayResult[0])) &&
                        (displayResult.length === 0 ||
                          typeof displayResult[0] === 'string')
                          ? (displayResult as string[])
                          : []
                      }
                      lockedNames={lockedNames}
                      onToggleLock={handleToggleLock}
                      doneNames={doneNames}
                      onToggleDone={handleToggleDone}
                    />
                  ) : (
                    <RandomGroups
                      displayResult={groupsFromDisplay ?? placeholderGroups}
                      sharedGroups={activeDashboard?.sharedGroups}
                      editable
                      lockedNames={lockedNames}
                      onToggleLock={handleToggleLock}
                      onRenameGroup={handleRenameGroup}
                      onChangeGroupColor={handleChangeGroupColor}
                    />
                  )}
                </div>
              </div>
            </DndContext>
          )
        }
        footer={
          mode === 'jigsaw' && hasJigsawGroups ? (
            <div
              className="w-full flex items-stretch"
              style={{
                padding: 'clamp(6px, 1.5cqmin, 14px) clamp(8px, 2cqmin, 16px)',
                gap: 'clamp(6px, 1.5cqmin, 12px)',
              }}
            >
              <GroupSizeStepper
                value={displayNumExpertGroups}
                onChange={setNumExpertGroups}
                label={t('widgets.random.expertLabelShort', {
                  defaultValue: 'EXPERT',
                })}
                title={t('widgets.random.expertGroupCount', {
                  defaultValue: 'Number of Expert Groups',
                })}
              />
              <Button
                variant={jigsawView === 'expert' ? 'primary' : 'secondary'}
                shape="pill"
                size="md"
                onClick={() => setJigsawView('expert')}
                disabled={jigsawView === 'expert'}
                aria-pressed={jigsawView === 'expert'}
                aria-label={t('widgets.random.launchJigsaw', {
                  defaultValue: 'Launch Jigsaw',
                })}
                className="flex-1 min-w-0"
                style={{
                  height: 'clamp(40px, 10cqmin, 72px)',
                  paddingLeft: 'clamp(10px, 3cqmin, 24px)',
                  paddingRight: 'clamp(10px, 3cqmin, 24px)',
                }}
                title={t('widgets.random.launchJigsawHint', {
                  defaultValue: 'Show expert groups',
                })}
                icon={
                  <Sparkles
                    style={{
                      width: 'clamp(16px, 4.5cqmin, 32px)',
                      height: 'clamp(16px, 4.5cqmin, 32px)',
                    }}
                  />
                }
              >
                <span
                  className="font-black uppercase tracking-wider truncate"
                  style={{ fontSize: 'clamp(11px, 3cqmin, 18px)' }}
                >
                  {t('widgets.random.launchJigsawShort', {
                    defaultValue: 'Expert',
                  })}
                </span>
              </Button>
              <GroupSizeStepper
                value={displayNumHomeGroups}
                onChange={setNumHomeGroups}
                label={t('widgets.random.homeLabelShort', {
                  defaultValue: 'HOME',
                })}
                title={t('widgets.random.homeGroupCount', {
                  defaultValue: 'Number of Home Groups',
                })}
              />
              <Button
                variant={jigsawView === 'home' ? 'primary' : 'secondary'}
                shape="pill"
                size="md"
                onClick={() => setJigsawView('home')}
                disabled={jigsawView === 'home'}
                aria-pressed={jigsawView === 'home'}
                aria-label={t('widgets.random.launchHomeGroup', {
                  defaultValue: 'Launch Home Group',
                })}
                className="flex-1 min-w-0"
                style={{
                  height: 'clamp(40px, 10cqmin, 72px)',
                  paddingLeft: 'clamp(10px, 3cqmin, 24px)',
                  paddingRight: 'clamp(10px, 3cqmin, 24px)',
                }}
                title={t('widgets.random.launchHomeGroupHint', {
                  defaultValue: 'Return to home groups',
                })}
                icon={
                  <Home
                    style={{
                      width: 'clamp(16px, 4.5cqmin, 32px)',
                      height: 'clamp(16px, 4.5cqmin, 32px)',
                    }}
                  />
                }
              >
                <span
                  className="font-black uppercase tracking-wider truncate"
                  style={{ fontSize: 'clamp(11px, 3cqmin, 18px)' }}
                >
                  {t('widgets.random.launchHomeGroupShort', {
                    defaultValue: 'Home',
                  })}
                </span>
              </Button>
              <Button
                variant="hero"
                size="md"
                shape="pill"
                onClick={handlePick}
                disabled={isSpinning}
                className="flex-shrink-0"
                style={{
                  width: 'clamp(40px, 10cqmin, 72px)',
                  height: 'clamp(40px, 10cqmin, 72px)',
                  padding: 0,
                }}
                aria-label={isSpinning ? 'Picking' : 'Randomize'}
                title={isSpinning ? 'Picking...' : 'Randomize'}
                icon={
                  <Shuffle
                    className={isSpinning ? 'animate-spin' : ''}
                    style={{
                      width: 'clamp(20px, 5cqmin, 36px)',
                      height: 'clamp(20px, 5cqmin, 36px)',
                    }}
                  />
                }
              />
            </div>
          ) : (
            <div
              className="w-full flex"
              style={{
                padding: 'clamp(6px, 1.5cqmin, 14px) clamp(8px, 2cqmin, 16px)',
                gap: 'clamp(6px, 2cqmin, 14px)',
              }}
            >
              {mode === 'groups' &&
                Array.isArray(displayResult) &&
                displayResult.length > 0 &&
                ((typeof displayResult[0] === 'object' &&
                  displayResult[0] !== null &&
                  'names' in displayResult[0]) ||
                  Array.isArray(displayResult[0])) && (
                  <Button
                    variant="secondary"
                    shape="pill"
                    onClick={handleSendToScoreboard}
                    aria-label={t('widgets.random.sendToScoreboard')}
                    style={{
                      width: 'clamp(40px, 10cqmin, 72px)',
                      height: 'clamp(40px, 10cqmin, 72px)',
                      padding: 0,
                    }}
                    className="flex-shrink-0"
                    title={t('widgets.random.sendToScoreboard')}
                    icon={
                      <Trophy
                        style={{
                          width: 'clamp(20px, 5cqmin, 36px)',
                          height: 'clamp(20px, 5cqmin, 36px)',
                        }}
                        className="text-amber-500"
                      />
                    }
                  />
                )}
              {mode === 'groups' && (
                <GroupSizeStepper
                  value={groupSize}
                  onChange={setGroupSize}
                  title={t('widgets.random.groupSize', {
                    defaultValue: 'Group Size',
                  })}
                />
              )}
              {mode === 'jigsaw' && !hasJigsawGroups && (
                <>
                  <GroupSizeStepper
                    value={displayNumHomeGroups}
                    onChange={setNumHomeGroups}
                    label={t('widgets.random.homeLabelShort', {
                      defaultValue: 'HOME',
                    })}
                    title={t('widgets.random.homeGroupCount', {
                      defaultValue: 'Number of Home Groups',
                    })}
                  />
                  <GroupSizeStepper
                    value={displayNumExpertGroups}
                    onChange={setNumExpertGroups}
                    label={t('widgets.random.expertLabelShort', {
                      defaultValue: 'EXPERT',
                    })}
                    title={t('widgets.random.expertGroupCount', {
                      defaultValue: 'Number of Expert Groups',
                    })}
                  />
                </>
              )}
              {/* Rotate: shifts each group's unlocked members one group
                  forward. Only relevant once groups exist and there are
                  at least two of them. */}
              {mode === 'groups' &&
                Array.isArray(displayResult) &&
                displayResult.length > 1 &&
                ((typeof displayResult[0] === 'object' &&
                  displayResult[0] !== null &&
                  'names' in displayResult[0]) ||
                  Array.isArray(displayResult[0])) && (
                  <Button
                    variant="secondary"
                    shape="pill"
                    onClick={handleRotate}
                    aria-label={t('widgets.random.rotateGroups', {
                      defaultValue: 'Rotate groups',
                    })}
                    style={{
                      width: 'clamp(40px, 10cqmin, 72px)',
                      height: 'clamp(40px, 10cqmin, 72px)',
                      padding: 0,
                    }}
                    className="flex-shrink-0 ml-auto"
                    title={t('widgets.random.rotateGroupsHint', {
                      defaultValue:
                        'Rotate — shift each group forward by one (locked students stay put).',
                    })}
                    icon={
                      <RefreshCw
                        className={isRotating ? 'animate-spin' : ''}
                        style={{
                          width: 'clamp(20px, 5cqmin, 36px)',
                          height: 'clamp(20px, 5cqmin, 36px)',
                        }}
                      />
                    }
                  />
                )}
              <Button
                variant="hero"
                size="md"
                shape="pill"
                onClick={handlePick}
                disabled={isSpinning}
                className={`flex-shrink-0${mode === 'groups' && Array.isArray(displayResult) && displayResult.length > 1 ? '' : ' ml-auto'}`}
                style={{
                  width: 'clamp(40px, 10cqmin, 72px)',
                  height: 'clamp(40px, 10cqmin, 72px)',
                  padding: 0,
                }}
                aria-label={isSpinning ? 'Picking' : 'Randomize'}
                title={isSpinning ? 'Picking...' : 'Randomize'}
                icon={
                  <Shuffle
                    className={isSpinning ? 'animate-spin' : ''}
                    style={{
                      width: 'clamp(20px, 5cqmin, 36px)',
                      height: 'clamp(20px, 5cqmin, 36px)',
                    }}
                  />
                }
              />
            </div>
          )
        }
      />
      {absentModal}
    </>
  );
};
