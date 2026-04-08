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
import { useQuiz } from '@/hooks/useQuiz';
import { useQuizSessionTeacher, gradeAnswer } from '@/hooks/useQuizSession';
import { QuizManager, PlcOptions } from './components/QuizManager';
import { QuizImporter } from './components/QuizImporter';
import { QuizEditor } from './components/QuizEditor';
import { QuizPreview } from './components/QuizPreview';
import { QuizResults } from './components/QuizResults';
import {
  buildPinToNameMap,
  buildScoreboardTeams,
} from './utils/quizScoreboard';
import { QuizLiveMonitor } from './components/QuizLiveMonitor';
import { Loader2, AlertTriangle, LogIn } from 'lucide-react';
import { SCOREBOARD_COLORS } from '@/config/scoreboard';

export const QuizWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget, addWidget, addToast, rosters, activeDashboard } =
    useDashboard();
  const { user, googleAccessToken } = useAuth();
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
    startQuizSession,
    advanceQuestion,
    endQuizSession,
  } = useQuizSessionTeacher(user?.uid);

  // Local state for views that need loaded data
  const [loadedQuizData, setLoadedQuizData] = useState<QuizData | null>(null);
  const [loadingQuizData, setLoadingQuizData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [selectedMeta, setSelectedMeta] = useState<QuizMetadata | null>(null);

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
        setSelectedMeta(meta);
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

  // ─── Callback for child components to update quiz config ────────────────────
  const handleUpdateQuizConfig = useCallback(
    (updates: Partial<QuizConfig>) => {
      updateWidget(widget.id, {
        config: { ...config, ...updates } as QuizConfig,
      });
    },
    [updateWidget, widget.id, config]
  );

  // ─── Live Scoreboard Sync ──────────────────────────────────────────────────
  const liveScoreboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const prevResponsesJsonRef = useRef<string>('');

  useEffect(() => {
    if (!config.liveScoreboardEnabled || !loadedQuizData || !liveSession) {
      return;
    }

    // Compute a lightweight fingerprint to avoid redundant updates
    const fingerprint = responses
      .map((r) => `${r.pin}:${r.status}:${r.answers.length}`)
      .sort()
      .join('|');
    if (fingerprint === prevResponsesJsonRef.current) return;
    prevResponsesJsonRef.current = fingerprint;

    // Debounce the scoreboard update
    if (liveScoreboardTimerRef.current) {
      clearTimeout(liveScoreboardTimerRef.current);
    }

    liveScoreboardTimerRef.current = setTimeout(() => {
      const scoringMode = config.liveScoreboardScoring ?? 'completion';
      const displayMode = config.liveScoreboardMode ?? 'pin';
      const pinToName = buildPinToNameMap(rosters, config.periodName);

      let eligibleResponses;
      if (scoringMode === 'completion') {
        eligibleResponses = responses.filter((r) => r.status === 'completed');
      } else {
        // per-question: include anyone with at least one answer
        eligibleResponses = responses.filter((r) => r.answers.length > 0);
      }

      let newTeams: ScoreboardTeam[];
      if (scoringMode === 'per-question') {
        // For per-question mode, compute running scores inline
        const questions = loadedQuizData.questions;
        newTeams = eligibleResponses
          .map((r) => {
            const answeredQuestions = r.answers.filter((a) =>
              questions.some((q) => q.id === a.questionId)
            );
            const correctCount = answeredQuestions.filter((a) => {
              const q = questions.find((qn) => qn.id === a.questionId);
              return q ? gradeAnswer(q, a.answer) : false;
            }).length;
            const totalAnswered = answeredQuestions.length;
            const score =
              totalAnswered > 0
                ? Math.round((correctCount / totalAnswered) * 100)
                : 0;
            return { response: r, score };
          })
          .sort((a, b) => b.score - a.score)
          .map(({ response, score }, index) => ({
            id: crypto.randomUUID(),
            name:
              displayMode === 'name'
                ? (pinToName[response.pin] ?? `PIN ${response.pin}`)
                : `PIN ${response.pin}`,
            score,
            color: SCOREBOARD_COLORS[index % SCOREBOARD_COLORS.length],
          }));
      } else {
        newTeams = buildScoreboardTeams(
          eligibleResponses,
          loadedQuizData.questions,
          displayMode,
          pinToName
        );
      }

      // Find or create scoreboard widget
      const existingId = config.liveScoreboardWidgetId;
      const existingScoreboard = existingId
        ? activeDashboard?.widgets.find((w) => w.id === existingId)
        : activeDashboard?.widgets.find((w) => w.type === 'scoreboard');

      if (existingScoreboard) {
        updateWidget(existingScoreboard.id, {
          config: { teams: newTeams },
        });
        if (config.liveScoreboardWidgetId !== existingScoreboard.id) {
          updateWidget(widget.id, {
            config: {
              ...config,
              liveScoreboardWidgetId: existingScoreboard.id,
            } as QuizConfig,
          });
        }
      } else {
        // Create a new scoreboard widget; the next sync cycle will find it by type
        addWidget('scoreboard', {
          config: { teams: newTeams },
        });
      }
    }, 2000);

    return () => {
      if (liveScoreboardTimerRef.current) {
        clearTimeout(liveScoreboardTimerRef.current);
      }
    };
  }, [
    config.liveScoreboardEnabled,
    config.liveScoreboardScoring,
    config.liveScoreboardMode,
    config.liveScoreboardWidgetId,
    config.periodName,
    responses,
    loadedQuizData,
    liveSession,
    rosters,
    activeDashboard?.widgets,
    updateWidget,
    addWidget,
    widget.id,
    config,
  ]);

  // Auto-disable live scoreboard when session ends
  useEffect(() => {
    if (
      config.liveScoreboardEnabled &&
      liveSession &&
      liveSession.status === 'ended'
    ) {
      handleUpdateQuizConfig({ liveScoreboardEnabled: false });
    }
  }, [liveSession, config.liveScoreboardEnabled, handleUpdateQuizConfig]);

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
    return (
      <QuizImporter
        onBack={() => setView('manager')}
        importFromSheet={importFromSheet}
        importFromCSV={importFromCSV}
        createQuizTemplate={createQuizTemplate}
        onSave={async (quiz) => {
          try {
            await saveQuiz(quiz);
            addToast('Quiz saved to Drive!', 'success');
            setView('manager');
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Save failed',
              'error'
            );
          }
        }}
      />
    );
  }

  if (view === 'editor' && loadedQuizData) {
    return (
      <QuizEditor
        quiz={loadedQuizData}
        onBack={() => {
          setLoadedQuizData(null);
          setView('manager');
        }}
        onSave={async (updated) => {
          await saveQuiz(updated, selectedMeta?.driveFileId);
          setLoadedQuizData(updated);
          addToast('Quiz updated!', 'success');
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
    return (
      <QuizResults
        quiz={loadedQuizData}
        responses={responses}
        config={config}
        onBack={() => {
          setLoadedQuizData(null);
          setView('manager');
        }}
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
          await endQuizSession();
          setView('manager');
        }}
        config={config}
        widgetId={widget.id}
        rosters={rosters}
        onUpdateConfig={handleUpdateQuizConfig}
      />
    );
  }

  // Default: manager view
  return (
    <QuizManager
      quizzes={quizzes}
      loading={quizzesLoading}
      error={quizzesError ?? dataError}
      hasActiveSession={!!(liveSession && liveSession.status !== 'ended')}
      activeQuizId={liveSession?.quizId ?? null}
      onImport={() => setView('import')}
      onResume={() => setView('monitor')}
      onEndSession={async () => {
        await endQuizSession();
        addToast('Session ended.', 'success');
      }}
      onEdit={async (meta) => {
        const data = await loadQuiz(meta);
        if (data) setView('editor');
      }}
      onPreview={async (meta) => {
        const data = await loadQuiz(meta);
        if (data) setView('preview');
      }}
      rosters={rosters}
      config={config}
      onAssign={async (meta, mode, plcOptions: PlcOptions) => {
        const data = await loadQuiz(meta);
        if (!data) return;
        try {
          const code = await startQuizSession(data, mode);
          updateWidget(widget.id, {
            config: {
              ...config,
              view: 'monitor',
              selectedQuizId: meta.id,
              selectedQuizTitle: meta.title,
              activeLiveSessionCode: code,
              plcMode: plcOptions.plcMode,
              teacherName: plcOptions.teacherName ?? '',
              periodName: plcOptions.periodName ?? '',
              plcSheetUrl: plcOptions.plcSheetUrl ?? '',
            } as QuizConfig,
          });
          const url = `${window.location.origin}/quiz?code=${code}`;
          if (typeof navigator !== 'undefined' && navigator.clipboard) {
            void navigator.clipboard
              .writeText(url)
              .then(() =>
                addToast('Assignment link copied to clipboard!', 'success')
              )
              .catch(() =>
                addToast(
                  'Assignment created, but link could not be copied.',
                  'info'
                )
              );
          } else {
            addToast(
              'Assignment created, but link could not be copied.',
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
      onDelete={async (meta) => {
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
    />
  );
};
