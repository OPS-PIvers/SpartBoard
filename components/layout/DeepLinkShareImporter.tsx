import React, { useEffect } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useQuiz } from '@/hooks/useQuiz';
import {
  useQuizAssignments,
  type SharedAssignmentImportMode,
} from '@/hooks/useQuizAssignments';
import { useVideoActivity } from '@/hooks/useVideoActivity';
import { useVideoActivityAssignments } from '@/hooks/useVideoActivityAssignments';
import { usePlcs } from '@/hooks/usePlcs';
import { QuizAssignmentImportModeModal } from '@/components/widgets/QuizWidget/components/QuizAssignmentImportModeModal';
import { logError } from '@/utils/logError';
import { getPlcRole } from '@/utils/plc';

/**
 * Deep-link share-import machinery, split out of DashboardView's synchronous
 * teacher mount.
 *
 * The five hooks below (useQuiz, useQuizAssignments, useVideoActivity,
 * useVideoActivityAssignments, usePlcs) each open a live Firestore
 * `onSnapshot` listener on mount, yet DashboardView consumes ONLY their
 * import/peek callbacks — never their `assignments`/`quizzes`/`plcs` lists
 * (the QuizWidget / VideoActivityWidget run their own independent listeners
 * for that). Mounting this component unconditionally therefore cost every
 * normal teacher load five Firestore listeners + the associated render work
 * for a code path that only matters when a share link is actually being
 * imported.
 *
 * DashboardView now mounts this component lazily — only once a pending share
 * id appears (and it stays mounted thereafter for the session, since imports
 * are rare and the pending id is cleared synchronously by the effects below).
 * On the common path (no share import in flight) none of these listeners are
 * ever opened.
 *
 * Behaviour is identical to the previous inline implementation: the effects
 * fire on mount with the same pending id present, clear it synchronously to
 * avoid the triple-import race, and surface the same toasts / mode picker.
 */
export const DeepLinkShareImporter: React.FC = () => {
  const { user } = useAuth();
  const {
    activeDashboard,
    addWidget,
    updateWidget,
    bringToFront,
    addToast,
    setPendingAssignmentSetup,
    pendingQuizShareId,
    clearPendingQuizShare,
    pendingAssignmentShareId,
    clearPendingAssignmentShare,
    pendingVideoActivityShareId,
    clearPendingVideoActivityShare,
  } = useDashboard();

  const { importSharedQuiz, saveQuiz, deleteQuiz, attachSyncLinkage } = useQuiz(
    user?.uid
  );
  const { importSharedAssignment, peekSharedAssignment } = useQuizAssignments(
    user?.uid
  );
  const {
    saveActivity: saveVideoActivity,
    attachSyncLinkage: attachVideoActivitySyncLinkage,
  } = useVideoActivity(user?.uid);
  const { importSharedAssignment: importSharedVideoActivityAssignment } =
    useVideoActivityAssignments(user?.uid);
  // usePlcs's listener now starts when this importer first mounts rather than
  // at teacher mount. For a URL-parameter deep link (share id present at app
  // load) the listener and the import trigger start together, so the
  // `if (plcsLoading) return` guards in the assignment effects below fire once
  // and the import waits one extra snapshot round-trip for `plcs` to hydrate
  // before evaluating PLC membership. Behaviour is unchanged (the effects
  // re-run when loading completes) — it is only a small one-time latency shift
  // on the deep-link path, and it's the correct trade for not opening this
  // listener on every common (no-import) teacher load.
  const { plcs, loading: plcsLoading } = usePlcs();

  // Mode picker state — populated when a synced share is detected; null
  // means no picker is open. We hold the shareId + a snapshot of the
  // share doc here so the modal can render the title/originator
  // immediately without re-fetching, and so the actual import only fires
  // after the user picks a mode.
  const [importModePrompt, setImportModePrompt] = React.useState<{
    shareId: string;
    title: string;
    originalAuthor: string;
  } | null>(null);

  // Helper: open (or create) a Quiz widget and set its managerTab.
  // Used by pending-share effects to surface the imported content to the user.
  const openQuizWidgetToTab = React.useCallback(
    (tab: 'library' | 'active' | 'archive') => {
      const quizWidget = activeDashboard?.widgets.find(
        (w) => w.type === 'quiz'
      );
      if (quizWidget) {
        if (quizWidget.minimized) {
          updateWidget(quizWidget.id, { minimized: false });
        }
        updateWidget(quizWidget.id, {
          config: {
            ...quizWidget.config,
            view: 'manager',
            managerTab: tab,
          },
        });
        bringToFront(quizWidget.id);
      } else {
        addWidget('quiz', {
          config: { view: 'manager', managerTab: tab },
        });
      }
    },
    [activeDashboard, updateWidget, addWidget, bringToFront]
  );

  const openVideoActivityWidgetToTab = React.useCallback(
    (tab: 'library' | 'active' | 'archive') => {
      const vaWidget = activeDashboard?.widgets.find(
        (w) => w.type === 'video-activity'
      );
      if (vaWidget) {
        if (vaWidget.minimized) {
          updateWidget(vaWidget.id, { minimized: false });
        }
        updateWidget(vaWidget.id, {
          config: {
            ...vaWidget.config,
            view: 'manager',
            managerTab: tab,
          },
        });
        bringToFront(vaWidget.id);
      } else {
        addWidget('video-activity', {
          config: { view: 'manager', managerTab: tab },
        });
      }
    },
    [activeDashboard, updateWidget, addWidget, bringToFront]
  );

  // Handle pending quiz share import from URL/paste.
  // After a successful import, surface the Quiz widget to the Library tab so
  // the user actually sees where the new quiz landed (fixes the "nothing
  // happened" paste UX).
  useEffect(() => {
    if (!pendingQuizShareId || !user) return;
    // Clear synchronously BEFORE awaiting so effect re-runs (triggered by
    // unrelated dep churn like `openQuizWidgetToTab` changing reference when
    // activeDashboard updates) don't re-invoke the import and spawn duplicate
    // widgets. Previously this was in .finally() and opened a race window
    // where the same shareId could be imported 2-3× concurrently.
    const shareId = pendingQuizShareId;
    clearPendingQuizShare();
    void importSharedQuiz(shareId)
      .then(() => {
        addToast('Shared quiz imported to your library!', 'success');
        openQuizWidgetToTab('library');
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : '';
        addToast(
          msg
            ? `Failed to import shared quiz: ${msg}`
            : 'Failed to import shared quiz.',
          'error'
        );
      });
  }, [
    pendingQuizShareId,
    user,
    importSharedQuiz,
    addToast,
    clearPendingQuizShare,
    openQuizWidgetToTab,
  ]);

  // Stable callback: imports a shared assignment with the chosen mode and
  // surfaces success/failure toasts. Invoked from two places:
  //   1) The pending-share effect, after a non-synced share is detected
  //      (mode silently defaults to 'copy').
  //   2) The QuizAssignmentImportModeModal, after the teacher picks
  //      Sync vs Copy.
  // Defined outside the effect so both paths share identical orchestration.
  const runAssignmentImport = React.useCallback(
    (shareId: string, mode: SharedAssignmentImportMode) => {
      if (!user) return;
      void importSharedAssignment(
        shareId,
        async (quiz) => {
          const meta = await saveQuiz(quiz);
          return { id: meta.id, driveFileId: meta.driveFileId };
        },
        // Roll back the just-copied quiz if assignment creation fails
        // mid-flight — otherwise the importer is left with a phantom
        // quiz in their library and a generic "import failed" toast.
        async (saved) => {
          await deleteQuiz(saved.id, saved.driveFileId);
        },
        // PLC handling: bundled isMember + onNonMember so the contract
        // "PLC handling is opt-in as a unit" is visible at the call site.
        {
          isMember: (plcId) =>
            !!user &&
            plcs.some(
              (p) => p.id === plcId && getPlcRole(p, user.uid) !== null
            ),
          onNonMember: ({ plcName }) => {
            addToast(
              `This is a PLC quiz assignment for "${plcName}". You're not a member, so your results will export to your own sheet.`,
              'info',
              {
                label: 'PLC Settings',
                onClick: () => {
                  window.dispatchEvent(
                    new CustomEvent('open-sidebar', {
                      detail: { section: 'plcs' },
                    })
                  );
                },
              }
            );
          },
        },
        {
          mode,
          attachSyncLinkage,
        }
      )
        .then((newAssignmentId) => {
          addToast(
            mode === 'sync'
              ? 'Synced assignment imported!'
              : 'Shared assignment imported!',
            'success'
          );
          openQuizWidgetToTab('active');
          // Prompt the importer to pick rosters/periods for the new
          // assignment instead of leaving it paused with no targeting.
          setPendingAssignmentSetup(newAssignmentId);
        })
        .catch((err: unknown) => {
          logError('DeepLinkShareImporter.runAssignmentImport', err, {
            mode,
            shareId,
          });
          const msg =
            err instanceof Error
              ? err.message
              : typeof err === 'string'
                ? err
                : '';
          addToast(
            msg
              ? `Failed to import shared assignment: ${msg}`
              : 'Failed to import shared assignment.',
            'error'
          );
        });
    },
    [
      user,
      importSharedAssignment,
      saveQuiz,
      deleteQuiz,
      attachSyncLinkage,
      addToast,
      openQuizWidgetToTab,
      setPendingAssignmentSetup,
      plcs,
    ]
  );

  // Handle pending shared assignment import from URL/paste.
  //
  // Two-step flow:
  //   1. Peek at the share doc to detect synced-mode capability.
  //   2a. If syncGroupId is present → open QuizAssignmentImportModeModal
  //       and let the teacher pick Sync or Copy. The modal's onPick
  //       handler triggers runAssignmentImport with the chosen mode.
  //   2b. If syncGroupId is absent (legacy share) → run the legacy
  //       copy-mode import directly, no UI prompt.
  //
  // Imports copy the quiz into the user's library and create a paused
  // assignment, then surface the Quiz widget to the Active tab — which
  // shows live and paused assignments (Archive only shows inactive ones).
  // Stable callback: peek the share doc and route to either the mode
  // picker (synced share) or a direct copy import (legacy share).
  // Extracted so the failure toast can offer Retry without re-running
  // the whole effect — the effect synchronously clears
  // pendingAssignmentShareId to prevent triple-import races, so a
  // failed peek would otherwise leave the user with no recovery path
  // short of pasting the URL again.
  // Self-referential Retry: the recursive call is routed through a ref so the
  // useCallback body doesn't reference its own binding before declaration
  // (react-hooks/immutability). The ref is refreshed during render below.
  const peekAndDispatchImportRef = React.useRef<(shareId: string) => void>(
    () => undefined
  );
  const peekAndDispatchImport = React.useCallback(
    (shareId: string) => {
      void peekSharedAssignment(shareId)
        .then((preview) => {
          // Sync mode is only offered when the share is sync-enabled AND
          // (the share has no PLC OR the importer is a member of that
          // PLC). A non-PLC-member of a PLC-shared synced assignment
          // shouldn't be able to silently join a synchronized peer group
          // they have no relationship to — so we transparently fall
          // through to copy-mode (the existing non-member nudge toast
          // still fires from runAssignmentImport's plcHandling path).
          const previewPlcId = preview.plc?.id;
          const importerIsPlcMember =
            !!previewPlcId &&
            !!user &&
            plcs.some(
              (p) => p.id === previewPlcId && getPlcRole(p, user.uid) !== null
            );
          const canOfferSync =
            !!preview.syncGroupId && (!preview.plc || importerIsPlcMember);
          if (canOfferSync) {
            // Defer the import to the modal's onPick handler.
            setImportModePrompt({
              shareId,
              title: preview.title,
              originalAuthor: preview.originalAuthor,
            });
            return;
          }
          runAssignmentImport(shareId, 'copy');
        })
        .catch((err: unknown) => {
          logError('DeepLinkShareImporter.peekAndDispatchImport', err, {
            shareId,
          });
          const msg =
            err instanceof Error
              ? err.message
              : typeof err === 'string'
                ? err
                : '';
          addToast(
            msg
              ? `Failed to import shared assignment: ${msg}`
              : 'Failed to import shared assignment.',
            'error',
            {
              label: 'Retry',
              onClick: () => peekAndDispatchImportRef.current(shareId),
            }
          );
        });
    },
    [peekSharedAssignment, runAssignmentImport, addToast, plcs, user]
  );

  useEffect(() => {
    if (!pendingAssignmentShareId || !user) return;
    // Wait for /plcs to hydrate before evaluating membership. Without this
    // gate, a deep-link import that fires before the listener populates
    // `plcs` sees `[]`, the `isPlcMember` predicate returns false, and a
    // legitimate member is silently demoted to non-member. Once
    // plcsLoading flips to false the effect re-runs with the real list.
    if (plcsLoading) return;
    // Clear synchronously BEFORE awaiting — see the quiz-share effect above
    // for the triple-import race rationale. The Retry action in the
    // failure toast (wired via peekAndDispatchImport) restores the
    // recovery path without reintroducing the race.
    const shareId = pendingAssignmentShareId;
    clearPendingAssignmentShare();
    peekAndDispatchImport(shareId);
  }, [
    pendingAssignmentShareId,
    user,
    peekAndDispatchImport,
    clearPendingAssignmentShare,
    plcsLoading,
  ]);

  // Stable dispatcher for VA share imports — extracted so the failure
  // toast's Retry action can re-invoke it without re-running the
  // pending-id effect (which clears the id synchronously to avoid the
  // triple-import race documented on the Quiz path above). Mirrors
  // `peekAndDispatchImport` for the Quiz flow but skips the peek + mode
  // picker — VA's sync-mode picker UI hasn't been ported and a synced
  // share simply imports as a copy.
  // Self-referential Retry — routed through a ref (see peekAndDispatchImport
  // above for the react-hooks/immutability rationale).
  const runVideoActivityImportRef = React.useRef<(shareId: string) => void>(
    () => undefined
  );
  const runVideoActivityImport = React.useCallback(
    (shareId: string) => {
      void importSharedVideoActivityAssignment(shareId, {
        mode: 'copy',
        saveActivity: saveVideoActivity,
        attachSyncLinkage: attachVideoActivitySyncLinkage,
      })
        .then(() => {
          addToast('Shared video activity imported!', 'success');
          openVideoActivityWidgetToTab('active');
        })
        .catch((err: unknown) => {
          logError('DeepLinkShareImporter.importSharedVideoActivity', err, {
            shareId,
          });
          // The VA import hook handles its own rollback (Drive copy +
          // sync-group leave) on failure paths, so the catch block is
          // surface-only — no manual cleanup needed.
          const msg =
            err instanceof Error
              ? err.message
              : typeof err === 'string'
                ? err
                : '';
          addToast(
            msg
              ? `Failed to import shared video activity: ${msg}`
              : 'Failed to import shared video activity.',
            'error',
            {
              label: 'Retry',
              onClick: () => runVideoActivityImportRef.current(shareId),
            }
          );
        });
    },
    [
      importSharedVideoActivityAssignment,
      saveVideoActivity,
      attachVideoActivitySyncLinkage,
      addToast,
      openVideoActivityWidgetToTab,
    ]
  );

  // Keep the self-reference refs current. Updated in an effect (not during
  // render) so this compiler-analyzed component obeys react-hooks/refs; the
  // refs are only dereferenced from deferred Retry onClicks, which always run
  // after this effect has committed.
  useEffect(() => {
    peekAndDispatchImportRef.current = peekAndDispatchImport;
    runVideoActivityImportRef.current = runVideoActivityImport;
  }, [peekAndDispatchImport, runVideoActivityImport]);

  // PR3c — pending video-activity-assignment share import. Mirrors the
  // quiz-assignment effect above: clears the pending id synchronously
  // before dispatching to avoid the triple-import race; the dispatcher's
  // failure toast carries Retry as the recovery path.
  useEffect(() => {
    if (!pendingVideoActivityShareId || !user) return;
    if (plcsLoading) return;
    const shareId = pendingVideoActivityShareId;
    clearPendingVideoActivityShare();
    runVideoActivityImport(shareId);
  }, [
    pendingVideoActivityShareId,
    user,
    plcsLoading,
    clearPendingVideoActivityShare,
    runVideoActivityImport,
  ]);

  if (!importModePrompt) return null;

  return (
    <QuizAssignmentImportModeModal
      quizTitle={importModePrompt.title}
      onPick={(mode) => {
        const { shareId } = importModePrompt;
        setImportModePrompt(null);
        runAssignmentImport(shareId, mode);
      }}
      onClose={() => {
        // Closing the picker without choosing drops the deep-link share
        // (it was cleared synchronously in the effect above to avoid
        // triple-import races). Surface a Retry toast so the teacher can
        // re-run the same import without re-pasting the URL.
        const { shareId } = importModePrompt;
        setImportModePrompt(null);
        addToast('Import canceled.', 'info', {
          label: 'Retry',
          onClick: () => peekAndDispatchImport(shareId),
        });
      }}
    />
  );
};
