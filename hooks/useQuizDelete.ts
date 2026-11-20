import type { QuizAssignment, QuizMetadata } from '@/types';
import type { DashboardContextValue } from '@/context/DashboardContextValue';
import type { DialogContextValue } from '@/context/DialogContextValue';
import type { UseQuizResult } from '@/hooks/useQuiz';
import type { UseQuizAssignmentsResult } from '@/hooks/useQuizAssignments';
import { deletePaperBatchesForQuiz } from '@/utils/paperBatchStore';

interface UseQuizDeleteArgs {
  user: { uid: string } | null | undefined;
  assignments: QuizAssignment[];
  assignmentsLoading: UseQuizAssignmentsResult['loading'];
  assignmentsError: UseQuizAssignmentsResult['error'];
  addToast: DashboardContextValue['addToast'];
  showConfirm: DialogContextValue['showConfirm'];
  deleteQuiz: UseQuizResult['deleteQuiz'];
}

// Fresh handlers every render, as the inline JSX props they replace were.
export const useQuizDelete = ({
  user,
  assignments,
  assignmentsLoading,
  assignmentsError,
  addToast,
  showConfirm,
  deleteQuiz,
}: UseQuizDeleteArgs) => {
  const onDelete = async (meta: QuizMetadata) => {
    // Block deletion when active/paused assignments reference the quiz,
    // since the monitor + results views need the answer key from the
    // library record. Archived (inactive) assignments only add a warning
    // to the shared delete confirm (deleteDetail).
    const live = assignments.filter(
      (a) => a.quizId === meta.id && a.status !== 'inactive'
    );
    if (live.length > 0) {
      addToast(
        `Cannot delete: ${live.length} active or paused assignment(s) still reference this quiz. Deactivate them first.`,
        'error'
      );
      return;
    }
    try {
      await deleteQuiz(meta.id, meta.driveFileId);
      if (user?.uid) {
        // Best-effort: the quiz is already gone, so a failure here leaves
        // only an unreachable batch record, never a blocked delete.
        await deletePaperBatchesForQuiz(user.uid, meta.id).catch(
          (batchErr: unknown) => {
            console.warn('[QuizWidget] paper batch cleanup:', batchErr);
          }
        );
      }
      addToast('Quiz deleted.', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const onBulkDelete = async (metas: QuizMetadata[]): Promise<boolean> => {
    // Aggregated variant of the single-quiz onDelete handler above.
    // Partitions targets into:
    //   - blocked: has live/paused assignments → cannot delete
    //   - withArchived: has only archived assignments → needs warning
    //   - clean: no assignments → delete silently
    // Shows ONE summary toast for blocked items and ONE aggregated
    // confirm for the archived-assignment warning, regardless of how
    // many quizzes are selected — replaces the old per-item dialogs
    // that would fire up to N times when bulk-deleting N quizzes.
    //
    // Returns `true` when a delete was attempted (caller clears
    // selection) and `false` when the handler aborted or the user
    // cancelled (caller preserves selection so the teacher can retry
    // without re-selecting everything).

    // Guard against stale/empty assignments: the live-assignment check
    // is load-bearing for student safety. Abort if the listener hasn't
    // populated yet — or if it errored (hook flips loading→false and
    // leaves `assignments=[]` on error, which would otherwise let a
    // live quiz get misclassified as deletable).
    if (assignmentsLoading || assignmentsError) {
      addToast(
        assignmentsError
          ? "Couldn't verify assignment status — try bulk delete again in a moment."
          : 'Still loading assignment data — try bulk delete again in a moment.',
        'info'
      );
      return false;
    }

    // Pre-index assignments by quizId so partitioning stays O(N+M)
    // rather than O(N*M) for large teacher archives.
    const byQuizId = new Map<string, QuizAssignment[]>();
    for (const a of assignments) {
      const list = byQuizId.get(a.quizId);
      if (list) list.push(a);
      else byQuizId.set(a.quizId, [a]);
    }

    const blocked: QuizMetadata[] = [];
    const withArchived: QuizMetadata[] = [];
    const clean: QuizMetadata[] = [];
    for (const meta of metas) {
      const related = byQuizId.get(meta.id) ?? [];
      const hasLive = related.some((a) => a.status !== 'inactive');
      if (hasLive) {
        blocked.push(meta);
      } else if (related.length > 0) {
        withArchived.push(meta);
      } else {
        clean.push(meta);
      }
    }

    if (blocked.length > 0) {
      addToast(
        `Skipped ${blocked.length} quiz${blocked.length === 1 ? '' : 'zes'} with active or paused assignments. Deactivate them first.`,
        'error'
      );
    }

    const deletable = [...clean, ...withArchived];
    if (deletable.length === 0) return false;

    const confirmMsg =
      withArchived.length > 0
        ? `Delete ${deletable.length} quiz${deletable.length === 1 ? '' : 'zes'}? ` +
          `${withArchived.length} ${withArchived.length === 1 ? 'has' : 'have'} archived assignments — ` +
          `deleting will prevent viewing their monitor and results. This cannot be undone.`
        : `Delete ${deletable.length} quiz${deletable.length === 1 ? '' : 'zes'}? This cannot be undone.`;
    const hasArchivedWarning = withArchived.length > 0;
    const ok = await showConfirm(confirmMsg, {
      title: 'Delete Quizzes',
      variant: hasArchivedWarning ? 'warning' : 'danger',
      confirmLabel: hasArchivedWarning ? 'Delete Anyway' : 'Delete',
    });
    if (!ok) return false;

    const results = await Promise.allSettled(
      deletable.map((meta) => deleteQuiz(meta.id, meta.driveFileId))
    );
    const failed: string[] = [];
    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        const id = deletable[idx]?.id ?? '?';
        failed.push(id);
        console.error('[QuizWidget] bulk delete failed for', id, result.reason);
      }
    });

    const succeeded = deletable.length - failed.length;
    if (succeeded > 0) {
      addToast(
        `Deleted ${succeeded} quiz${succeeded === 1 ? '' : 'zes'}.`,
        'success'
      );
    }
    if (failed.length > 0) {
      addToast(
        `${failed.length} quiz${failed.length === 1 ? '' : 'zes'} failed to delete.`,
        'error'
      );
    }
    return true;
  };

  return { onDelete, onBulkDelete };
};
