/**
 * PlcAssignmentSessionModal — opens the live Monitor or Results view for an
 * in-progress PLC assignment *on top of* the PLC dashboard, instead of the
 * old hand-off that flipped the board's QuizWidget behind the overlay (which
 * forced teachers to close the PLC page to see anything).
 *
 * It is fully self-contained: given an `assignmentId` (which is also the live
 * quiz-session doc id), it owns its own data via `useQuizSessionTeacher`
 * (session + responses + every action callback), finds the assignment doc via
 * `useQuizAssignments`, and hydrates the answer key from Drive. It then renders
 * the existing `QuizLiveMonitor` / `QuizResults` presentational components.
 *
 * Only the owner's own quiz assignments reach here (the In-progress sub-tab
 * gates the buttons on `isOwner && kind === 'quiz'`), so the teacher gets full
 * session control — advance, pause/resume, end, remove/unlock students, and
 * export results.
 *
 * The live-scoreboard toggle is hidden (`hideLiveScoreboard`) because it
 * publishes to a board scoreboard widget that doesn't exist behind this modal.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { QuizAssignment, QuizConfig, QuizData } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useQuiz } from '@/hooks/useQuiz';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import { useQuizSessionTeacher } from '@/hooks/useQuizSession';
import { logError } from '@/utils/logError';
import { Modal } from '@/components/common/Modal';
import { QuizLiveMonitor } from '@/components/widgets/QuizWidget/components/QuizLiveMonitor';
import { QuizResults } from '@/components/widgets/QuizWidget/components/QuizResults';

interface PlcAssignmentSessionModalProps {
  /** Assignment UUID — also the live quiz-session doc id. */
  assignmentId: string;
  view: 'monitor' | 'results';
  onClose: () => void;
}

/**
 * Build the synthetic QuizConfig the monitor/results components read. There's
 * no widget on the board to source this from, so it's derived from the
 * assignment doc and held in local ephemeral state (the only writer,
 * `onUpdateConfig`, is the hidden live-scoreboard toggle).
 */
const buildConfig = (
  assignment: QuizAssignment,
  view: 'monitor' | 'results'
): QuizConfig => ({
  view,
  selectedQuizId: assignment.quizId,
  selectedQuizTitle: assignment.quizTitle,
  activeAssignmentId: assignment.id,
  activeLiveSessionCode: assignment.code,
  resultsSessionId: null,
  plcMode: !!assignment.plc,
  plcSheetUrl: assignment.plc?.sheetUrl ?? '',
  teacherName: assignment.teacherName ?? '',
  periodName: assignment.periodName ?? '',
  periodNames: assignment.periodNames ?? [],
});

export const PlcAssignmentSessionModal: React.FC<
  PlcAssignmentSessionModalProps
> = ({ assignmentId, view, onClose }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addToast, rosters } = useDashboard();
  const { loadQuizData } = useQuiz(user?.uid);
  const {
    assignments,
    loading: assignmentsLoading,
    pauseAssignment,
    resumeAssignment,
    deactivateAssignment,
    updateAssignmentSettings,
    setAssignmentExportUrl,
    setAssignmentExportedResponseIds,
  } = useQuizAssignments(user?.uid);
  const {
    session,
    responses,
    advanceQuestion,
    endQuizSession,
    removeStudent,
    unlockStudentAttempt,
    unlockResultsForStudent,
    revealAnswer,
    hideAnswer,
  } = useQuizSessionTeacher(assignmentId);

  const assignment = useMemo(
    () => assignments.find((a) => a.id === assignmentId) ?? null,
    [assignments, assignmentId]
  );

  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Ephemeral display config — derived from the assignment, with local
  // overrides layered on top. The only writer is the monitor's
  // onUpdateConfig; nothing is persisted (there's no widget behind the modal).
  const [configOverrides, setConfigOverrides] = useState<Partial<QuizConfig>>(
    {}
  );
  const config = useMemo<QuizConfig | null>(
    () =>
      assignment
        ? { ...buildConfig(assignment, view), ...configOverrides }
        : null,
    [assignment, view, configOverrides]
  );

  // Hydrate the answer key from Drive once the assignment doc is known.
  const driveFileId = assignment?.quizDriveFileId;
  useEffect(() => {
    if (!driveFileId) return;
    let cancelled = false;
    void loadQuizData(driveFileId)
      .then((data) => {
        if (cancelled) return;
        setQuizData(data);
        setLoadError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        logError('PlcAssignmentSessionModal.loadQuiz', err, { assignmentId });
        setLoadError(
          t('plcDashboard.assignmentSession.loadFailed', {
            defaultValue: 'Could not load this quiz from Google Drive.',
          })
        );
      });
    return () => {
      cancelled = true;
    };
  }, [driveFileId, loadQuizData, assignmentId, t]);

  const handleUpdateConfig = useCallback((updates: Partial<QuizConfig>) => {
    setConfigOverrides((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleEnd = useCallback(async () => {
    // "End" = make inactive (kills the student URL, preserves responses).
    // Confirmation happens inside QuizLiveMonitor.
    if (assignment) {
      await deactivateAssignment(assignment.id);
    } else {
      await endQuizSession();
    }
    onClose();
  }, [assignment, deactivateAssignment, endQuizSession, onClose]);

  const handlePause = useCallback(async () => {
    if (!assignment) return;
    await pauseAssignment(assignment.id);
    addToast(
      t('plcDashboard.assignmentSession.paused', {
        defaultValue: 'Assignment paused.',
      }),
      'success'
    );
  }, [assignment, pauseAssignment, addToast, t]);

  const handleResume = useCallback(async () => {
    if (!assignment) return;
    await resumeAssignment(assignment.id);
    addToast(
      t('plcDashboard.assignmentSession.resumed', {
        defaultValue: 'Assignment resumed.',
      }),
      'success'
    );
  }, [assignment, resumeAssignment, addToast, t]);

  const notFound = !assignmentsLoading && !assignment;
  const isLoading = !notFound && (!assignment || !config || !quizData);

  return (
    <Modal
      isOpen
      onClose={onClose}
      variant="bare"
      zIndex="z-modal-nested"
      maxWidth="max-w-6xl"
      ariaLabel={
        view === 'monitor'
          ? t('plcDashboard.assignmentSession.monitorAria', {
              defaultValue: 'Live monitor',
            })
          : t('plcDashboard.assignmentSession.resultsAria', {
              defaultValue: 'Assignment results',
            })
      }
    >
      <div className="w-full h-[88vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* The monitor/results scale with container-query units, so the body
            must establish a `size` container the way DraggableWindow does. */}
        <div className="flex-1 min-h-0" style={{ containerType: 'size' }}>
          {notFound && (
            <div className="h-full w-full flex flex-col items-center justify-center text-center gap-3 px-6 text-slate-600">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
              <p className="font-bold text-brand-blue-dark">
                {t('plcDashboard.assignmentSession.notFoundTitle', {
                  defaultValue: 'Assignment unavailable',
                })}
              </p>
              <p className="text-sm text-slate-500 max-w-md">
                {t('plcDashboard.assignmentSession.notFoundBody', {
                  defaultValue:
                    'This assignment is no longer in your archive — it may have been deleted.',
                })}
              </p>
            </div>
          )}

          {loadError && !notFound && (
            <div className="h-full w-full flex flex-col items-center justify-center text-center gap-3 px-6 text-slate-600">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
              <p className="font-bold text-brand-blue-dark">{loadError}</p>
            </div>
          )}

          {!notFound && !loadError && isLoading && (
            <div className="h-full w-full flex flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-sm">
                {t('plcDashboard.assignmentSession.loading', {
                  defaultValue: 'Loading…',
                })}
              </span>
            </div>
          )}

          {!notFound &&
            !loadError &&
            !isLoading &&
            assignment &&
            config &&
            quizData &&
            (view === 'monitor' ? (
              session ? (
                <QuizLiveMonitor
                  session={session}
                  responses={responses}
                  quizData={quizData}
                  config={config}
                  rosters={rosters}
                  hideLiveScoreboard
                  onAdvance={async () => {
                    await advanceQuestion();
                  }}
                  onEnd={handleEnd}
                  onPause={handlePause}
                  onResume={handleResume}
                  onUpdateConfig={handleUpdateConfig}
                  onRemoveStudent={removeStudent}
                  onUnlockStudent={unlockStudentAttempt}
                  onUnlockResultsForStudent={unlockResultsForStudent}
                  onRevealAnswer={revealAnswer}
                  onHideAnswer={hideAnswer}
                  onBack={onClose}
                />
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center gap-3 text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span className="text-sm">
                    {t('plcDashboard.assignmentSession.resuming', {
                      defaultValue: 'Resuming session…',
                    })}
                  </span>
                </div>
              )
            ) : (
              <QuizResults
                quiz={quizData}
                responses={responses}
                config={config}
                session={session}
                tabWarningsEnabled={session?.tabWarningsEnabled ?? true}
                onBack={onClose}
                onDeleteResponse={removeStudent}
                onUnlockResultsForStudent={unlockResultsForStudent}
                initialExportUrl={assignment.exportUrl ?? null}
                plcSheetUrl={assignment.plc?.sheetUrl ?? null}
                plcId={assignment.plc?.id ?? null}
                syncGroupId={assignment.sync?.groupId ?? null}
                initialExportedResponseIds={
                  assignment.exportedResponseIds ?? null
                }
                onExportUrlSaved={(url) =>
                  setAssignmentExportUrl(assignment.id, url)
                }
                onExportedResponseIdsSaved={(ids) =>
                  setAssignmentExportedResponseIds(assignment.id, ids)
                }
                onPlcSheetUrlReplaced={async (newUrl) => {
                  if (assignment.plc) {
                    try {
                      await updateAssignmentSettings(assignment.id, {
                        plc: { ...assignment.plc, sheetUrl: newUrl },
                      });
                    } catch (err) {
                      logError(
                        'PlcAssignmentSessionModal.plcSheetUrlReplaced',
                        err,
                        { assignmentId }
                      );
                    }
                  }
                }}
              />
            ))}
        </div>
      </div>
    </Modal>
  );
};
