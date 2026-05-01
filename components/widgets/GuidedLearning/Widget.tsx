import React, { useState, useCallback, useMemo } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import {
  AssignmentMode,
  WidgetData,
  GuidedLearningConfig,
  GuidedLearningSet,
  GuidedLearningSetMetadata,
  GuidedLearningAssignment,
} from '@/types';
import { db } from '@/config/firebase';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useGuidedLearning } from '@/hooks/useGuidedLearning';
import { useGuidedLearningSessionTeacher } from '@/hooks/useGuidedLearningSession';
import { useGuidedLearningAssignments } from '@/hooks/useGuidedLearningAssignments';
import { useFolders } from '@/hooks/useFolders';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { AssignModal, ViewOnlyShareModal } from '@/components/common/library';
import { AssignClassPicker } from '@/components/common/AssignClassPicker';
import {
  makeEmptyPickerValue,
  type AssignClassPickerValue,
} from '@/components/common/AssignClassPicker.helpers';
import {
  deriveSessionTargetsFromRosters,
  mapLegacyClassIdsToRosterIds,
} from '@/utils/resolveAssignmentTargets';
import { GuidedLearningManager } from './components/GuidedLearningManager';
import { GuidedLearningEditorModal } from './components/GuidedLearningEditorModal';
import { GuidedLearningPlayer } from './components/GuidedLearningPlayer';
import { GuidedLearningResults } from './components/GuidedLearningResults';
import { Loader2 } from 'lucide-react';

// ─── AI generation modal (admin only) ────────────────────────────────────────
import { GuidedLearningAIGenerator } from './components/GuidedLearningAIGenerator';
import { normalizeGuidedLearningSet } from './utils/setMigration';

const GL_PERSONAL_COLLECTION = 'guided_learning';

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
    saveBuildingSet,
    deleteBuildingSet,
  } = useGuidedLearning(user?.uid);

  const { createSession } = useGuidedLearningSessionTeacher(user?.uid);

  const {
    assignments,
    loading: assignmentsLoading,
    createAssignment,
    archiveAssignment,
    unarchiveAssignment,
    deleteAssignment,
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
  const [pickerValue, setPickerValue] = useState<AssignClassPickerValue>(() =>
    makeEmptyPickerValue()
  );

  // Reset the picker when the dialog re-opens for a different set
  // (adjust-state-while-rendering pattern — no effect needed).
  const [prevAssignTarget, setPrevAssignTarget] =
    useState<AssignDialogTarget | null>(null);
  if (assignTarget !== prevAssignTarget) {
    setPrevAssignTarget(assignTarget);
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
        const data = await loadSetData(driveFileId);
        return normalizeGuidedLearningSet(data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load set';
        addToast(msg, 'error');
        return null;
      } finally {
        setLoadingSet(false);
      }
    },
    [loadSetData, addToast]
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
    if (set.isBuilding) {
      await saveBuildingSet(set);
      addToast('Building set saved.', 'success');
    } else {
      await saveSet(set, driveFileId);
      addToast('Set saved to Drive.', 'success');
    }
  };

  const handleDelete = async (setId: string, driveFileId: string) => {
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
          assignmentMode
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
            });
          } catch (err) {
            console.warn('[GuidedLearning] Failed to record assignment:', err);
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
      const url = await performAssign(set, source, originSetId, [], {
        silent: true,
      });
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
    await performAssign(set, source, originSetId, validRosterIds);
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
    try {
      await archiveAssignment(assignment.id);
      addToast('Assignment archived.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to archive';
      addToast(msg, 'error');
    }
  };

  const handleAssignmentUnarchive = async (
    assignment: GuidedLearningAssignment
  ) => {
    try {
      await unarchiveAssignment(assignment.id);
      addToast('Moved back to In Progress.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to move';
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
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
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
          <div className="h-full w-full">
            {config.view === 'library' && (
              <GuidedLearningManager
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
                initialLibraryViewMode={config.libraryViewMode}
                onLibraryViewModeChange={(mode) => {
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      libraryViewMode: mode,
                    } as GuidedLearningConfig,
                  });
                }}
                assignmentMode={assignmentMode}
              />
            )}

            {config.view === 'player' && activeSet && (
              <GuidedLearningPlayer
                set={activeSet}
                onClose={() => setView('library')}
                teacherMode
              />
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
                  <GuidedLearningResults
                    set={activeSet}
                    sessionId={config.resultsSessionId}
                    onClose={closeResults}
                  />
                );
              })()}

            {showAIGen && (
              <GuidedLearningAIGenerator
                onClose={() => setShowAIGen(false)}
                onGenerated={(set) => {
                  setEditingSet({ ...set, isBuilding: true });
                  setEditingMeta(null);
                  setShowAIGen(false);
                }}
              />
            )}
          </div>
        }
      />
      <GuidedLearningEditorModal
        isOpen={!!editingSet}
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

      {assignTarget && (
        <AssignModal<AssignClassPickerValue>
          isOpen={!!assignTarget}
          onClose={() => setAssignTarget(null)}
          itemTitle={assignTarget.set.title || 'Untitled set'}
          options={pickerValue}
          onOptionsChange={setPickerValue}
          extraSlot={
            <AssignClassPicker
              rosters={rosters}
              value={pickerValue}
              onChange={setPickerValue}
            />
          }
          onAssign={() => handleAssignConfirm()}
          confirmLabel="Assign"
        />
      )}

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
    </>
  );
};
