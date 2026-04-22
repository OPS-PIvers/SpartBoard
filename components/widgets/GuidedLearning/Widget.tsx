import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import {
  WidgetData,
  ClassLinkClass,
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
import { classLinkService } from '@/utils/classlinkService';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { AssignModal } from '@/components/common/library';
import { GuidedLearningManager } from './components/GuidedLearningManager';
import { GuidedLearningEditorModal } from './components/GuidedLearningEditorModal';
import { GuidedLearningPlayer } from './components/GuidedLearningPlayer';
import { GuidedLearningResults } from './components/GuidedLearningResults';
import { Loader2, Users } from 'lucide-react';

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
  const { updateWidget, addToast } = useDashboard();
  const { user, isAdmin } = useAuth();
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

  // ─── ClassLink target-class fetch (Phase 3C) ────────────────────────────────
  // Teacher's ClassLink classes (if provisioned). Fetched once per Widget
  // mount via the shared `classLinkService` (5-min cache). If the teacher
  // isn't on a ClassLink-provisioned org, the list stays empty and the
  // Assign dialog is skipped entirely. Errors are swallowed: ClassLink
  // being unreachable must not block classic join-link launches.
  const [classLinkClasses, setClassLinkClasses] = useState<ClassLinkClass[]>(
    []
  );
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await classLinkService.getRosters();
        if (cancelled) return;
        setClassLinkClasses(data.classes);
      } catch (err) {
        // Silent: no-ClassLink orgs and transient failures both fall back
        // to classic join-link-only launches, so the selector stays hidden.
        if (import.meta.env.DEV) {
          console.warn('[GuidedLearning] ClassLink fetch failed:', err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Assign dialog state (Phase 3C) ─────────────────────────────────────────
  // When a teacher clicks "Assign" and a ClassLink-provisioned org is in
  // play, we pause to let them optionally pick a target class before
  // actually creating the session. `assignTarget` holds the already-loaded
  // set along with the source hint so we can create the assignment doc
  // after confirmation.
  const [assignTarget, setAssignTarget] = useState<AssignDialogTarget | null>(
    null
  );
  const [assignOptions, setAssignOptions] = useState<{ classId: string }>({
    classId: '',
  });

  // Reset the pending classId when the dialog re-opens for a different set
  // (adjust-state-while-rendering pattern — no effect needed).
  const [prevAssignTarget, setPrevAssignTarget] =
    useState<AssignDialogTarget | null>(null);
  if (assignTarget !== prevAssignTarget) {
    setPrevAssignTarget(assignTarget);
    if (assignTarget) {
      setAssignOptions({
        classId: config.lastClassIdBySetId?.[assignTarget.originSetId] ?? '',
      });
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
  // the classic direct-assign path (no ClassLink org) and the target-class
  // dialog confirm path. `classId` is the ClassLink class sourcedId, or
  // `null` for "No class".
  const performAssign = useCallback(
    async (
      data: GuidedLearningSet,
      source: 'personal' | 'building',
      originSetId: string,
      classId: string | null
    ) => {
      try {
        const url = await createSession(data, classId ?? undefined);
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
            });
          } catch (err) {
            console.warn('[GuidedLearning] Failed to record assignment:', err);
          }
        }
        // Persist the teacher's last-used classId per set so re-launching
        // the same set pre-selects the same class. Clearing (picking "No
        // class") removes the entry rather than writing an empty string to
        // keep the config map small.
        const prevMap = config.lastClassIdBySetId ?? {};
        const nextMap: Record<string, string> = { ...prevMap };
        if (classId) {
          nextMap[originSetId] = classId;
        } else {
          delete nextMap[originSetId];
        }
        updateWidget(widget.id, {
          config: {
            ...config,
            lastClassIdBySetId: nextMap,
          } as GuidedLearningConfig,
        });
        await navigator.clipboard.writeText(url);
        addToast('Assignment link copied to clipboard!', 'success');
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to create session';
        addToast(msg, 'error');
      }
    },
    [createSession, createAssignment, addToast, config, updateWidget, widget.id]
  );

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
    // If the teacher isn't on a ClassLink-provisioned org (or the fetch
    // failed), skip the dialog entirely and preserve the classic
    // join-link flow.
    if (classLinkClasses.length === 0) {
      await performAssign(data, source, setId, null);
      return;
    }
    // Otherwise open the dialog so they can optionally pick a target class.
    setAssignTarget({ set: data, source, originSetId: setId });
  };

  const handleAssignConfirm = async (): Promise<void> => {
    if (!assignTarget) return;
    // Guard: if the teacher somehow picked a classId that's no longer in the
    // fetched ClassLink list (e.g. rosters changed between fetch and confirm),
    // fall through to no-class rather than writing a stale id.
    const selectedClassId =
      assignOptions.classId &&
      classLinkClasses.some((c) => c.sourcedId === assignOptions.classId)
        ? assignOptions.classId
        : null;
    const { set, source, originSetId } = assignTarget;
    setAssignTarget(null);
    await performAssign(set, source, originSetId, selectedClassId);
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
              activeSet && (
                <GuidedLearningResults
                  set={activeSet}
                  sessionId={config.resultsSessionId}
                  onClose={() =>
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        view: 'library',
                        resultsSessionId: null,
                      } as GuidedLearningConfig,
                    })
                  }
                />
              )}

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
        <AssignModal<{ classId: string }>
          isOpen={!!assignTarget}
          onClose={() => setAssignTarget(null)}
          itemTitle={assignTarget.set.title || 'Untitled set'}
          options={assignOptions}
          onOptionsChange={setAssignOptions}
          extraSlot={
            <GuidedLearningAssignTargetClassRow
              classes={classLinkClasses}
              value={assignOptions.classId}
              onChange={(v) => setAssignOptions({ classId: v })}
            />
          }
          onAssign={() => handleAssignConfirm()}
          confirmLabel="Assign"
        />
      )}
    </>
  );
};

/**
 * Build a human-readable label for a ClassLink class. Mirrors the format
 * used by `ClassLinkImportDialog` and `QuizManager` so teachers see the
 * same class names across flows.
 */
function formatClassLinkClassLabel(cls: ClassLinkClass): string {
  const subjectPrefix = cls.subject ? `${cls.subject} - ` : '';
  const codeSuffix = cls.classCode ? ` (${cls.classCode})` : '';
  return `${subjectPrefix}${cls.title}${codeSuffix}`;
}

/**
 * Target-class selector rendered inside the Guided Learning Assign modal's
 * `extraSlot`. Lets the teacher pick an optional ClassLink class to target
 * this set at so that students who signed in via ClassLink see it on their
 * `/my-assignments` page. Phase 3C — fan-out of the Quiz pilot.
 */
const GuidedLearningAssignTargetClassRow: React.FC<{
  classes: ClassLinkClass[];
  value: string;
  onChange: (next: string) => void;
}> = ({ classes, value, onChange }) => {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-4 h-4 text-brand-blue-primary" />
        <label
          htmlFor="gl-assign-target-class"
          className="text-sm font-bold text-brand-blue-dark"
        >
          Target class (optional)
        </label>
      </div>
      <select
        id="gl-assign-target-class"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
      >
        <option value="">No class (use join code)</option>
        {classes.map((cls) => (
          <option key={cls.sourcedId} value={cls.sourcedId}>
            {formatClassLinkClassLabel(cls)}
          </option>
        ))}
      </select>
      <p className="text-xxs text-slate-500 mt-1">
        Students in this class will see this activity in their assignments list.
        Leave blank to use a join code.
      </p>
    </div>
  );
};
