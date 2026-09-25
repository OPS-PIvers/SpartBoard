import React, { useCallback, useMemo, useState } from 'react';
import { Layers, LogIn } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type {
  FlashcardAssignment,
  FlashcardCard,
  FlashcardSet,
  FlashcardsConfig,
  StudentOverride,
  SubShareFlashcardSetView,
  StudentTargetRef,
  WidgetData,
} from '@/types';
import { db, functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useAssignPeriodAccess } from '@/hooks/useTeacherBellPeriods';
import { useDialog } from '@/context/useDialog';
import {
  FlashcardStudySyncError,
  useFlashcardSets,
} from '@/hooks/useFlashcardSets';
import { useFlashcardAssignments } from '@/hooks/useFlashcardAssignments';
import { useSubShareFlashcards } from './useSubShareFlashcards';
import { SubLaunchPanel } from '@/components/subs/SubLaunchPanel';
import {
  buildSetAssignmentTargetsPayload,
  payloadRequiresCall,
} from '@/utils/studentTargetRef';
import { skippedTargetsToastMessage } from '@/utils/assignTargetingSkippedToast';
import { FlashcardAssignModal } from './FlashcardAssignModal';
import {
  rosterHasSsoClass,
  type FlashcardAssignSubmission,
} from './utils/flashcardAssign';
import { useFolders } from '@/hooks/useFolders';
import { useGooglePicker } from '@/hooks/useGooglePicker';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { ImportWizard } from '@/components/common/library/importer';
import { FlashcardEditor } from './FlashcardEditor';
import { FlashcardLibrary } from './FlashcardLibrary';
import { FlashcardResultsView } from './results';
import {
  FlashcardPublishScoresModal,
  type PublishableFlashcardVisibility,
} from './results/FlashcardPublishScoresModal';
import { createFlashcardImportAdapter } from './adapters/flashcardImportAdapter';
import {
  FlashcardPlayer,
  FlashcardShareModal,
  MemoryFlashcardAdapter,
} from '@/components/flashcards';

const SHEETS_API_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

const makeSet = (cards: FlashcardCard[] = []): FlashcardSet => {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: '',
    description: '',
    termLanguage: 'en-US',
    definitionLanguage: 'en-US',
    cards,
    folderId: null,
    createdAt: now,
    updatedAt: now,
  };
};

// Mirrors functions/src/studentAssignmentTargets.ts input/result shapes.
interface SetAssignmentTargetsCallableInput {
  assignmentId: string;
  kind: 'flashcards';
  sessionId: string;
  add: StudentTargetRef[];
  remove: StudentTargetRef[];
  overridesBySourcedId: Record<string, StudentOverride | null>;
  excludedTargets?: StudentTargetRef[];
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
  skippedExclusions?: { ref: StudentTargetRef; reason: string }[];
}

const extractSheetId = (url: string): string | null => {
  const match = url.match(/\/spreadsheets(?:\/u\/\d+)?\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
};

export const FlashcardsWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as FlashcardsConfig;
  const { user, ensureGoogleScope } = useAuth();
  const { addToast, updateWidget, rosters, updateRoster } = useDashboard();
  const assignPeriodCtx = useAssignPeriodAccess(updateRoster);
  const { showConfirm } = useDialog();
  const { openPicker } = useGooglePicker();
  // A substitute can read neither the teacher's sets nor their assignments, so
  // in a share the presented set comes from the bundle and no listener opens.
  const shared = useSubShareFlashcards(config.presentSetId);
  const inShare = shared.active;
  const flashcardSets = useFlashcardSets(inShare ? undefined : user?.uid);
  const {
    assignments,
    loading: assignmentsLoading,
    createAssignment,
    endAssignment,
    reopenAssignment,
    deleteAssignment,
    publishScores,
    unpublishScores,
  } = useFlashcardAssignments(inShare ? undefined : user?.uid);
  const folders = useFolders(inShare ? undefined : user?.uid, 'flashcards');
  const [editingSet, setEditingSet] = useState<FlashcardSet | null>(null);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [sharingSet, setSharingSet] = useState<FlashcardSet | null>(null);
  const [assigningSet, setAssigningSet] = useState<FlashcardSet | null>(null);
  const [publishTarget, setPublishTarget] =
    useState<FlashcardAssignment | null>(null);
  const openResults = useMemo(
    () =>
      config.view === 'results' && config.activeAssignmentId
        ? (assignments.find((a) => a.id === config.activeAssignmentId) ?? null)
        : null,
    [assignments, config.activeAssignmentId, config.view]
  );
  const ownPresentSet = useMemo(
    () =>
      config.presentSetId
        ? (flashcardSets.sets.find((set) => set.id === config.presentSetId) ??
          null)
        : null,
    [config.presentSetId, flashcardSets.sets]
  );
  const presentSet: SubShareFlashcardSetView | null = inShare
    ? shared.set
    : ownPresentSet;
  // A share opens on the set the teacher was presenting, whatever view they
  // happened to leave the widget on: the library and the results are theirs.
  const view = inShare ? 'present' : (config.view ?? 'library');
  const presentAdapter = useMemo(() => new MemoryFlashcardAdapter(), []);

  const pickSheet = useCallback(async (): Promise<{ url: string } | null> => {
    const token = await ensureGoogleScope('drive.file', { interactive: true });
    if (!token) throw new Error('Google Drive access is required.');
    const picked = await openPicker({ mode: 'sheets', token });
    return picked
      ? { url: `https://docs.google.com/spreadsheets/d/${picked.id}/edit` }
      : null;
  }, [ensureGoogleScope, openPicker]);

  const loadSheet = useCallback(
    async (url: string): Promise<string[][]> => {
      const sheetId = extractSheetId(url);
      if (!sheetId) throw new Error('Choose a valid Google Sheet.');
      const token = await ensureGoogleScope('drive.file', {
        interactive: true,
      });
      if (!token) throw new Error('Google Drive access is required.');
      const response = await fetch(
        `${SHEETS_API_URL}/${sheetId}/values/${encodeURIComponent('A:B')}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(
            'The selected Sheet could not be read. Choose it again to grant access.'
          );
        }
        if (response.status === 404) throw new Error('Google Sheet not found.');
        throw new Error(`Google Sheet import failed (${response.status}).`);
      }
      const payload = (await response.json()) as {
        values?: Array<Array<string | number | boolean | null>>;
      };
      return (payload.values ?? []).map((row) =>
        row.map((value) => (value === null ? '' : String(value)))
      );
    },
    [ensureGoogleScope]
  );

  const saveImportedSet = useCallback(
    async (cards: FlashcardCard[], title: string): Promise<void> => {
      const imported = { ...makeSet(cards), title: title.trim() };
      await flashcardSets.saveSet(imported);
    },
    [flashcardSets]
  );

  const importAdapter = useMemo(
    () =>
      createFlashcardImportAdapter({
        loadSheet,
        pickSheet,
        save: saveImportedSet,
      }),
    [loadSheet, pickSheet, saveImportedSet]
  );

  const handleSave = async (set: FlashcardSet): Promise<void> => {
    setSaving(true);
    try {
      const rewritten = await flashcardSets.saveSet(set);
      setEditingSet(null);
      addToast(
        rewritten > 0
          ? `“${set.title}” saved. ${rewritten} open Study assignment${rewritten === 1 ? '' : 's'} updated.`
          : `“${set.title}” saved.`,
        'success'
      );
    } catch (error) {
      if (error instanceof FlashcardStudySyncError) {
        setEditingSet(null);
        addToast(
          `“${set.title}” saved, but open Study assignments still show the old cards.`,
          'error'
        );
        return;
      }
      addToast(
        error instanceof Error
          ? error.message
          : 'Flashcard set could not be saved.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (set: FlashcardSet): Promise<void> => {
    const confirmed = await showConfirm(
      `Delete “${set.title}”? This cannot be undone.`,
      {
        title: 'Delete flashcard set',
        variant: 'danger',
        confirmLabel: 'Delete',
      }
    );
    if (!confirmed) return;
    try {
      await flashcardSets.deleteSet(set.id);
      addToast(`“${set.title}” deleted.`, 'success');
    } catch (error) {
      addToast(
        error instanceof Error
          ? error.message
          : 'Flashcard set could not be deleted.',
        'error'
      );
    }
  };

  const handleAssign = (set: FlashcardSet): void => {
    if (set.cards.length === 0) {
      addToast('Add cards to this set before assigning it.', 'error');
      return;
    }
    if (!rosters.some(rosterHasSsoClass)) {
      addToast(
        'Assigned flashcards reach students who sign in with ClassLink. Import a ClassLink class in Classes first, or use Share link instead.',
        'error'
      );
      return;
    }
    setAssigningSet(set);
  };

  const performAssign = async ({
    input,
    rosterIds,
    expandedTargeting,
  }: FlashcardAssignSubmission): Promise<void> => {
    const { set } = input;
    try {
      const sessionId = await createAssignment(input);
      const payload = buildSetAssignmentTargetsPayload(
        undefined,
        expandedTargeting
      );
      if (payloadRequiresCall(payload)) {
        try {
          const callable = httpsCallable<
            SetAssignmentTargetsCallableInput,
            SetAssignmentTargetsCallableResult
          >(functions, 'setAssignmentTargetsV1');
          const res = await callable({
            assignmentId: sessionId,
            kind: 'flashcards',
            sessionId,
            ...payload,
          });
          const skippedCount = res.data.skipped?.length ?? 0;
          if (skippedCount > 0) {
            addToast(
              skippedTargetsToastMessage(
                skippedCount,
                res.data.skippedExclusions?.length ?? 0
              ),
              'error'
            );
            if (user?.uid) {
              await setDoc(
                doc(db, 'users', user.uid, 'flashcard_assignments', sessionId),
                { targetSkippedCount: skippedCount },
                { merge: true }
              );
            }
          }
        } catch (err) {
          console.warn(
            '[Flashcards] Failed to apply individual targeting:',
            err
          );
          addToast(
            'Could not apply individual targeting. Try editing the assignment again.',
            'error'
          );
        }
      }

      const nextRosterMap = { ...(config.lastRosterIdsBySetId ?? {}) };
      if (rosterIds.length > 0) nextRosterMap[set.id] = rosterIds;
      else delete nextRosterMap[set.id];
      updateWidget(widget.id, {
        config: { ...config, lastRosterIdsBySetId: nextRosterMap },
      });
      setAssigningSet(null);

      const url = `${window.location.origin}/flashcards/a/${sessionId}`;
      try {
        await navigator.clipboard.writeText(url);
        addToast(
          `“${set.title}” assigned. Link copied to clipboard.`,
          'success'
        );
      } catch {
        addToast(`“${set.title}” assigned.`, 'success');
      }
    } catch (error) {
      addToast(
        error instanceof Error
          ? error.message
          : 'Flashcard set could not be assigned.',
        'error'
      );
    }
  };

  const assignmentLink = (assignment: FlashcardAssignment): string =>
    `${window.location.origin}/flashcards/a/${assignment.sessionId}`;

  const copyAssignmentLink = async (
    assignment: FlashcardAssignment
  ): Promise<void> => {
    try {
      await navigator.clipboard.writeText(assignmentLink(assignment));
      addToast('Link copied to clipboard.', 'success');
    } catch {
      addToast(assignmentLink(assignment), 'info');
    }
  };

  const runAssignmentAction = async (
    action: () => Promise<void>,
    success: string,
    failure: string
  ): Promise<void> => {
    try {
      await action();
      addToast(success, 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : failure, 'error');
    }
  };

  const handleAssignmentEnd = async (
    assignment: FlashcardAssignment
  ): Promise<void> => {
    const confirmed = await showConfirm(
      `End “${assignment.setTitle}”? Students lose access and their work is kept.`,
      {
        title: 'End assignment',
        variant: 'warning',
        confirmLabel: 'End assignment',
      }
    );
    if (!confirmed) return;
    await runAssignmentAction(
      () => endAssignment(assignment.id),
      `“${assignment.setTitle}” ended.`,
      'Assignment could not be ended.'
    );
  };

  const handleAssignmentDelete = async (
    assignment: FlashcardAssignment
  ): Promise<void> => {
    const confirmed = await showConfirm(
      `Delete “${assignment.setTitle}”? Student progress for it is deleted too. The set itself is kept.`,
      {
        title: 'Delete assignment',
        variant: 'danger',
        confirmLabel: 'Delete',
      }
    );
    if (!confirmed) return;
    await runAssignmentAction(
      () => deleteAssignment(assignment.id),
      `“${assignment.setTitle}” deleted.`,
      'Assignment could not be deleted.'
    );
  };

  const showLibrary = (): void => {
    updateWidget(widget.id, {
      config: {
        ...config,
        view: 'library',
        presentSetId: undefined,
        activeAssignmentId: undefined,
      },
    });
  };

  const showResults = (assignment: FlashcardAssignment): void => {
    updateWidget(widget.id, {
      config: {
        ...config,
        view: 'results',
        activeAssignmentId: assignment.id,
      },
    });
  };

  const handleUnpublishScores = async (
    assignment: FlashcardAssignment
  ): Promise<void> => {
    const confirmed = await showConfirm(
      `Hide scores for “${assignment.setTitle}”? Students stop seeing their results.`,
      { title: 'Hide scores', variant: 'warning', confirmLabel: 'Hide scores' }
    );
    if (!confirmed) return;
    await runAssignmentAction(
      () => unpublishScores(assignment.id),
      'Scores hidden.',
      'Scores could not be hidden.'
    );
  };

  const showPresent = (set: FlashcardSet): void => {
    updateWidget(widget.id, {
      config: { ...config, view: 'present', presentSetId: set.id },
    });
  };

  if (!user) {
    return <ScaledEmptyState icon={LogIn} title="Sign in required" />;
  }

  // In a share the fall-through below would be the substitute's own library.
  if (inShare && !presentSet) {
    return (
      <ScaledEmptyState
        icon={Layers}
        title={shared.loading ? 'Opening…' : 'No flashcards'}
        subtitle={
          shared.loading
            ? undefined
            : 'This widget had no set open when it was shared.'
        }
      />
    );
  }

  // Hoisted so the substitute's column can put the Launch panel under it
  // without the player's props being written out twice.
  const presentPlayer = presentSet ? (
    <FlashcardPlayer
      key={presentSet.id}
      cards={presentSet.cards}
      termLanguage={presentSet.termLanguage}
      definitionLanguage={presentSet.definitionLanguage}
      adapter={presentAdapter}
      allowedModes={['flashcards']}
      theme="present"
      seed={`${widget.id}:${presentSet.id}`}
      initialSettings={{
        showFirst: config.presentShowFirst ?? 'term',
        shuffle: config.presentShuffle ?? false,
      }}
      onSettingsChange={
        inShare
          ? undefined
          : (settings) =>
              updateWidget(widget.id, {
                config: {
                  ...config,
                  presentShowFirst: settings.showFirst,
                  presentShuffle: settings.shuffle,
                },
              })
      }
      onBack={inShare ? undefined : showLibrary}
    />
  ) : null;

  return (
    <>
      <WidgetLayout
        padding="p-0"
        contentClassName="flex-1 min-h-0"
        content={
          <div
            className="h-full w-full bg-transparent"
            data-flashcards-view={view}
          >
            {view === 'results' && openResults ? (
              <FlashcardResultsView
                key={openResults.id}
                assignment={openResults}
                onBack={showLibrary}
                onPublishScores={publishScores}
                onUnpublishScores={unpublishScores}
              />
            ) : view === 'present' && presentSet ? (
              inShare ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="min-h-0 flex-1">{presentPlayer}</div>
                  <SubLaunchPanel
                    kind="flashcards"
                    widgetId={widget.id}
                    itemId={presentSet.id}
                    label="flashcard set"
                  />
                </div>
              ) : (
                presentPlayer
              )
            ) : editingSet ? (
              <FlashcardEditor
                key={editingSet.id}
                initialSet={editingSet}
                saving={saving}
                onCancel={() => setEditingSet(null)}
                onSave={handleSave}
              />
            ) : (
              <FlashcardLibrary
                sets={flashcardSets.sets}
                loading={flashcardSets.loading}
                error={flashcardSets.error}
                folders={folders}
                onNew={() => setEditingSet(makeSet())}
                onImport={() => setImportOpen(true)}
                onEdit={setEditingSet}
                onPresent={showPresent}
                onShare={setSharingSet}
                onAssign={handleAssign}
                onDelete={(set) => void handleDelete(set)}
                assignments={assignments}
                assignmentsLoading={assignmentsLoading}
                tab={config.libraryTab ?? 'library'}
                onTabChange={(tab) =>
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      libraryTab: tab === 'banks' ? 'library' : tab,
                    },
                  })
                }
                onAssignmentResults={showResults}
                onAssignmentPublishScores={setPublishTarget}
                onAssignmentUnpublishScores={(a) =>
                  void handleUnpublishScores(a)
                }
                onAssignmentCopyLink={(a) => void copyAssignmentLink(a)}
                onAssignmentEnd={(a) => void handleAssignmentEnd(a)}
                onAssignmentReopen={(a) =>
                  void runAssignmentAction(
                    () => reopenAssignment(a.id),
                    `“${a.setTitle}” reopened.`,
                    'Assignment could not be reopened.'
                  )
                }
                onAssignmentDelete={(a) => void handleAssignmentDelete(a)}
              />
            )}
          </div>
        }
      />

      <ImportWizard
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        adapter={importAdapter}
        onSaved={(title) => {
          addToast(`“${title}” imported.`, 'success');
          setImportOpen(false);
        }}
      />

      <FlashcardShareModal
        isOpen={sharingSet !== null}
        set={sharingSet}
        onClose={() => setSharingSet(null)}
        onPublish={flashcardSets.publishSet}
        onRevoke={flashcardSets.revokeShare}
        onNotice={addToast}
      />

      {publishTarget && (
        <FlashcardPublishScoresModal
          assignmentTitle={publishTarget.setTitle || 'Untitled set'}
          currentVisibility={publishTarget.scoreVisibility}
          onClose={() => setPublishTarget(null)}
          onConfirm={async (visibility: PublishableFlashcardVisibility) => {
            await runAssignmentAction(
              () => publishScores(publishTarget.id, visibility),
              'Scores published.',
              'Scores could not be published.'
            );
            setPublishTarget(null);
          }}
        />
      )}

      {assigningSet && (
        <FlashcardAssignModal
          key={assigningSet.id}
          isOpen
          set={assigningSet}
          rosters={rosters}
          initialRosterIds={config.lastRosterIdsBySetId?.[assigningSet.id]}
          onClose={() => setAssigningSet(null)}
          onAssign={performAssign}
          periodAccess={assignPeriodCtx}
        />
      )}
    </>
  );
};
