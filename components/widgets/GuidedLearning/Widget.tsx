import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  lazy,
  Suspense,
} from 'react';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  AssignmentMode,
  WidgetData,
  GuidedLearningConfig,
  GuidedLearningSet,
  GuidedLearningSetMetadata,
  GuidedLearningAssignment,
  StudentOverride,
  StudentTargetRef,
} from '@/types';
import { db, functions } from '@/config/firebase';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useAuth } from '@/context/useAuth';
import { useGuidedLearning } from '@/hooks/useGuidedLearning';
import { useGuidedLearningSessionTeacher } from '@/hooks/useGuidedLearningSession';
import { useGuidedLearningAssignments } from '@/hooks/useGuidedLearningAssignments';
import { useFolders } from '@/hooks/useFolders';
import { useBusyIdSet } from '@/hooks/useBusyIdSet';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import {
  AssignModal,
  AssignTargetingSection,
  ViewOnlyShareModal,
  type AssignTargetingValue,
} from '@/components/common/library';
import { PublishScoresModal } from '@/components/common/library/PublishScoresModal';
import { AssignClassPicker } from '@/components/common/AssignClassPicker';
import {
  makeEmptyPickerValue,
  type AssignClassPickerValue,
} from '@/components/common/AssignClassPicker.helpers';
import {
  deriveSessionTargetsFromRosters,
  mapLegacyClassIdsToRosterIds,
} from '@/utils/resolveAssignmentTargets';
import {
  buildSetAssignmentTargetsPayload,
  EMPTY_ASSIGN_TARGETING_VALUE,
} from '@/utils/studentTargetRef';
import { Loader2 } from 'lucide-react';
import { normalizeGuidedLearningSet } from './utils/setMigration';
import { useStorage } from '@/hooks/useStorage';
import { ImportWizard } from '@/components/common/library/importer/ImportWizard';
import { createGuidedLearningImportAdapter } from './adapters/guidedLearningImportAdapter';
import {
  buildGlExportFilename,
  embedSetImages,
  prepareImportedSet,
  rehostImportedSetImages,
} from './utils/glTransfer';
import { pickThumbnailUrl } from '@/utils/guidedLearningMedia';
import { SetPrefetchCache } from './utils/setPrefetchCache';
import { skippedTargetsToastMessage } from '@/utils/assignTargetingSkippedToast';

// Code-split (Phase 5): heavy GL surfaces load on demand, not with the dashboard.
const GuidedLearningManager = lazy(() =>
  import('./components/GuidedLearningManager').then((m) => ({
    default: m.GuidedLearningManager,
  }))
);
const GuidedLearningEditorModal = lazy(() =>
  import('./components/GuidedLearningEditorModal').then((m) => ({
    default: m.GuidedLearningEditorModal,
  }))
);
const GuidedLearningPlayer = lazy(() =>
  import('./components/GuidedLearningPlayer').then((m) => ({
    default: m.GuidedLearningPlayer,
  }))
);
const GuidedLearningResults = lazy(() =>
  import('./components/GuidedLearningResults').then((m) => ({
    default: m.GuidedLearningResults,
  }))
);
const GuidedLearningAIGenerator = lazy(() =>
  import('./components/GuidedLearningAIGenerator').then((m) => ({
    default: m.GuidedLearningAIGenerator,
  }))
);

const GL_PERSONAL_COLLECTION = 'guided_learning';

const LazySpinner: React.FC = () => (
  <div className="h-full flex items-center justify-center">
    <Loader2
      className="text-indigo-400 animate-spin"
      style={{ width: 'min(32px, 8cqmin)', height: 'min(32px, 8cqmin)' }}
    />
  </div>
);

// Absolute overlay spinner for lazily-loaded modal/dialog surfaces.
const LazyOverlaySpinner: React.FC = () => (
  <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/30">
    <Loader2
      className="text-white animate-spin"
      style={{ width: 'min(32px, 8cqmin)', height: 'min(32px, 8cqmin)' }}
    />
  </div>
);

// Visible fixed overlay while the editor modal chunk loads (no dead clicks).
const ModalChunkFallback: React.FC = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
    <Loader2 className="h-8 w-8 animate-spin text-white" />
  </div>
);

/**
 * Mirrors `functions/src/studentAssignmentTargets.ts`'s
 * `SetAssignmentTargetsInput`/`Result` — `functions/` isn't resolvable from
 * the client bundle, so the shape is duplicated here (spec §5 B3).
 */
interface SetAssignmentTargetsCallableInput {
  assignmentId: string;
  kind: 'guided-learning';
  sessionId: string;
  add: StudentTargetRef[];
  remove: StudentTargetRef[];
  overridesBySourcedId: Record<string, StudentOverride | null>;
  window: {
    openAt?: number | null;
    closeAt?: number | null;
    dueAt?: number | null;
  };
  targetMode?: 'class' | 'students';
}
interface SetAssignmentTargetsCallableResult {
  written: number;
  removed: number;
  skipped: { ref: StudentTargetRef; reason: string }[];
}

/**
 * Pending Assign-dialog target (Phase 3C). Holds the already-loaded set
 * and its source hint so the confirm step can create the matching
 * assignment doc once the teacher picks (or skips) a ClassLink target
 * class.
 */
interface AssignDialogTarget {
  set: GuidedLearningSet;
  source: 'personal' | 'building';
  originSetId: string;
}

export const GuidedLearningWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addToast, rosters } = useDashboard();
  const { showConfirm } = useDialog();
  const { user, isAdmin, getAssignmentMode } = useAuth();
  const assignmentMode: AssignmentMode = getAssignmentMode('guidedLearning');
  const isViewOnly = assignmentMode === 'view-only';
  const rawConfig = widget.config as GuidedLearningConfig;
  // Normalize legacy 'editor' view — the inline editor is removed; use the modal instead
  const config = useMemo<GuidedLearningConfig>(
    () =>
      rawConfig.view === 'editor'
        ? { ...rawConfig, view: 'library' }
        : rawConfig,
    [rawConfig]
  );

  const {
    sets,
    buildingSets,
    loading,
    buildingLoading,
    isDriveConnected,
    saveSet,
    loadSetData,
    deleteSet,
    duplicateSet,
    saveBuildingSet,
    deleteBuildingSet,
    duplicateBuildingSet,
  } = useGuidedLearning(user?.uid);

  const { createSession } = useGuidedLearningSessionTeacher(user?.uid);

  const {
    assignments,
    loading: assignmentsLoading,
    createAssignment,
    archiveAssignment,
    unarchiveAssignment,
    deleteAssignment,
    publishAssignmentScores,
    unpublishAssignmentScores,
  } = useGuidedLearningAssignments(user?.uid);

  // Local component state
  const [loadingSet, setLoadingSet] = useState(false);
  const [activeSet, setActiveSet] = useState<GuidedLearningSet | null>(null);
  const [editingSet, setEditingSet] = useState<GuidedLearningSet | null>(null);
  const [editingMeta, setEditingMeta] =
    useState<GuidedLearningSetMetadata | null>(null);

  const { folders: glFolders, moveItem: moveGlItem } = useFolders(
    user?.uid,
    'guided_learning'
  );
  const [showAIGen, setShowAIGen] = useState(false);
  // Shared rapid-click guards (personal sets + admin building sets).
  // See `hooks/useBusyIdSet.ts`.
  const personalDuplicateBusy = useBusyIdSet();
  const buildingDuplicateBusy = useBusyIdSet();
  const [recentSessionIds, setRecentSessionIds] = useState<
    Record<string, string>
  >({});

  // Live ClassLink fetching is no longer performed at assign time; imported
  // ClassLink rosters carry their own `classlinkClassId` metadata so the
  // student SSO gate resolves purely from rosters. Live ClassLink data is
  // reached only via the Classes sidebar's Import dialog.

  // ─── Assign dialog state ─────────────────────────────────────────────────
  // When a teacher clicks "Assign", we pause to let them optionally pick
  // target rosters before actually creating the session.
  const [assignTarget, setAssignTarget] = useState<AssignDialogTarget | null>(
    null
  );
  // Ephemeral modal state for the per-assignment "Publish Scores" picker.
  // Mirrors the QuizWidget / VideoActivityWidget pattern.
  const [publishingAssignment, setPublishingAssignment] =
    useState<GuidedLearningAssignment | null>(null);
  const [pickerValue, setPickerValue] = useState<AssignClassPickerValue>(() =>
    makeEmptyPickerValue()
  );
  // Individual students & overrides + window (spec §5 B3) — always resets to
  // 'class' mode for a fresh assign dialog; there is no persisted-preference
  // path here (unlike roster memory below), matching the acceptance
  // criterion that class-wide assign stays the unchanged default.
  const [targetingValue, setTargetingValue] = useState<AssignTargetingValue>(
    EMPTY_ASSIGN_TARGETING_VALUE
  );

  // Reset the picker when the dialog re-opens for a different set
  // (adjust-state-while-rendering pattern — no effect needed).
  const [prevAssignTarget, setPrevAssignTarget] =
    useState<AssignDialogTarget | null>(null);
  if (assignTarget !== prevAssignTarget) {
    setPrevAssignTarget(assignTarget);
    setTargetingValue(EMPTY_ASSIGN_TARGETING_VALUE);
    if (assignTarget) {
      // Prefer unified roster memory; fall back to legacy ClassLink-sourcedId
      // maps so teachers upgrading from pre-unification configs don't lose
      // their per-set preselection on first launch.
      let rememberedRosters =
        config.lastRosterIdsBySetId?.[assignTarget.originSetId] ?? [];
      if (rememberedRosters.length === 0) {
        const legacyMulti =
          config.lastClassIdsBySetId?.[assignTarget.originSetId];
        const legacySingle =
          config.lastClassIdBySetId?.[assignTarget.originSetId];
        const legacyClassIds =
          legacyMulti ?? (legacySingle ? [legacySingle] : undefined);
        rememberedRosters = mapLegacyClassIdsToRosterIds(
          legacyClassIds,
          rosters
        );
      }
      setPickerValue({ rosterIds: rememberedRosters });
    }
  }

  const setView = useCallback(
    (view: GuidedLearningConfig['view']) => {
      updateWidget(widget.id, {
        config: { ...config, view } as GuidedLearningConfig,
      });
    },
    [updateWidget, widget.id, config]
  );

  // Prefetch cache keyed by set id — each selection owns its own promise, so
  // rapid card-to-card clicks never race each other.
  const prefetchCacheRef = useRef(new SetPrefetchCache<GuidedLearningSet>());

  // Fetch set data (building sets skip Drive), deduped through the cache.
  const fetchSetCached = useCallback(
    async (
      setId: string,
      driveFileId?: string,
      buildingSet?: GuidedLearningSet
    ): Promise<GuidedLearningSet | null> => {
      if (buildingSet) return normalizeGuidedLearningSet(buildingSet);
      if (!driveFileId) return null;
      // Version by the realtime metadata updatedAt so edits elsewhere refetch.
      const version = sets.find((s) => s.id === setId)?.updatedAt;
      return prefetchCacheRef.current.fetch(
        setId,
        () => loadSetData(driveFileId).then(normalizeGuidedLearningSet),
        version
      );
    },
    [loadSetData, sets]
  );

  // Fire-and-forget warmup on card select so Play is instant.
  const prefetchSet = useCallback(
    (setId: string, driveFileId?: string, buildingSet?: GuidedLearningSet) => {
      void fetchSetCached(setId, driveFileId, buildingSet).catch(
        () => undefined
      );
    },
    [fetchSetCached]
  );

  // Silent loader for the library's inline preview (no widget-level spinner).
  const loadSetForPreview = useCallback(
    async (
      setId: string,
      driveFileId?: string,
      buildingSet?: GuidedLearningSet
    ): Promise<GuidedLearningSet | null> => {
      try {
        return await fetchSetCached(setId, driveFileId, buildingSet);
      } catch {
        return null;
      }
    },
    [fetchSetCached]
  );

  // Load set data from Drive or use building set directly
  const loadSet = useCallback(
    async (
      setId: string,
      driveFileId?: string,
      buildingSet?: GuidedLearningSet
    ): Promise<GuidedLearningSet | null> => {
      if (buildingSet) return normalizeGuidedLearningSet(buildingSet);
      if (!driveFileId) return null;
      setLoadingSet(true);
      try {
        return await fetchSetCached(setId, driveFileId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load set';
        addToast(msg, 'error');
        return null;
      } finally {
        setLoadingSet(false);
      }
    },
    [fetchSetCached, addToast]
  );

  const handlePlay = async (
    setId: string,
    driveFileId?: string,
    buildingSet?: GuidedLearningSet
  ) => {
    const data = await loadSet(setId, driveFileId, buildingSet);
    if (!data) return;
    setActiveSet(data);
    setView('player');
  };

  const handleEdit = async (
    setId: string,
    driveFileId?: string,
    buildingSet?: GuidedLearningSet
  ) => {
    if (buildingSet) {
      setEditingSet(buildingSet);
      setEditingMeta(null);
    } else {
      const meta = sets.find((s) => s.id === setId) ?? null;
      const data = await loadSet(setId, driveFileId);
      if (!data) return;
      setEditingSet(data);
      setEditingMeta(meta);
    }
  };

  // The Manager delegates save routing back here: building sets go to
  // Firestore-only via saveBuildingSet, personal sets go through Drive +
  // Firestore metadata via saveSet. The Manager never sees this branching.
  const handleSave = async (set: GuidedLearningSet, driveFileId?: string) => {
    // Saved content invalidates any prefetched copy.
    prefetchCacheRef.current.invalidate(set.id);
    if (set.isBuilding) {
      await saveBuildingSet(set);
      addToast('Building set saved.', 'success');
    } else {
      await saveSet(set, driveFileId);
      addToast('Set saved to Drive.', 'success');
    }
  };

  const handleDelete = async (setId: string, driveFileId: string) => {
    prefetchCacheRef.current.invalidate(setId);
    try {
      await deleteSet(setId, driveFileId);
      addToast('Set deleted.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete';
      addToast(msg, 'error');
    }
  };

  const handleDeleteBuilding = async (setId: string) => {
    try {
      await deleteBuildingSet(setId);
      addToast('Building set deleted.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete';
      addToast(msg, 'error');
    }
  };

  // Actually create the session + matching assignment doc. Shared between
  // the classic direct-assign path (no ClassLink/rosters), the picker
  // dialog confirm path, and the view-only Share confirm path. `classIds`
  // is the selected ClassLink sourcedId list; `periodNames` is the list of
  // post-PIN period labels (empty when the teacher targeted nothing).
  //
  // When `silent` is true, the function returns the URL without writing to
  // the clipboard or showing a toast — the caller is responsible for the
  // post-creation UI (used by the view-only Share modal which displays the
  // link inline). Throws on failure so callers can surface their own error
  // path; non-silent callers swallow + toast.
  const performAssign = useCallback(
    async (
      data: GuidedLearningSet,
      source: 'personal' | 'building',
      originSetId: string,
      rosterIds: string[],
      targeting: AssignTargetingValue = EMPTY_ASSIGN_TARGETING_VALUE,
      options?: { silent?: boolean }
    ): Promise<string | null> => {
      const silent = options?.silent === true;
      try {
        const selectedRosters = rosters.filter((r) => rosterIds.includes(r.id));
        const derived = deriveSessionTargetsFromRosters(selectedRosters);
        const url = await createSession(
          data,
          derived.classIds,
          derived.periodNames,
          derived.rosterIds,
          assignmentMode,
          {
            openAt: targeting.openAt,
            closeAt: targeting.closeAt,
            dueAt: targeting.dueAt,
          }
        );
        const sessionId = url.split('/').pop() ?? '';
        setRecentSessionIds((prev) => ({
          ...prev,
          [originSetId]: sessionId,
        }));
        if (sessionId) {
          try {
            await createAssignment({
              sessionId,
              setId: data.id,
              setTitle: data.title,
              source,
              rosterIds: derived.rosterIds,
              assignmentMode,
              targetGroupIds: targeting.targetGroupIds,
              overridesBySourcedId: targeting.overridesByKey,
              openAt: targeting.openAt,
              closeAt: targeting.closeAt,
              dueAt: targeting.dueAt,
            });
          } catch (err) {
            console.warn('[GuidedLearning] Failed to record assignment:', err);
          }
          // Call the CF strictly when the teacher chose per-student targeting
          // — a class-wide assignment, even with a Schedule window, never
          // depends on this callable (window fields already landed on the
          // session/assignment docs above via createSession/createAssignment),
          // so a Cloud Functions hiccup can't regress today's plain assign.
          if (targeting.targetMode === 'students') {
            const payload = buildSetAssignmentTargetsPayload(
              undefined,
              targeting
            );
            try {
              const callable = httpsCallable<
                SetAssignmentTargetsCallableInput,
                SetAssignmentTargetsCallableResult
              >(functions, 'setAssignmentTargetsV1');
              const res = await callable({
                assignmentId: sessionId,
                kind: 'guided-learning',
                sessionId,
                ...payload,
              });
              const skippedCount = res.data.skipped?.length ?? 0;
              if (skippedCount > 0) {
                addToast(skippedTargetsToastMessage(skippedCount), 'error');
                // D3 edit-in-place must also refresh targetSkippedCount on re-assign.
                await updateDoc(
                  doc(
                    db,
                    'users',
                    user?.uid ?? '',
                    'guided_learning_assignments',
                    sessionId
                  ),
                  { targetSkippedCount: skippedCount }
                );
              }
            } catch (err) {
              console.warn(
                '[GuidedLearning] Failed to apply individual targeting:',
                err
              );
              addToast(
                'Could not apply individual targeting. Try editing the assignment again.',
                'error'
              );
            }
          }
        }
        // Persist the teacher's last-used roster selection per set.
        const prevMap = config.lastRosterIdsBySetId ?? {};
        const nextMap: Record<string, string[]> = { ...prevMap };
        if (rosterIds.length > 0) {
          nextMap[originSetId] = rosterIds;
        } else {
          delete nextMap[originSetId];
        }
        updateWidget(widget.id, {
          config: {
            ...config,
            lastRosterIdsBySetId: nextMap,
          } as GuidedLearningConfig,
        });
        if (!silent) {
          await navigator.clipboard.writeText(url);
          addToast(
            isViewOnly
              ? 'Share link copied to clipboard!'
              : 'Assignment link copied to clipboard!',
            'success'
          );
        }
        return url;
      } catch (err) {
        if (silent) {
          // Re-throw so the view-only modal's own catch path can render
          // the inline error.
          throw err;
        }
        const msg =
          err instanceof Error ? err.message : 'Failed to create session';
        addToast(msg, 'error');
        return null;
      }
    },
    [
      rosters,
      createSession,
      createAssignment,
      addToast,
      config,
      updateWidget,
      widget.id,
      assignmentMode,
      isViewOnly,
      user?.uid,
    ]
  );

  // ─── View-only Share modal state ────────────────────────────────────────
  // View-only "shares" deliberately bypass the AssignModal/picker flow
  // because class targeting has no functional effect on view-only sessions
  // (Firestore rules don't gate views by class; sessions are filtered out
  // of /my-assignments anyway). The teacher gets a single confirmation
  // modal with a description + Create Share Link button.
  const [viewOnlyShareTarget, setViewOnlyShareTarget] =
    useState<AssignDialogTarget | null>(null);
  const [viewOnlyShareLink, setViewOnlyShareLink] = useState<string | null>(
    null
  );
  const [viewOnlyShareError, setViewOnlyShareError] = useState<string | null>(
    null
  );
  const [isCreatingViewOnlyShare, setIsCreatingViewOnlyShare] = useState(false);

  const handleAssign = async (
    setId: string,
    driveFileId?: string,
    buildingSet?: GuidedLearningSet
  ) => {
    const data = await loadSet(setId, driveFileId, buildingSet);
    if (!data) return;
    const source: 'personal' | 'building' = buildingSet
      ? 'building'
      : 'personal';
    // View-only flows skip the picker entirely — open the simplified Share
    // modal instead.
    if (isViewOnly) {
      setViewOnlyShareTarget({ set: data, source, originSetId: setId });
      setViewOnlyShareLink(null);
      setViewOnlyShareError(null);
      return;
    }
    // If the teacher has no rosters at all, skip the dialog entirely and
    // preserve the classic join-link flow.
    if (rosters.length === 0) {
      await performAssign(data, source, setId, []);
      return;
    }
    // Otherwise open the dialog so they can optionally pick rosters.
    setAssignTarget({ set: data, source, originSetId: setId });
  };

  const handleConfirmViewOnlyShare = async (): Promise<void> => {
    if (!viewOnlyShareTarget) return;
    setIsCreatingViewOnlyShare(true);
    setViewOnlyShareError(null);
    try {
      const { set, source, originSetId } = viewOnlyShareTarget;
      const url = await performAssign(
        set,
        source,
        originSetId,
        [],
        EMPTY_ASSIGN_TARGETING_VALUE,
        { silent: true }
      );
      if (url) setViewOnlyShareLink(url);
    } catch (err) {
      setViewOnlyShareError(
        err instanceof Error ? err.message : 'Failed to create share link.'
      );
    } finally {
      setIsCreatingViewOnlyShare(false);
    }
  };

  const closeViewOnlyShareModal = () => {
    setViewOnlyShareTarget(null);
    setViewOnlyShareLink(null);
    setViewOnlyShareError(null);
  };

  const handleAssignConfirm = async (): Promise<void> => {
    if (!assignTarget) return;
    // Guard against stale rosterIds — rosters can be deleted or fail to
    // load (`loadError`) after the teacher's last assignment.
    const visibleRosterIds = new Set(
      rosters.filter((r) => !r.loadError).map((r) => r.id)
    );
    const validRosterIds = pickerValue.rosterIds.filter((id) =>
      visibleRosterIds.has(id)
    );
    const { set, source, originSetId } = assignTarget;
    setAssignTarget(null);
    await performAssign(
      set,
      source,
      originSetId,
      validRosterIds,
      targetingValue
    );
  };

  const handleViewResultsForRecent = async (sessionId: string) => {
    // Ensure the corresponding set is loaded so the results view has an activeSet
    const matchingEntry = Object.entries(recentSessionIds).find(
      ([, storedSessionId]) => storedSessionId === sessionId
    );
    if (matchingEntry) {
      const [setId] = matchingEntry;
      const meta = sets.find((s) => s.id === setId);
      const buildingSet = buildingSets.find((s) => s.id === setId);
      const loaded = await loadSet(setId, meta?.driveFileId, buildingSet);
      if (loaded) setActiveSet(loaded);
    }
    updateWidget(widget.id, {
      config: {
        ...config,
        view: 'results',
        resultsSessionId: sessionId,
      } as GuidedLearningConfig,
    });
  };

  const handleViewAssignmentResults = async (
    assignment: GuidedLearningAssignment
  ) => {
    const meta = sets.find((s) => s.id === assignment.setId);
    const buildingSet = buildingSets.find((s) => s.id === assignment.setId);
    const loaded = await loadSet(
      assignment.setId,
      meta?.driveFileId,
      buildingSet
    );
    if (loaded) setActiveSet(loaded);
    updateWidget(widget.id, {
      config: {
        ...config,
        view: 'results',
        resultsSessionId: assignment.sessionId,
      } as GuidedLearningConfig,
    });
  };

  const handleAssignmentCopyLink = async (
    assignment: GuidedLearningAssignment
  ) => {
    // Path form matches useGuidedLearningSession.createSession() and the
    // student-app route (App.tsx mounts on /guided-learning/:sessionId).
    const url = `${window.location.origin}/guided-learning/${assignment.sessionId}`;
    try {
      await navigator.clipboard.writeText(url);
      addToast('Student link copied!', 'success');
    } catch {
      addToast('Could not copy link. Try again.', 'error');
    }
  };

  const handleAssignmentArchive = async (
    assignment: GuidedLearningAssignment
  ) => {
    // Branch the toast on the assignment's frozen mode — view-only shares
    // aren't "archived" in the assignment-with-results sense; ending the
    // share is the user-facing action.
    const isViewOnlyAssignment = assignment.assignmentMode === 'view-only';
    const ok = await showConfirm(
      isViewOnlyAssignment
        ? `End "${assignment.setTitle}"? The link will stop working.`
        : `Archive "${assignment.setTitle}"? Students will no longer be able to submit.`,
      {
        title: isViewOnlyAssignment ? 'End share' : 'Archive Assignment',
        variant: 'danger',
        confirmLabel: isViewOnlyAssignment ? 'End' : 'Archive',
      }
    );
    if (!ok) return;
    try {
      await archiveAssignment(assignment.id);
      addToast(
        isViewOnlyAssignment ? 'Share ended.' : 'Assignment archived.',
        'success'
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : isViewOnlyAssignment
            ? 'Failed to end share'
            : 'Failed to archive';
      addToast(msg, 'error');
    }
  };

  const handleAssignmentUnarchive = async (
    assignment: GuidedLearningAssignment
  ) => {
    const isViewOnlyAssignment = assignment.assignmentMode === 'view-only';
    try {
      await unarchiveAssignment(assignment.id);
      addToast(
        isViewOnlyAssignment
          ? 'Share reactivated.'
          : 'Moved back to In Progress.',
        'success'
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : isViewOnlyAssignment
            ? 'Failed to reactivate share'
            : 'Failed to move';
      addToast(msg, 'error');
    }
  };

  const handleAssignmentDelete = async (
    assignment: GuidedLearningAssignment
  ) => {
    try {
      await deleteAssignment(assignment.id);
      addToast('Assignment deleted.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete';
      addToast(msg, 'error');
    }
  };

  // Persist a new ordering of personal sets. We write `order` onto each
  // metadata doc in a single batch — the Drive blob is untouched.
  const handleReorderPersonal = useCallback(
    async (orderedIds: string[]) => {
      if (!user?.uid) return;
      const batch = writeBatch(db);
      orderedIds.forEach((id, index) => {
        batch.update(doc(db, 'users', user.uid, GL_PERSONAL_COLLECTION, id), {
          order: index,
          updatedAt: Date.now(),
        });
      });
      try {
        await batch.commit();
      } catch (err) {
        console.error('[GuidedLearning] Failed to persist reorder:', err);
        throw err;
      }
    },
    [user?.uid]
  );

  // ─── .gl.json export / import ────────────────────────────────────────────
  const { uploadGuidedLearningMedia, deleteFile } = useStorage();
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [exportingSetId, setExportingSetId] = useState<string | null>(null);
  const [importFocusCounter, setImportFocusCounter] = useState(0);
  // Caches the rehosted set so a retry reuses uploads; `complete` gates reuse so a mid-way failure isn't treated as done.
  const importRehostCacheRef = useRef<{
    source: GuidedLearningSet;
    rehosted: GuidedLearningSet;
    complete: boolean;
  } | null>(null);
  // Guards against onClose deleting uploads while a save is still in flight.
  const importSaveInFlightRef = useRef(false);
  const importWizardClosedRef = useRef(false);

  // Best-effort deletion of uploads whose save never succeeded.
  const cleanupImportRehostCache = () => {
    const cached = importRehostCacheRef.current;
    importRehostCacheRef.current = null;
    for (const path of cached?.rehosted.imagePaths ?? []) {
      if (path) void deleteFile(path).catch(() => undefined);
    }
  };

  const handleExport = async (
    setId: string,
    driveFileId?: string,
    buildingSet?: GuidedLearningSet
  ) => {
    if (exportingSetId) return;
    setExportingSetId(setId);
    try {
      const data = await loadSet(setId, driveFileId, buildingSet);
      if (!data) return;
      const { set: embedded, warnings } = await embedSetImages(
        data,
        async (url) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
          return res.blob();
        }
      );
      const blob = new Blob([JSON.stringify(embedded, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildGlExportFilename(embedded.title, embedded.id);
      a.click();
      URL.revokeObjectURL(url);
      addToast(
        warnings.length > 0
          ? `Exported with ${warnings.length} warning${warnings.length === 1 ? '' : 's'} — some media stays linked online.`
          : 'Activity exported.',
        warnings.length > 0 ? 'info' : 'success'
      );
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Export failed', 'error');
    } finally {
      setExportingSetId(null);
    }
  };

  // Recreated per render on purpose — the wizard holds its own parsed state,
  // and useStorage's function identities change every render anyway.
  const importAdapter = createGuidedLearningImportAdapter({
    save: async (set, title) => {
      if (!user?.uid) throw new Error('Not authenticated');
      if (!isDriveConnected) {
        throw new Error('Connect Google Drive to import activities.');
      }
      const uid = user.uid;
      const cached = importRehostCacheRef.current;
      let rehosted: GuidedLearningSet;
      if (cached && cached.source === set && cached.complete) {
        rehosted = cached.rehosted;
      } else {
        // Any superseded cache (incomplete, or complete for a different source) is abandoned; clean up its orphans first.
        if (cached) {
          for (const path of cached.rehosted.imagePaths ?? []) {
            if (path) void deleteFile(path).catch(() => undefined);
          }
        }
        // Mutated in place as each upload resolves, so a mid-way throw still leaves the cache pointing at every path actually written to Storage.
        const partial: GuidedLearningSet = { ...set, imagePaths: [] };
        importRehostCacheRef.current = {
          source: set,
          rehosted: partial,
          complete: false,
        };
        const result = await rehostImportedSetImages(
          set,
          (blob, fileName) => uploadGuidedLearningMedia(uid, blob, fileName),
          (storagePath) => {
            partial.imagePaths = [...(partial.imagePaths ?? []), storagePath];
          }
        );
        rehosted = result.set;
        importRehostCacheRef.current = {
          source: set,
          rehosted,
          complete: true,
        };
      }
      const prepared = prepareImportedSet(
        { ...rehosted, title: title.trim() || rehosted.title },
        uid
      );
      importSaveInFlightRef.current = true;
      try {
        await saveSet(prepared);
        importRehostCacheRef.current = null;
      } catch (err) {
        // Wizard already closed: its onClose skipped cleanup, so run it now.
        if (importWizardClosedRef.current) cleanupImportRehostCache();
        throw err;
      } finally {
        importSaveInFlightRef.current = false;
      }
    },
    renderPreview: (set) => {
      const thumb = pickThumbnailUrl(set);
      return (
        <div className="flex items-center gap-3">
          <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
            {thumb ? (
              <img
                src={thumb}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xs text-slate-400">No image</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-800">
              {set.title || 'Untitled activity'}
            </p>
            <p className="text-xs text-slate-500">
              {set.imageUrls.length} slide
              {set.imageUrls.length === 1 ? '' : 's'} · {set.steps.length} step
              {set.steps.length === 1 ? '' : 's'} · {set.mode}
            </p>
          </div>
        </div>
      );
    },
  });

  const emptySet = (): GuidedLearningSet => ({
    id: crypto.randomUUID(),
    title: '',
    imageUrls: [],
    steps: [],
    mode: 'structured',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    authorUid: user?.uid,
  });

  const handleCreateNew = () => {
    setEditingSet(emptySet());
    setEditingMeta(null);
  };

  const handleCreateNewBuilding = () => {
    setEditingSet({ ...emptySet(), isBuilding: true });
    setEditingMeta(null);
  };

  if (loadingSet) {
    return (
      <WidgetLayout
        content={
          <div className="h-full flex items-center justify-center">
            <Loader2
              className="text-indigo-400 animate-spin"
              style={{
                width: 'min(32px, 8cqmin)',
                height: 'min(32px, 8cqmin)',
              }}
            />
          </div>
        }
      />
    );
  }

  return (
    <>
      <WidgetLayout
        padding="p-0"
        contentClassName="flex-1 min-h-0"
        content={
          <div className="relative h-full w-full">
            {config.view === 'library' && (
              <Suspense fallback={<LazySpinner />}>
                <GuidedLearningManager
                  onPrefetchSet={prefetchSet}
                  loadSetForPreview={loadSetForPreview}
                  userId={user?.uid}
                  sets={sets}
                  buildingSets={buildingSets}
                  assignments={assignments}
                  loading={loading}
                  buildingLoading={buildingLoading}
                  assignmentsLoading={assignmentsLoading}
                  isDriveConnected={isDriveConnected}
                  isAdmin={isAdmin ?? false}
                  onPlay={(setId, driveFileId, buildingSet) => {
                    void handlePlay(setId, driveFileId, buildingSet);
                  }}
                  onEdit={(setId, driveFileId, buildingSet) => {
                    void handleEdit(setId, driveFileId, buildingSet);
                  }}
                  onAssign={(setId, driveFileId, buildingSet) => {
                    void handleAssign(setId, driveFileId, buildingSet);
                  }}
                  onDeletePersonal={(setId, driveFileId) => {
                    void handleDelete(setId, driveFileId);
                  }}
                  onDuplicatePersonal={(setId, _driveFileId) => {
                    // `_driveFileId` is part of the manager's signature
                    // (mirrors onDeletePersonal) but we don't need it —
                    // `duplicateSet` reads driveFileId off the resolved
                    // source metadata.
                    const source = sets.find((s) => s.id === setId);
                    if (!source) return;
                    void personalDuplicateBusy.run(setId, async () => {
                      try {
                        const copy = await duplicateSet(source);
                        addToast(`Duplicated as "${copy.title}".`, 'success');
                      } catch (err) {
                        addToast(
                          err instanceof Error
                            ? err.message
                            : 'Duplicate failed',
                          'error'
                        );
                      }
                    });
                  }}
                  isDuplicatingPersonal={personalDuplicateBusy.isBusy}
                  onDuplicateBuilding={(setId) => {
                    const source = buildingSets.find((s) => s.id === setId);
                    if (!source) return;
                    void buildingDuplicateBusy.run(setId, async () => {
                      try {
                        const copy = await duplicateBuildingSet(source);
                        addToast(
                          `Duplicated building set as "${copy.title}".`,
                          'success'
                        );
                      } catch (err) {
                        addToast(
                          err instanceof Error
                            ? err.message
                            : 'Duplicate failed',
                          'error'
                        );
                      }
                    });
                  }}
                  isDuplicatingBuilding={buildingDuplicateBusy.isBusy}
                  onDeleteBuilding={(setId) => {
                    void handleDeleteBuilding(setId);
                  }}
                  onCreateNewPersonal={handleCreateNew}
                  onCreateNewBuilding={handleCreateNewBuilding}
                  onOpenAIAuthoring={() => setShowAIGen(true)}
                  onReorderPersonal={handleReorderPersonal}
                  recentSessionIds={recentSessionIds}
                  onViewResults={(sessionId) => {
                    void handleViewResultsForRecent(sessionId);
                  }}
                  onAssignmentCopyLink={(a) => {
                    void handleAssignmentCopyLink(a);
                  }}
                  onAssignmentOpenResults={(a) => {
                    void handleViewAssignmentResults(a);
                  }}
                  onAssignmentArchive={(a) => {
                    void handleAssignmentArchive(a);
                  }}
                  onAssignmentUnarchive={(a) => {
                    void handleAssignmentUnarchive(a);
                  }}
                  onAssignmentDelete={(a) => {
                    void handleAssignmentDelete(a);
                  }}
                  onAssignmentPublishScores={(a) => {
                    setPublishingAssignment(a);
                  }}
                  onAssignmentUnpublishScores={async (a) => {
                    // One-click unpublish — `unpublishAssignmentScores`
                    // is a cheap two-write batch (no set lookup, no
                    // grading).
                    try {
                      await unpublishAssignmentScores(a.id);
                      addToast('Scores unpublished.', 'success');
                    } catch (err) {
                      addToast(
                        err instanceof Error
                          ? err.message
                          : 'Failed to unpublish scores',
                        'error'
                      );
                    }
                  }}
                  onExport={(setId, driveFileId, buildingSet) => {
                    void handleExport(setId, driveFileId, buildingSet);
                  }}
                  onImport={() => {
                    importWizardClosedRef.current = false;
                    setShowImportWizard(true);
                  }}
                  importFocusCounter={importFocusCounter}
                  assignmentMode={assignmentMode}
                />
              </Suspense>
            )}

            {config.view === 'player' && activeSet && (
              <Suspense fallback={<LazySpinner />}>
                <GuidedLearningPlayer
                  set={activeSet}
                  onClose={() => setView('library')}
                  teacherMode
                />
              </Suspense>
            )}

            {config.view === 'results' &&
              config.resultsSessionId &&
              activeSet &&
              (() => {
                const resultsAssignment = assignments.find(
                  (a) => a.sessionId === config.resultsSessionId
                );
                const closeResults = () =>
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      view: 'library',
                      resultsSessionId: null,
                    } as GuidedLearningConfig,
                  });
                if (resultsAssignment?.assignmentMode === 'view-only') {
                  return (
                    <div
                      className="flex flex-col items-center justify-center h-full text-center"
                      style={{
                        gap: 'min(12px, 3cqmin)',
                        padding: 'min(32px, 7cqmin)',
                      }}
                    >
                      <p
                        className="font-bold text-slate-700"
                        style={{ fontSize: 'min(14px, 5cqmin)' }}
                      >
                        View-only share — no responses collected
                      </p>
                      <p
                        className="text-slate-500 max-w-md"
                        style={{ fontSize: 'min(12px, 4cqmin)' }}
                      >
                        Students opened this share as a view-only link, so there
                        are no submissions to display. URL open counts appear in
                        the Shared archive.
                      </p>
                      <button
                        type="button"
                        onClick={closeResults}
                        className="inline-flex items-center rounded-lg bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold shadow-sm transition-colors"
                        style={{
                          marginTop: 'min(8px, 2cqmin)',
                          gap: 'min(6px, 1.5cqmin)',
                          paddingInline: 'min(12px, 3cqmin)',
                          paddingBlock: 'min(8px, 2cqmin)',
                          fontSize: 'min(12px, 4cqmin)',
                        }}
                      >
                        Back to library
                      </button>
                    </div>
                  );
                }
                return (
                  <Suspense fallback={<LazySpinner />}>
                    <GuidedLearningResults
                      set={activeSet}
                      sessionId={config.resultsSessionId}
                      onClose={closeResults}
                    />
                  </Suspense>
                );
              })()}

            {showAIGen && (
              <Suspense fallback={<LazyOverlaySpinner />}>
                <GuidedLearningAIGenerator
                  onClose={() => setShowAIGen(false)}
                  onGenerated={(set) => {
                    setEditingSet({ ...set, isBuilding: true });
                    setEditingMeta(null);
                    setShowAIGen(false);
                  }}
                />
              </Suspense>
            )}
          </div>
        }
      />
      {editingSet && (
        <Suspense fallback={<ModalChunkFallback />}>
          <GuidedLearningEditorModal
            isOpen
            set={editingSet}
            meta={editingMeta}
            folders={editingMeta ? glFolders : undefined}
            folderId={editingMeta?.folderId ?? null}
            onFolderChange={
              editingMeta
                ? async (folderId) => {
                    try {
                      await moveGlItem(editingMeta.id, folderId);
                      addToast('Folder updated.', 'success');
                    } catch (err) {
                      addToast(
                        err instanceof Error
                          ? err.message
                          : 'Failed to update folder',
                        'error'
                      );
                    }
                  }
                : undefined
            }
            onClose={() => {
              setEditingSet(null);
              setEditingMeta(null);
            }}
            onSave={handleSave}
            onAiGenerated={(generated) => {
              setEditingSet({ ...generated, isBuilding: true });
              setEditingMeta(null);
            }}
          />
        </Suspense>
      )}

      {assignTarget && (
        <AssignModal<AssignClassPickerValue>
          isOpen={!!assignTarget}
          onClose={() => setAssignTarget(null)}
          itemTitle={assignTarget.set.title || 'Untitled set'}
          options={pickerValue}
          onOptionsChange={setPickerValue}
          extraSlot={
            <div className="space-y-3">
              <AssignClassPicker
                rosters={rosters}
                value={pickerValue}
                onChange={setPickerValue}
              />
              <AssignTargetingSection
                rosters={rosters}
                value={targetingValue}
                onChange={setTargetingValue}
                kind="guided-learning"
                showDueAt
              />
            </div>
          }
          onAssign={() => handleAssignConfirm()}
          confirmLabel="Assign"
        />
      )}

      <ImportWizard<GuidedLearningSet>
        isOpen={showImportWizard}
        onClose={() => {
          setShowImportWizard(false);
          importWizardClosedRef.current = true;
          // Defer cleanup to the save's settle handler while a save is in flight.
          if (!importSaveInFlightRef.current) cleanupImportRehostCache();
        }}
        adapter={importAdapter}
        onSaved={(title) => {
          addToast(`"${title}" imported to your personal library.`, 'success');
          setImportFocusCounter((c) => c + 1);
        }}
      />

      {viewOnlyShareTarget && (
        <ViewOnlyShareModal
          itemTitle={viewOnlyShareTarget.set.title || 'Untitled set'}
          isCreating={isCreatingViewOnlyShare}
          createdLink={viewOnlyShareLink}
          error={viewOnlyShareError}
          onConfirm={() => void handleConfirmViewOnlyShare()}
          onClose={closeViewOnlyShareModal}
        />
      )}

      {publishingAssignment && (
        <PublishScoresModal
          assignmentTitle={publishingAssignment.setTitle}
          currentVisibility={publishingAssignment.scoreVisibility}
          onClose={() => setPublishingAssignment(null)}
          onConfirm={async (visibility) => {
            const target = publishingAssignment;
            try {
              if (visibility === 'none') {
                // Mirror Quiz/VA: route through the dedicated unpublish
                // method (no set lookup needed for a flag-flip).
                await unpublishAssignmentScores(target.id);
                addToast('Scores unpublished.', 'success');
                setPublishingAssignment(null);
                return;
              }
              // Resolve the canonical set so the grader sees the full
              // `correctAnswer` / `matchingPairs` / `sortingItems` —
              // `session.publicSteps` strips them for student safety.
              const personalMeta = sets.find((s) => s.id === target.setId);
              const buildingSet = buildingSets.find(
                (s) => s.id === target.setId
              );
              const data = await loadSet(
                target.setId,
                personalMeta?.driveFileId,
                buildingSet
              );
              if (!data) {
                addToast(
                  'Set is no longer in your library — cannot publish scores.',
                  'error'
                );
                return;
              }
              const result = await publishAssignmentScores(
                target.id,
                data,
                visibility
              );
              addToast(
                result.responsesUpdated > 0
                  ? `Scores published to ${result.responsesUpdated} student${result.responsesUpdated === 1 ? '' : 's'}.`
                  : 'Scores published. Students will see results once they submit.',
                'success'
              );
              setPublishingAssignment(null);
            } catch (err) {
              addToast(
                err instanceof Error ? err.message : 'Failed to publish scores',
                'error'
              );
            }
          }}
        />
      )}
    </>
  );
};
