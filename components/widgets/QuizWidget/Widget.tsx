import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  WidgetData,
  QuizConfig,
  QuizMetadata,
  QuizData,
  ScoreboardTeam,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useQuiz } from '@/hooks/useQuiz';
import {
  useQuizSessionTeacher,
  type QuizSessionOptions,
} from '@/hooks/useQuizSession';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import { useFolders } from '@/hooks/useFolders';
import { QuizManager, PlcOptions } from './components/QuizManager';
import { ImportWizard } from '@/components/common/library/importer';
import { createQuizImportAdapter } from './adapters/quizImportAdapter';
import { QuizEditorModal } from './components/QuizEditorModal';
import { QuizPreview } from './components/QuizPreview';
import { QuizResults } from './components/QuizResults';
import { QuizAssignmentSettingsModal } from './components/QuizAssignmentSettingsModal';
import type { QuizAssignment } from '@/types';
import {
  buildPinToNameMap,
  buildScoreboardTeams,
  getEarnedPoints,
  isGamificationActive,
} from './utils/quizScoreboard';
import { QuizLiveMonitor } from './components/QuizLiveMonitor';
import { Loader2, AlertTriangle, LogIn } from 'lucide-react';
import { SCOREBOARD_COLORS } from '@/config/scoreboard';
import { deriveSessionTargetsFromRosters } from '@/utils/resolveAssignmentTargets';
import { usePlcs } from '@/hooks/usePlcs';
import { QuizDriveService } from '@/utils/quizDriveService';
import { getPlcTeammateEmails } from '@/utils/plc';

export const QuizWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget, addWidget, addToast, rosters, activeDashboard } =
    useDashboard();
  const { user, googleAccessToken } = useAuth();
  const { showConfirm } = useDialog();
  const config = widget.config as QuizConfig;

  const {
    quizzes,
    loading: quizzesLoading,
    error: quizzesError,
    saveQuiz,
    loadQuizData,
    deleteQuiz,
    importFromSheet,
    importFromCSV,
    createQuizTemplate,
    shareQuiz,
    isDriveConnected,
  } = useQuiz(user?.uid);

  const {
    session: liveSession,
    responses,
    advanceQuestion,
    endQuizSession,
    removeStudent,
    revealAnswer,
    hideAnswer,
  } = useQuizSessionTeacher(config.activeAssignmentId);

  // Assignment archive — per-teacher list of past/current assignments.
  const {
    assignments,
    loading: assignmentsLoading,
    error: assignmentsError,
    createAssignment,
    pauseAssignment,
    resumeAssignment,
    deactivateAssignment,
    reopenAssignment,
    deleteAssignment,
    updateAssignmentSettings,
    setAssignmentExportUrl,
    shareAssignment,
  } = useQuizAssignments(user?.uid);

  // Folders are managed by QuizManager separately; this duplicate binding is
  // used only so the editor modal can surface a folder picker and commit
  // moves via `moveItem` without leaving the modal.
  const { folders: quizFolders, moveItem: moveQuizItem } = useFolders(
    user?.uid,
    'quiz'
  );

  // PLC subscription — needed at the widget level (not just inside the
  // Assign modal) so we can auto-create + cache the shared sheet URL on
  // the right `plcs/{id}` doc when Share-with-PLC fires.
  const { plcs, getPlcSharedSheetUrl, setPlcSharedSheetUrl } = usePlcs();

  // Ephemeral modal state for per-assignment settings editing.
  const [editingAssignment, setEditingAssignment] =
    useState<QuizAssignment | null>(null);

  // Local state for views that need loaded data
  const [loadedQuizData, setLoadedQuizData] = useState<QuizData | null>(null);
  const [loadingQuizData, setLoadingQuizData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Bump a token whenever the user navigates INTO the results view so the
  // QuizResults consumer remounts with fresh memos over the current live
  // `responses` — guarantees aggregate stats recompute after a mid-view
  // submission delete even if the upstream snapshot state lagged.
  const [resultsEnterToken, setResultsEnterToken] = useState(0);
  const [prevView, setPrevView] = useState(config.view);
  if (config.view !== prevView) {
    setPrevView(config.view);
    if (config.view === 'results') {
      setResultsEnterToken((n) => n + 1);
    }
  }

  // Editor modal state — ephemeral, not persisted to Firestore.
  const [editingQuiz, setEditingQuiz] = useState<QuizData | null>(null);
  const [editingMeta, setEditingMeta] = useState<QuizMetadata | null>(null);

  const setView = useCallback(
    (view: QuizConfig['view']) => {
      updateWidget(widget.id, { config: { ...config, view } as QuizConfig });
    },
    [updateWidget, widget.id, config]
  );

  const loadQuiz = useCallback(
    async (meta: QuizMetadata): Promise<QuizData | null> => {
      setLoadingQuizData(true);
      setDataError(null);
      try {
        const data = await loadQuizData(meta.driveFileId);
        setLoadedQuizData(data);
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load quiz';
        setDataError(msg);
        addToast(msg, 'error');
        return null;
      } finally {
        setLoadingQuizData(false);
      }
    },
    [loadQuizData, addToast]
  );

  // Auto-load quiz data if we are in monitor view or have an active session, but data is missing
  // This allows for seamless resumption after page reload.
  React.useEffect(() => {
    if (
      !loadedQuizData &&
      !loadingQuizData &&
      quizzes.length > 0 &&
      liveSession &&
      liveSession.status !== 'ended'
    ) {
      // Prioritize the quiz from the live session document itself
      const meta = quizzes.find((q) => q.id === liveSession.quizId);
      if (meta) {
        void loadQuiz(meta);
      } else if (quizzesLoading === false) {
        // If the session exists but the quiz is not in our library (deleted),
        // we should auto-end the session to avoid being stuck.
        console.warn('Active session found for deleted quiz. Auto-ending.');
        void endQuizSession();
        setView('manager');
      }
    }
  }, [
    liveSession,
    loadedQuizData,
    loadingQuizData,
    quizzes,
    loadQuiz,
    quizzesLoading,
    endQuizSession,
    setView,
  ]);

  // ─── Live Scoreboard Sync ──────────────────────────────────────────────────
  const liveScoreboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const prevResponsesJsonRef = useRef<string>('');
  const creatingScoreboardRef = useRef(false);

  // Use refs for values the effect reads but should not re-trigger on:
  // - configRef: avoids re-triggering when unrelated config fields change
  // - widgetsRef: avoids re-triggering when the scoreboard widget we just wrote is updated
  const configRef = useRef(config);
  configRef.current = config;
  const widgetsRef = useRef(activeDashboard?.widgets);
  widgetsRef.current = activeDashboard?.widgets;

  // ─── Callback for child components to update quiz config ────────────────────
  const handleUpdateQuizConfig = useCallback(
    (updates: Partial<QuizConfig>) => {
      updateWidget(widget.id, {
        config: { ...configRef.current, ...updates } as QuizConfig,
      });
    },
    [updateWidget, widget.id]
  );

  useEffect(() => {
    if (!config.liveScoreboardEnabled || !loadedQuizData || !liveSession) {
      // Reset fingerprint when disabled so re-enabling triggers an immediate sync
      prevResponsesJsonRef.current = '';
      return;
    }

    // Compute a fingerprint including answer content to detect changes.
    // First-run detection uses the empty-prev check below.
    const fingerprint = responses
      .map(
        (r) =>
          `${r.pin}:${r.status}:${r.answers.map((a) => `${a.questionId}=${a.answer}@${a.answeredAt ?? 0}+${a.speedBonus ?? 0}`).join(',')}`
      )
      .sort()
      .join('|');

    // Allow first-run when the scoreboard was just enabled (prev is empty)
    const isFirstRun = prevResponsesJsonRef.current === '';
    if (!isFirstRun && fingerprint === prevResponsesJsonRef.current) return;
    prevResponsesJsonRef.current = fingerprint;

    // Debounce the scoreboard update
    if (liveScoreboardTimerRef.current) {
      clearTimeout(liveScoreboardTimerRef.current);
    }

    liveScoreboardTimerRef.current = setTimeout(
      () => {
        const currentConfig = configRef.current;
        const scoringMode =
          currentConfig.liveScoreboardScoring ?? 'per-question';
        const displayMode = currentConfig.liveScoreboardMode ?? 'pin';
        const pinToName = buildPinToNameMap(
          rosters,
          currentConfig.periodNames ??
            (currentConfig.periodName ? [currentConfig.periodName] : [])
        );

        // Include ALL responses — joined students appear at 0 score, in-progress
        // get a running score, completed get their final score.
        const allResponses = responses;

        let newTeams: ScoreboardTeam[];
        if (scoringMode === 'per-question') {
          // Per-question mode: running accuracy — percentage of answered questions
          // scored correctly (not total quiz points). This gives meaningful live
          // feedback before quiz completion, unlike the final score which divides
          // by total points and would show low percentages for students mid-quiz.
          const questions = loadedQuizData.questions;
          const gamified = isGamificationActive(liveSession);
          newTeams = allResponses
            .map((r) => {
              let maxAnsweredPoints = 0;
              for (const a of r.answers) {
                const q = questions.find((qn) => qn.id === a.questionId);
                if (q) maxAnsweredPoints += q.points ?? 1;
              }
              const earned = getEarnedPoints(r, questions, liveSession);
              // When gamification is active, show raw points to avoid >100% values
              const score = gamified
                ? earned
                : maxAnsweredPoints > 0
                  ? Math.round((earned / maxAnsweredPoints) * 100)
                  : 0;
              return { response: r, score };
            })
            .sort((a, b) => b.score - a.score)
            .map(({ response, score }) => ({
              id: `pin-${response.pin}`,
              name:
                displayMode === 'name'
                  ? (pinToName[response.pin] ?? `PIN ${response.pin}`)
                  : `PIN ${response.pin}`,
              score,
              color:
                SCOREBOARD_COLORS[
                  parseInt(response.pin, 10) % SCOREBOARD_COLORS.length
                ],
            }));
        } else {
          // Completion mode: uses total quiz points as denominator, so
          // in-progress students show partial scores proportional to
          // what they've answered out of the entire quiz.
          newTeams = buildScoreboardTeams(
            allResponses,
            loadedQuizData.questions,
            displayMode,
            pinToName,
            liveSession
          );
        }

        // Find or create scoreboard widget
        const widgets = widgetsRef.current;
        const existingId = currentConfig.liveScoreboardWidgetId;
        const existingScoreboard = existingId
          ? widgets?.find((w) => w.id === existingId)
          : widgets?.find((w) => w.type === 'scoreboard');

        if (existingScoreboard) {
          updateWidget(existingScoreboard.id, {
            config: {
              ...existingScoreboard.config,
              teams: newTeams,
              liveQuizWidgetId: widget.id,
            },
          });
          if (currentConfig.liveScoreboardWidgetId !== existingScoreboard.id) {
            updateWidget(widget.id, {
              config: {
                ...currentConfig,
                liveScoreboardWidgetId: existingScoreboard.id,
              } as QuizConfig,
            });
          }
          creatingScoreboardRef.current = false;
        } else if (!creatingScoreboardRef.current) {
          // Guard against creating duplicate scoreboards while addWidget is async
          creatingScoreboardRef.current = true;
          addWidget('scoreboard', {
            config: {
              teams: newTeams,
              layout: 'rows',
              liveQuizWidgetId: widget.id,
            },
          });
          // Reset the lock after a tick so subsequent updates can find and update
          // the newly created scoreboard.
          requestAnimationFrame(() => {
            creatingScoreboardRef.current = false;
          });
        }
      },
      isFirstRun ? 500 : 2000
    ); // Shorter delay on first enable

    return () => {
      if (liveScoreboardTimerRef.current) {
        clearTimeout(liveScoreboardTimerRef.current);
      }
    };
    // Only re-trigger on actual data changes (responses) and primitive config flags.
    // config object and activeDashboard.widgets are read via refs to avoid
    // infinite re-trigger cycles (this effect writes to both).
  }, [
    config.liveScoreboardEnabled,
    config.liveScoreboardScoring,
    config.liveScoreboardMode,
    config.liveScoreboardWidgetId,
    config.periodNames,
    config.periodName,
    responses,
    loadedQuizData,
    liveSession,
    rosters,
    updateWidget,
    addWidget,
    widget.id,
  ]);

  // Auto-disable live scoreboard when session ends, and clear the LIVE badge
  // when paused. A paused session can be resumed, so we keep the teacher's
  // liveScoreboardEnabled preference — we just drop the "LIVE" badge on the
  // scoreboard widget while the quiz isn't accepting answers.
  useEffect(() => {
    if (!config.liveScoreboardEnabled || !liveSession) return;
    const isEnded = liveSession.status === 'ended';
    const isPaused = liveSession.status === 'paused';
    if (!isEnded && !isPaused) return;

    const scoreboardId = configRef.current.liveScoreboardWidgetId;
    if (scoreboardId) {
      const widgets = widgetsRef.current;
      const scoreboard = widgets?.find((w) => w.id === scoreboardId);
      if (scoreboard) {
        updateWidget(scoreboardId, {
          config: { ...scoreboard.config, liveQuizWidgetId: undefined },
        });
      }
    }
    if (isEnded) {
      handleUpdateQuizConfig({ liveScoreboardEnabled: false });
    }
  }, [
    liveSession,
    config.liveScoreboardEnabled,
    handleUpdateQuizConfig,
    updateWidget,
  ]);

  // ─── Auto-reveal answers for student feedback ─────────────────────────────
  // When showResultToStudent is enabled, auto-reveal answers for questions
  // that have already been advanced past. This ensures students see feedback
  // regardless of the showCorrectOnBoard setting.
  // Also auto-reveals the CURRENT question when entering review phase.
  useEffect(() => {
    if (!liveSession || !loadedQuizData) return;
    if (liveSession.status !== 'active' && liveSession.status !== 'ended')
      return;

    const shouldReveal =
      (liveSession.showResultToStudent ?? false) ||
      liveSession.questionPhase === 'reviewing';
    if (!shouldReveal) return;

    const questions = loadedQuizData.questions;
    // Reveal past questions + current question during review phase or when quiz ended
    const upTo =
      liveSession.status === 'ended'
        ? questions.length
        : liveSession.questionPhase === 'reviewing'
          ? liveSession.currentQuestionIndex + 1
          : liveSession.currentQuestionIndex;
    for (let i = 0; i < upTo && i < questions.length; i++) {
      const q = questions[i];
      if (!liveSession.revealedAnswers?.[q.id]) {
        void revealAnswer(q.id, q.correctAnswer);
      }
    }
  }, [
    liveSession?.currentQuestionIndex,
    liveSession?.status,
    liveSession?.showResultToStudent,
    liveSession?.questionPhase,
    liveSession?.revealedAnswers,
    loadedQuizData,
    revealAnswer,
    liveSession,
  ]);

  // ─── Guard: not signed in ──────────────────────────────────────────────────
  if (!user) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-slate-400 text-center"
        style={{ gap: 'min(12px, 3cqmin)', padding: 'min(24px, 6cqmin)' }}
      >
        <LogIn
          className="opacity-40"
          style={{ width: 'min(32px, 8cqmin)', height: 'min(32px, 8cqmin)' }}
        />
        <p
          className="font-medium text-slate-300"
          style={{ fontSize: 'min(13px, 4.5cqmin)' }}
        >
          Sign in required
        </p>
        <p
          className="text-slate-500"
          style={{ fontSize: 'min(11px, 3.5cqmin)' }}
        >
          Sign in with Google to use the Quiz widget.
        </p>
      </div>
    );
  }

  // ─── Guard: no Drive access ────────────────────────────────────────────────
  if (!isDriveConnected && !googleAccessToken) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-slate-400 text-center"
        style={{ gap: 'min(12px, 3cqmin)', padding: 'min(24px, 6cqmin)' }}
      >
        <AlertTriangle
          className="opacity-40"
          style={{ width: 'min(32px, 8cqmin)', height: 'min(32px, 8cqmin)' }}
        />
        <p
          className="font-medium text-slate-300"
          style={{ fontSize: 'min(13px, 4.5cqmin)' }}
        >
          Drive access needed
        </p>
        <p
          className="text-slate-500"
          style={{ fontSize: 'min(11px, 3.5cqmin)' }}
        >
          Sign out and sign in again to grant Google Drive and Sheets access for
          quiz storage.
        </p>
      </div>
    );
  }

  // ─── Loading overlay ───────────────────────────────────────────────────────
  if (loadingQuizData) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-slate-400"
        style={{ gap: 'min(12px, 3cqmin)' }}
      >
        <Loader2
          className="animate-spin"
          style={{ width: 'min(32px, 8cqmin)', height: 'min(32px, 8cqmin)' }}
        />
        <span style={{ fontSize: 'min(13px, 4.5cqmin)' }}>Loading quiz…</span>
      </div>
    );
  }

  // ─── Views ─────────────────────────────────────────────────────────────────

  const view = config.view ?? 'manager';

  if (view === 'import') {
    const adapter = createQuizImportAdapter({
      saveQuiz: async (data) => {
        await saveQuiz(data);
      },
      importFromSheet,
      importFromCSV,
      createQuizTemplate: async () => {
        const url = await createQuizTemplate();
        return url;
      },
    });
    return (
      <ImportWizard
        isOpen
        onClose={() => setView('manager')}
        adapter={adapter}
        onSaved={() => {
          addToast('Quiz saved to Drive!', 'success');
          setView('manager');
        }}
      />
    );
  }

  if (view === 'preview' && loadedQuizData) {
    return (
      <QuizPreview
        quiz={loadedQuizData}
        onBack={() => {
          setLoadedQuizData(null);
          setView('manager');
        }}
      />
    );
  }

  if (view === 'results' && loadedQuizData) {
    // NOTE: responses here come from the teacher's current quiz_sessions/{uid} document.
    // This means results are only available while the session data is in Firestore
    // (immediately after or during a session). Historical sessions are not yet persisted
    // separately; config.resultsSessionId is reserved for future per-session history.
    const activeAssignmentId = config.activeAssignmentId;
    const activeAssignment = activeAssignmentId
      ? assignments.find((a) => a.id === activeAssignmentId)
      : undefined;
    return (
      <QuizResults
        key={`${config.activeAssignmentId ?? 'none'}-${resultsEnterToken}`}
        quiz={loadedQuizData}
        responses={responses}
        config={config}
        onBack={() => {
          setLoadedQuizData(null);
          setView('manager');
        }}
        tabWarningsEnabled={liveSession?.tabWarningsEnabled ?? true}
        session={liveSession}
        onDeleteResponse={removeStudent}
        onPlcSheetUrlReplaced={async (newUrl) => {
          // After QuizResults regenerates a stale PLC sheet (404
          // recovery), replace the URL on this widget's config so future
          // exports don't re-trigger the regenerate dance, AND on the
          // active assignment doc so other consumers (assignment list,
          // settings modal, copy-to-clipboard menu) see the live URL.
          updateWidget(widget.id, {
            config: { ...config, plcSheetUrl: newUrl } as QuizConfig,
          });
          if (config.activeAssignmentId) {
            try {
              await updateAssignmentSettings(config.activeAssignmentId, {
                plcSheetUrl: newUrl,
              });
            } catch (err) {
              console.error(
                '[QuizWidget] Failed to persist regenerated PLC URL on assignment:',
                err
              );
            }
          }
        }}
        initialExportUrl={activeAssignment?.exportUrl ?? null}
        onExportUrlSaved={
          activeAssignmentId
            ? (url) => setAssignmentExportUrl(activeAssignmentId, url)
            : undefined
        }
      />
    );
  }

  if (view === 'monitor' && liveSession) {
    if (!loadedQuizData) {
      return (
        <div
          className="flex flex-col items-center justify-center h-full text-slate-400"
          style={{ gap: 'min(12px, 3cqmin)' }}
        >
          <Loader2
            className="animate-spin"
            style={{ width: 'min(32px, 8cqmin)', height: 'min(32px, 8cqmin)' }}
          />
          <span style={{ fontSize: 'min(13px, 4.5cqmin)' }}>
            Resuming session…
          </span>
        </div>
      );
    }
    return (
      <QuizLiveMonitor
        session={liveSession}
        responses={responses}
        quizData={loadedQuizData}
        onAdvance={async () => {
          await advanceQuestion();
        }}
        onEnd={async () => {
          // "End" now means Make Inactive at the assignment level so the URL
          // dies but responses are preserved. Confirmation happens inside
          // QuizLiveMonitor.
          const assignmentId = config.activeAssignmentId;
          if (assignmentId) {
            await deactivateAssignment(assignmentId);
          } else {
            await endQuizSession();
          }
          updateWidget(widget.id, {
            config: {
              ...config,
              view: 'manager',
              managerTab: 'archive',
            } as QuizConfig,
          });
        }}
        onPause={
          config.activeAssignmentId
            ? async () => {
                const id = config.activeAssignmentId;
                if (!id) return;
                await pauseAssignment(id);
                addToast('Assignment paused.', 'success');
              }
            : undefined
        }
        onResume={
          config.activeAssignmentId
            ? async () => {
                const id = config.activeAssignmentId;
                if (!id) return;
                await resumeAssignment(id);
                addToast('Assignment resumed.', 'success');
              }
            : undefined
        }
        config={config}
        rosters={rosters}
        onUpdateConfig={handleUpdateQuizConfig}
        onRemoveStudent={removeStudent}
        onRevealAnswer={revealAnswer}
        onHideAnswer={hideAnswer}
        onBack={() => {
          // Navigate back to the In Progress tab without ending the quiz.
          // The assignment stays active/paused — students are unaffected.
          updateWidget(widget.id, {
            config: {
              ...config,
              view: 'manager',
              managerTab: 'active',
            } as QuizConfig,
          });
        }}
      />
    );
  }

  // Default: manager view (with editor modal rendered as sibling)
  return (
    <>
      <QuizManager
        userId={user?.uid}
        quizzes={quizzes}
        loading={quizzesLoading}
        error={quizzesError ?? dataError}
        onNew={() => {
          const now = Date.now();
          setEditingQuiz({
            id: crypto.randomUUID(),
            title: '',
            questions: [],
            createdAt: now,
            updatedAt: now,
          });
          setEditingMeta(null);
        }}
        onImport={() => setView('import')}
        onEdit={async (meta) => {
          const data = await loadQuiz(meta);
          if (data) {
            setEditingQuiz(data);
            setEditingMeta(meta);
          }
        }}
        onPreview={async (meta) => {
          const data = await loadQuiz(meta);
          if (data) setView('preview');
        }}
        rosters={rosters}
        config={config}
        onAssign={async (
          meta,
          mode,
          plcOptions: PlcOptions,
          sessionOptions: QuizSessionOptions,
          rosterIds: string[],
          attemptLimit: number | null
        ) => {
          const data = await loadQuiz(meta);
          if (!data) return;
          // Derive session targets from selected rosters — `classIds` feeds
          // the student SSO gate via Firestore rules; `rosterIds` is mirrored
          // onto both assignment and session for reverse lookup.
          const selectedRosters = rosters.filter((r) =>
            rosterIds.includes(r.id)
          );
          const derived = deriveSessionTargetsFromRosters(selectedRosters);

          // PLC auto-create: when the teacher enabled Share-with-PLC AND
          // picked a PLC AND didn't paste a manual URL, resolve the shared
          // sheet URL before writing the assignment. Read the PLC's
          // cached sharedSheetUrl first (strong get, not the snapshot); if
          // absent, create a new Sheet under the teacher's Drive and
          // share it with every teammate, then cache the URL on the PLC
          // doc so the next assignment in this PLC just reuses it.
          //
          // Failures here don't block the assignment — we fall through
          // to the manual-paste behavior with an empty URL and toast the
          // teacher so they can recover.
          let resolvedPlcSheetUrl = plcOptions.plcSheetUrl;
          if (
            plcOptions.plcMode &&
            plcOptions.plcId &&
            !resolvedPlcSheetUrl &&
            googleAccessToken
          ) {
            const plc = plcs.find((p) => p.id === plcOptions.plcId);
            try {
              // Strong read beats the snapshot for the "already created?"
              // check — two teachers kicking off their first PLC
              // assignment simultaneously is rare but worth guarding.
              const cached = await getPlcSharedSheetUrl(plcOptions.plcId);
              if (cached) {
                resolvedPlcSheetUrl = cached;
                // Even though invite-accept already runs reconciliation,
                // it can fail silently (no Drive token at accept time,
                // accepter wasn't the sheet owner). Re-running on every
                // PLC assignment costs one Drive list call per assign
                // and lets the actual sheet owner top up writer access
                // for teammates joined since the sheet was created.
                // Best-effort — failures here don't block the assignment.
                if (plc && user) {
                  const driveService = new QuizDriveService(googleAccessToken);
                  void driveService
                    .reconcilePlcSheetPermissions({
                      sheetUrl: cached,
                      memberEmailsToShareWith: getPlcTeammateEmails(
                        plc,
                        user.uid
                      ),
                    })
                    .catch((err: unknown) => {
                      console.error(
                        '[QuizWidget] PLC sheet permission reconcile failed:',
                        err
                      );
                    });
                }
              } else if (plc && user) {
                const driveService = new QuizDriveService(googleAccessToken);
                const created = await driveService.createPlcSheetAndShare({
                  plcName: plc.name,
                  memberEmailsToShareWith: getPlcTeammateEmails(plc, user.uid),
                });
                // Transactional set-if-empty — if a racing teammate beat
                // us to the punch, switch to their canonical URL and
                // accept that our just-created sheet is orphaned in our
                // Drive (rare race).
                resolvedPlcSheetUrl = await setPlcSharedSheetUrl(
                  plcOptions.plcId,
                  created.url
                );
              }
            } catch (err) {
              console.error('[QuizWidget] PLC sheet auto-create failed:', err);
              addToast(
                err instanceof Error && err.message
                  ? err.message
                  : 'Could not create the shared PLC sheet — you can still paste a URL manually.',
                'error'
              );
            }
          }

          try {
            const { id: assignmentId, code } = await createAssignment(
              {
                id: meta.id,
                title: meta.title,
                driveFileId: meta.driveFileId,
                questions: data.questions,
              },
              {
                sessionMode: mode,
                sessionOptions,
                attemptLimit,
                plcMode: plcOptions.plcMode,
                teacherName: plcOptions.teacherName,
                periodName:
                  plcOptions.periodNames?.[0] ?? plcOptions.periodName,
                periodNames: plcOptions.periodNames,
                plcSheetUrl: resolvedPlcSheetUrl,
              },
              'paused',
              derived.classIds,
              derived.rosterIds
            );
            // Persist the teacher's last-used rosters per quiz so
            // re-launching the same quiz pre-selects the same classes.
            const prevMap = config.lastRosterIdsByQuizId ?? {};
            const nextMap: Record<string, string[]> = { ...prevMap };
            if (rosterIds.length > 0) {
              nextMap[meta.id] = rosterIds;
            } else {
              delete nextMap[meta.id];
            }
            updateWidget(widget.id, {
              config: {
                ...config,
                view: 'manager',
                managerTab: 'active',
                selectedQuizId: meta.id,
                selectedQuizTitle: meta.title,
                activeAssignmentId: assignmentId,
                plcMode: plcOptions.plcMode,
                teacherName: plcOptions.teacherName ?? '',
                periodName:
                  plcOptions.periodNames?.[0] ?? plcOptions.periodName ?? '',
                periodNames: plcOptions.periodNames ?? [],
                plcSheetUrl: resolvedPlcSheetUrl ?? '',
                lastRosterIdsByQuizId: nextMap,
              } as QuizConfig,
            });
            const url = `${window.location.origin}/quiz?code=${code}`;
            if (typeof navigator !== 'undefined' && navigator.clipboard) {
              void navigator.clipboard
                .writeText(url)
                .then(() =>
                  addToast(
                    'Student link copied — press Play when you\u2019re ready to start.',
                    'success'
                  )
                )
                .catch(() =>
                  addToast(
                    'Assignment created (paused), but link could not be copied.',
                    'info'
                  )
                );
            } else {
              addToast(
                'Assignment created (paused), but link could not be copied.',
                'info'
              );
            }
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Failed to start session',
              'error'
            );
          }
        }}
        onResults={async (meta) => {
          const data = await loadQuiz(meta);
          if (data) setView('results');
        }}
        onShare={async (meta) => {
          let url: string;
          try {
            url = await shareQuiz(meta);
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Share failed',
              'error'
            );
            return;
          }
          try {
            await navigator.clipboard.writeText(url);
            addToast('Share link copied to clipboard!', 'success');
          } catch {
            addToast(`Share link: ${url}`, 'info');
          }
        }}
        onDelete={async (meta) => {
          // Block deletion when active/paused assignments reference the quiz,
          // since the monitor + results views need the answer key from the
          // library record. Archived (inactive) assignments trigger only a
          // warning — the teacher has already chosen to end those sessions.
          const related = assignments.filter((a) => a.quizId === meta.id);
          const live = related.filter((a) => a.status !== 'inactive');
          if (live.length > 0) {
            addToast(
              `Cannot delete: ${live.length} active or paused assignment(s) still reference this quiz. Deactivate them first.`,
              'error'
            );
            return;
          }
          if (related.length > 0) {
            const ok = await showConfirm(
              `This quiz has ${related.length} archived assignment(s). ` +
                `Deleting the quiz will prevent viewing their monitor and results. ` +
                `Continue anyway?`,
              {
                title: 'Delete Quiz',
                variant: 'warning',
                confirmLabel: 'Delete Anyway',
              }
            );
            if (!ok) return;
          }
          try {
            await deleteQuiz(meta.id, meta.driveFileId);
            addToast('Quiz deleted.', 'success');
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Delete failed',
              'error'
            );
          }
        }}
        onBulkDelete={async (metas): Promise<boolean> => {
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
              console.error(
                '[QuizWidget] bulk delete failed for',
                id,
                result.reason
              );
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
        }}
        // ─── Archive tab ─────────────────────────────────────────────────────
        managerTab={config.managerTab ?? 'library'}
        onTabChange={(tab) => handleUpdateQuizConfig({ managerTab: tab })}
        assignments={assignments}
        assignmentsLoading={assignmentsLoading}
        onArchiveCopyUrl={(a) => {
          const url = `${window.location.origin}/quiz?code=${a.code}`;
          if (typeof navigator !== 'undefined' && navigator.clipboard) {
            void navigator.clipboard
              .writeText(url)
              .then(() => addToast('Student link copied!', 'success'))
              .catch(() => addToast(`Student link: ${url}`, 'info'));
          } else {
            addToast(`Student link: ${url}`, 'info');
          }
        }}
        onArchiveMonitor={async (a) => {
          // Look up the library quiz metadata so the monitor can load the full
          // answer key from Drive. If the quiz was deleted from the library,
          // we still have the session doc but no way to show the answer key.
          const meta = quizzes.find((q) => q.id === a.quizId);
          if (!meta) {
            addToast(
              'Quiz is no longer in your library — cannot open monitor.',
              'error'
            );
            return;
          }
          const data = await loadQuiz(meta);
          if (!data) return;
          updateWidget(widget.id, {
            config: {
              ...config,
              view: 'monitor',
              selectedQuizId: a.quizId,
              selectedQuizTitle: a.quizTitle,
              activeAssignmentId: a.id,
              activeLiveSessionCode: a.code,
              periodName: a.periodName ?? '',
              periodNames: a.periodNames ?? [],
              teacherName: a.teacherName ?? '',
              plcMode: a.plcMode,
              plcSheetUrl: a.plcSheetUrl ?? '',
            } as QuizConfig,
          });
        }}
        onArchiveStart={async (a) => {
          // Block start if no class periods are selected.
          const periods = a.periodNames ?? (a.periodName ? [a.periodName] : []);
          if (periods.length === 0) {
            addToast(
              'Select at least one class period before starting. Open Settings to add periods.',
              'error'
            );
            setEditingAssignment(a);
            return;
          }
          // Resume the paused assignment, then open the monitor view.
          const meta = quizzes.find((q) => q.id === a.quizId);
          if (!meta) {
            addToast(
              'Quiz is no longer in your library — cannot start.',
              'error'
            );
            return;
          }
          const data = await loadQuiz(meta);
          if (!data) return;
          try {
            await resumeAssignment(a.id);
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Failed to resume',
              'error'
            );
            return;
          }
          updateWidget(widget.id, {
            config: {
              ...config,
              view: 'monitor',
              selectedQuizId: a.quizId,
              selectedQuizTitle: a.quizTitle,
              activeAssignmentId: a.id,
              activeLiveSessionCode: a.code,
              periodName: a.periodName ?? '',
              periodNames: a.periodNames ?? [],
              teacherName: a.teacherName ?? '',
              plcMode: a.plcMode,
              plcSheetUrl: a.plcSheetUrl ?? '',
            } as QuizConfig,
          });
        }}
        onArchiveResults={async (a) => {
          const meta = quizzes.find((q) => q.id === a.quizId);
          if (!meta) {
            addToast(
              'Quiz is no longer in your library — cannot open results.',
              'error'
            );
            return;
          }
          const data = await loadQuiz(meta);
          if (!data) return;
          updateWidget(widget.id, {
            config: {
              ...config,
              view: 'results',
              selectedQuizId: a.quizId,
              selectedQuizTitle: a.quizTitle,
              activeAssignmentId: a.id,
              periodName: a.periodName ?? '',
              periodNames: a.periodNames ?? [],
              teacherName: a.teacherName ?? '',
            } as QuizConfig,
          });
        }}
        onArchiveEditSettings={(a) => {
          setEditingAssignment(a);
        }}
        onArchiveShare={async (a) => {
          const meta = quizzes.find((q) => q.id === a.quizId);
          if (!meta) {
            addToast(
              'Quiz no longer in library — cannot share assignment.',
              'error'
            );
            return;
          }
          try {
            const data = await loadQuiz(meta);
            if (!data) return;
            const url = await shareAssignment(a.id, data);
            try {
              await navigator.clipboard.writeText(url);
              addToast('Assignment share link copied!', 'success');
            } catch {
              addToast(`Assignment share link: ${url}`, 'info');
            }
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Share failed',
              'error'
            );
          }
        }}
        onArchivePauseResume={async (a) => {
          try {
            if (a.status === 'paused') {
              await resumeAssignment(a.id);
              addToast('Assignment resumed.', 'success');
            } else if (a.status === 'active') {
              await pauseAssignment(a.id);
              addToast('Assignment paused.', 'success');
            }
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Failed to update status',
              'error'
            );
          }
        }}
        onArchiveDeactivate={async (a) => {
          try {
            await deactivateAssignment(a.id);
            addToast('Assignment deactivated. Responses preserved.', 'success');
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Failed to deactivate',
              'error'
            );
          }
        }}
        onArchiveReopen={async (a) => {
          try {
            await reopenAssignment(a.id);
            addToast(
              'Reopened — click Resume to accept submissions.',
              'success'
            );
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Failed to reopen',
              'error'
            );
          }
        }}
        onArchiveDelete={async (a) => {
          try {
            await deleteAssignment(a.id);
            addToast('Assignment deleted.', 'success');
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Failed to delete',
              'error'
            );
          }
        }}
        onLibraryViewModeChange={(mode) => {
          updateWidget(widget.id, {
            config: { ...config, libraryViewMode: mode } as QuizConfig,
          });
        }}
      />
      <QuizEditorModal
        isOpen={!!editingQuiz}
        quiz={editingQuiz}
        folders={editingMeta ? quizFolders : undefined}
        folderId={
          editingMeta
            ? (quizzes.find((q) => q.id === editingMeta.id)?.folderId ?? null)
            : null
        }
        onFolderChange={
          editingMeta
            ? async (folderId) => {
                try {
                  await moveQuizItem(editingMeta.id, folderId);
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
          setEditingQuiz(null);
          setEditingMeta(null);
        }}
        onSave={async (updated) => {
          const isNew = !editingMeta;
          await saveQuiz(updated, editingMeta?.driveFileId);
          setLoadedQuizData(updated);
          addToast(isNew ? 'Quiz created!' : 'Quiz saved!', 'success');
        }}
      />
      {editingAssignment && (
        <QuizAssignmentSettingsModal
          assignment={editingAssignment}
          rosters={rosters}
          onClose={() => setEditingAssignment(null)}
          onSave={async (patch) => {
            try {
              await updateAssignmentSettings(editingAssignment.id, patch);
              addToast('Assignment settings saved.', 'success');
              setEditingAssignment(null);
            } catch (err) {
              addToast(
                err instanceof Error ? err.message : 'Failed to save settings',
                'error'
              );
            }
          }}
        />
      )}
    </>
  );
};
