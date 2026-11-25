import React, { useEffect, useLayoutEffect } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useQuiz } from '@/hooks/useQuiz';
import {
  useQuizAssignments,
  type SharedAssignmentImportMode,
} from '@/hooks/useQuizAssignments';
import { useVideoActivity } from '@/hooks/useVideoActivity';
import { useRubrics } from '@/hooks/useRubrics';
import { useQuestionBanks } from '@/hooks/useQuestionBanks';
import {
  useVideoActivityAssignments,
  type SharedVideoActivityImportMode,
} from '@/hooks/useVideoActivityAssignments';
import { usePlcs } from '@/hooks/usePlcs';
import { QuizAssignmentImportModeModal } from '@/components/widgets/QuizWidget/components/QuizAssignmentImportModeModal';
import { logError } from '@/utils/logError';
import { getPlcRole, plcLinkageFor } from '@/utils/plc';
import { OPERATOR_ORG_ID } from '@/config/organization';
import {
  describeSharer,
  lookupOrgSharer,
  peekShareHeader,
  type OrgSharer,
} from '@/utils/shareImportPeek';
import { ShareImportConfirmModal } from './ShareImportConfirmModal';
import type { LibraryShareLink } from '@/utils/shareRoutes';
import type { PlcLinkage } from '@/types';

type AssignmentShareKind = 'assignment' | 'videoActivity';

interface AssignmentSharePreview {
  title: string;
  originalAuthor: string;
  syncGroupId?: string;
  plc?: PlcLinkage;
}

const errorText = (err: unknown): string =>
  err instanceof Error ? err.message : typeof err === 'string' ? err : '';

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
  const { user, orgId, canAccessFeature } = useAuth();
  const {
    activeDashboard,
    addWidget,
    updateWidget,
    bringToFront,
    addToast,
    setPendingAssignmentSetup,
    pendingLibraryShare,
    clearPendingLibraryShare,
  } = useDashboard();

  const {
    importSharedQuiz,
    saveQuiz,
    deleteQuiz,
    attachSyncLinkage,
    saveDriveSnapshot,
  } = useQuiz(user?.uid);
  const { importSharedRubric } = useRubrics(user?.uid);
  const { saveBank } = useQuestionBanks(user?.uid);
  const { importSharedAssignment, peekSharedAssignment } = useQuizAssignments(
    user?.uid
  );
  const {
    saveActivity: saveVideoActivity,
    attachSyncLinkage: attachVideoActivitySyncLinkage,
  } = useVideoActivity(user?.uid);
  const {
    importSharedAssignment: importSharedVideoActivityAssignment,
    peekSharedAssignment: peekSharedVideoActivityAssignment,
  } = useVideoActivityAssignments(user?.uid);
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
    kind: AssignmentShareKind;
    shareId: string;
    title: string;
    originalAuthor: string;
    orgSharer?: OrgSharer | null;
  } | null>(null);

  // Nothing is imported until the teacher confirms this prompt.
  const [confirmPrompt, setConfirmPrompt] = React.useState<{
    kindLabel: string;
    title: string;
    originalAuthor: string;
    orgSharer: OrgSharer | null;
    run: () => void;
  } | null>(null);

  // Org staff record for the share's author; a failed lookup falls back to PLC rosters.
  const resolveOrgSharer = React.useCallback(
    async (authorUid: string): Promise<OrgSharer | null> => {
      if (!authorUid || authorUid === user?.uid) return null;
      try {
        // orgId may not have resolved yet; the operator org is the usual one.
        return await lookupOrgSharer(orgId ?? OPERATOR_ORG_ID, authorUid);
      } catch (err) {
        logError('DeepLinkShareImporter.lookupOrgSharer', err);
        return null;
      }
    },
    [orgId, user?.uid]
  );

  const requestConfirm = React.useCallback(
    (
      kindLabel: string,
      collectionName: string,
      shareId: string,
      run: () => void
    ) => {
      const peek = (): void => {
        void peekShareHeader(collectionName, shareId)
          .then(async (h) => {
            const orgSharer = await resolveOrgSharer(h.originalAuthor);
            setConfirmPrompt({
              kindLabel,
              title: h.title,
              originalAuthor: h.originalAuthor,
              orgSharer,
              run,
            });
          })
          .catch((err: unknown) => {
            logError('DeepLinkShareImporter.peekShareHeader', err, {
              shareId,
            });
            const msg = err instanceof Error ? err.message : '';
            addToast(
              msg
                ? `Failed to open shared ${kindLabel}: ${msg}`
                : `Failed to open shared ${kindLabel}.`,
              'error',
              { label: 'Retry', onClick: peek }
            );
          });
      };
      peek();
    },
    [addToast, resolveOrgSharer]
  );

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

  // Async .then callbacks read the latest openers so they see the board as it is when the import resolves.
  const openQuizRef = React.useRef(openQuizWidgetToTab);
  const openVaRef = React.useRef(openVideoActivityWidgetToTab);
  useLayoutEffect(() => {
    openQuizRef.current = openQuizWidgetToTab;
    openVaRef.current = openVideoActivityWidgetToTab;
  });

  const runQuizImport = React.useCallback(
    (shareId: string) => {
      void importSharedQuiz(shareId, saveBank)
        .then(() => {
          addToast('Shared quiz imported to your library!', 'success');
          openQuizRef.current('library');
        })
        .catch((err: unknown) => {
          const msg = errorText(err);
          addToast(
            msg
              ? `Failed to import shared quiz: ${msg}`
              : 'Failed to import shared quiz.',
            'error'
          );
        });
    },
    [importSharedQuiz, saveBank, addToast]
  );

  // Rubrics have no widget surface of their own, so the toast is the whole success affordance.
  const runRubricImport = React.useCallback(
    (shareId: string) => {
      void importSharedRubric(shareId)
        .then((rubric) => {
          const title = rubric?.title?.trim();
          addToast(
            title
              ? `Rubric "${title}" imported to your library!`
              : 'Shared rubric imported to your library!',
            'success'
          );
        })
        .catch((err: unknown) => {
          logError('DeepLinkShareImporter.importSharedRubric', err, {
            shareId,
          });
          const msg = errorText(err);
          addToast(
            msg
              ? `Failed to import shared rubric: ${msg}`
              : 'Failed to import shared rubric.',
            'error'
          );
        });
    },
    [importSharedRubric, addToast]
  );

  // Stable callback: imports a shared assignment with the chosen mode and
  // surfaces success/failure toasts. Invoked from two places:
  //   1) The pending-share effect, after a non-synced share is detected
  //      (mode silently defaults to 'copy').
  //   2) The QuizAssignmentImportModeModal, after the teacher picks
  //      Sync vs Copy.
  // Defined outside the effect so both paths share identical orchestration.
  const livePlcLinkage = React.useCallback(
    (plcId: string) => {
      const plc = plcs.find((p) => p.id === plcId);
      return plc ? plcLinkageFor(plc) : undefined;
    },
    [plcs]
  );

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
          liveLinkage: livePlcLinkage,
        },
        {
          mode,
          attachSyncLinkage,
          saveBank,
          saveDriveSnapshot,
        }
      )
        .then((newAssignmentId) => {
          addToast(
            mode === 'sync'
              ? 'Synced assignment imported!'
              : 'Shared assignment imported!',
            'success'
          );
          openQuizRef.current('active');
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
      saveBank,
      saveDriveSnapshot,
      addToast,
      setPendingAssignmentSetup,
      plcs,
      livePlcLinkage,
    ]
  );

  const isPlcMember = React.useCallback(
    (plcId: string) =>
      !!user &&
      plcs.some((p) => p.id === plcId && getPlcRole(p, user.uid) !== null),
    [plcs, user]
  );

  // The VA import hook rolls back its own Drive copy and group join, so failures only toast.
  const runVideoActivityImportRef = React.useRef<
    (shareId: string, mode: SharedVideoActivityImportMode) => void
  >(() => undefined);
  const runVideoActivityImport = React.useCallback(
    (shareId: string, mode: SharedVideoActivityImportMode) => {
      void importSharedVideoActivityAssignment(shareId, {
        mode,
        saveActivity: saveVideoActivity,
        attachSyncLinkage: attachVideoActivitySyncLinkage,
        isPlcMember,
        livePlcLinkage,
      })
        .then(() => {
          addToast(
            mode === 'sync'
              ? 'Synced video activity imported!'
              : 'Shared video activity imported!',
            'success'
          );
          openVaRef.current('active');
        })
        .catch((err: unknown) => {
          logError('DeepLinkShareImporter.importSharedVideoActivity', err, {
            shareId,
            mode,
          });
          const msg = errorText(err);
          addToast(
            msg
              ? `Failed to import shared video activity: ${msg}`
              : 'Failed to import shared video activity.',
            'error',
            {
              label: 'Retry',
              onClick: () => runVideoActivityImportRef.current(shareId, mode),
            }
          );
        });
    },
    [
      importSharedVideoActivityAssignment,
      saveVideoActivity,
      attachVideoActivitySyncLinkage,
      addToast,
      isPlcMember,
      livePlcLinkage,
    ]
  );

  // Optional call: importer tests mock useAuth without it.
  const vaShareSyncOn =
    canAccessFeature?.('video-activity-share-sync') ?? false;
  const assignmentAdapters: Record<
    AssignmentShareKind,
    {
      kindLabel: string;
      peek: (shareId: string) => Promise<AssignmentSharePreview>;
      run: (shareId: string, mode: SharedAssignmentImportMode) => void;
      offersSync: boolean;
    }
  > = {
    assignment: {
      kindLabel: 'assignment',
      peek: peekSharedAssignment,
      run: runAssignmentImport,
      offersSync: true,
    },
    videoActivity: {
      kindLabel: 'video activity',
      peek: async (shareId) => {
        const shared = await peekSharedVideoActivityAssignment(shareId);
        if (!shared) throw new Error('Shared video activity not found.');
        return {
          title: shared.title?.trim() || 'Untitled',
          originalAuthor: shared.originalAuthor,
          syncGroupId: shared.syncGroupId,
          plc: shared.assignmentSettings?.plc,
        };
      },
      run: runVideoActivityImport,
      offersSync: vaShareSyncOn,
    },
  };

  // Peeks the share, then opens Synced or Make a copy when the share can sync, else the plain confirm.
  const peekAndDispatchImportRef = React.useRef<
    (kind: AssignmentShareKind, shareId: string) => void
  >(() => undefined);
  const peekAndDispatchImport = (
    kind: AssignmentShareKind,
    shareId: string
  ): void => {
    const adapter = assignmentAdapters[kind];
    void adapter
      .peek(shareId)
      .then(async (preview) => {
        // A non-member of the share's PLC never joins its synced group.
        const canOfferSync =
          adapter.offersSync &&
          !!preview.syncGroupId &&
          (!preview.plc || isPlcMember(preview.plc.id));
        const orgSharer = await resolveOrgSharer(preview.originalAuthor);
        if (canOfferSync) {
          setImportModePrompt({
            kind,
            shareId,
            title: preview.title,
            originalAuthor: preview.originalAuthor,
            orgSharer,
          });
          return;
        }
        setConfirmPrompt({
          kindLabel: adapter.kindLabel,
          title: preview.title,
          originalAuthor: preview.originalAuthor,
          orgSharer,
          run: () => adapter.run(shareId, 'copy'),
        });
      })
      .catch((err: unknown) => {
        logError('DeepLinkShareImporter.peekAndDispatchImport', err, {
          kind,
          shareId,
        });
        const msg = errorText(err);
        addToast(
          msg
            ? `Failed to import shared ${adapter.kindLabel}: ${msg}`
            : `Failed to import shared ${adapter.kindLabel}.`,
          'error',
          {
            label: 'Retry',
            onClick: () => peekAndDispatchImportRef.current(kind, shareId),
          }
        );
      });
  };
  const dispatchShare = (link: LibraryShareLink): void => {
    const { kind, shareId } = link;
    switch (kind) {
      case 'quiz':
        requestConfirm('quiz', 'shared_quizzes', shareId, () =>
          runQuizImport(shareId)
        );
        return;
      case 'rubric':
        requestConfirm('rubric', 'shared_rubrics', shareId, () =>
          runRubricImport(shareId)
        );
        return;
      case 'assignment':
      case 'videoActivity':
        peekAndDispatchImport(kind, shareId);
        return;
    }
  };
  // Deferred Retry clicks and the effect below read the latest dispatchers.
  const dispatchShareRef = React.useRef(dispatchShare);
  useLayoutEffect(() => {
    peekAndDispatchImportRef.current = peekAndDispatchImport;
    runVideoActivityImportRef.current = runVideoActivityImport;
    dispatchShareRef.current = dispatchShare;
  });

  // One pending share at a time; cleared before any await so re-runs can't import it twice.
  useEffect(() => {
    if (!pendingLibraryShare || !user) return;
    // PLC membership decides the sharer line, sync offers and PLC linkage.
    if (plcsLoading) return;
    clearPendingLibraryShare();
    dispatchShareRef.current(pendingLibraryShare);
  }, [pendingLibraryShare, user, plcsLoading, clearPendingLibraryShare]);

  if (confirmPrompt && user) {
    const { run } = confirmPrompt;
    return (
      <ShareImportConfirmModal
        kindLabel={confirmPrompt.kindLabel}
        title={confirmPrompt.title}
        sharer={describeSharer(
          confirmPrompt.originalAuthor,
          user.uid,
          plcs,
          confirmPrompt.orgSharer
        )}
        onConfirm={() => {
          setConfirmPrompt(null);
          run();
        }}
        onCancel={() => {
          setConfirmPrompt(null);
          addToast('Import canceled.', 'info');
        }}
      />
    );
  }

  if (!importModePrompt) return null;

  return (
    <QuizAssignmentImportModeModal
      quizTitle={importModePrompt.title}
      originatorName={describeSharer(
        importModePrompt.originalAuthor,
        user?.uid ?? '',
        plcs,
        importModePrompt.orgSharer ?? null,
        true
      )}
      onPick={(mode) => {
        const { kind, shareId } = importModePrompt;
        setImportModePrompt(null);
        assignmentAdapters[kind].run(shareId, mode);
      }}
      onClose={() => {
        // Closing the picker without choosing drops the deep-link share
        // (it was cleared synchronously in the effect above to avoid
        // triple-import races). Surface a Retry toast so the teacher can
        // re-run the same import without re-pasting the URL.
        const { kind, shareId } = importModePrompt;
        setImportModePrompt(null);
        addToast('Import canceled.', 'info', {
          // Route through the ref (like the catch-path Retry) so a Retry
          // clicked long after cancel runs against the freshest dispatcher —
          // i.e. the latest `plcs` membership snapshot, not the one captured
          // when this toast was created.
          label: 'Retry',
          onClick: () => peekAndDispatchImportRef.current(kind, shareId),
        });
      }}
    />
  );
};
