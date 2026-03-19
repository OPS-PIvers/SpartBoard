/**
 * QuizLiveMonitor — teacher view during a live quiz session.
 * Shows join code, student progress, current question controls,
 * and real-time per-question answer distribution.
 */

import React, { useState, useEffect } from 'react';
import {
  Copy,
  CheckCircle2,
  Clock,
  Users,
  ChevronRight,
  Square,
  BarChart3,
  Loader2,
  ExternalLink,
  Zap,
  User,
  AlertTriangle,
} from 'lucide-react';
import { QuizSession, QuizResponse, QuizQuestion, QuizData } from '@/types';
import { gradeAnswer } from '@/hooks/useQuizSession';

interface QuizLiveMonitorProps {
  session: QuizSession;
  responses: QuizResponse[];
  quizData: QuizData;
  onAdvance: () => Promise<void>;
  onEnd: () => Promise<void>;
}

export const QuizLiveMonitor: React.FC<QuizLiveMonitorProps> = ({
  session,
  responses,
  quizData,
  onAdvance,
  onEnd,
}) => {
  const [copied, setCopied] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [autoCountdown, setAutoCountdown] = useState<number | null>(null);

  // Sync auto-countdown with session timestamp
  useEffect(() => {
    if (!session.autoProgressAt) {
      setAutoCountdown(null);
      return;
    }
    const update = () => {
      if (!session.autoProgressAt) return;
      const remaining = Math.max(
        0,
        Math.round((session.autoProgressAt - Date.now()) / 1000)
      );
      setAutoCountdown(remaining);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [session.autoProgressAt]);

  const joinUrl = `${window.location.origin}/quiz?code=${session.code}`;

  const handleCopy = () => {
    void navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleAdvance = async () => {
    setAdvancing(true);
    try {
      await onAdvance();
    } finally {
      setAdvancing(false);
    }
  };

  const handleEnd = async () => {
    setEnding(true);
    try {
      await onEnd();
    } finally {
      setEnding(false);
    }
  };

  const currentQ: QuizQuestion | undefined =
    session.currentQuestionIndex >= 0
      ? quizData.questions[session.currentQuestionIndex]
      : undefined;

  const answered = currentQ
    ? responses.filter((r) =>
        r.answers.some((a) => a.questionId === currentQ.id)
      ).length
    : 0;

  const completed = responses.filter((r) => r.status === 'completed').length;
  const inProgress = responses.filter((r) => r.status === 'in-progress').length;
  const joined = responses.filter((r) => r.status === 'joined').length;

  const modeIcon =
    session.sessionMode === 'auto' ? (
      <Zap className="w-3.5 h-3.5" />
    ) : session.sessionMode === 'student' ? (
      <Clock className="w-3.5 h-3.5" />
    ) : (
      <User className="w-3.5 h-3.5" />
    );

  const modeLabel =
    session.sessionMode === 'auto'
      ? 'Auto-progress'
      : session.sessionMode === 'student'
        ? 'Self-paced'
        : 'Teacher-paced';

  return (
    <div className="flex flex-col h-full font-sans">
      {/* Header */}
      <div
        className="border-b border-brand-red-primary/10 bg-brand-red-lighter/20"
        style={{ padding: 'min(12px, 2.5cqmin) min(16px, 4cqmin)' }}
      >
        <div className="flex items-center justify-between">
          <div
            className="flex items-center"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            <div
              className="rounded-full bg-brand-red-primary animate-pulse shadow-[0_0_8px_rgba(173,33,34,0.5)]"
              style={{
                width: 'min(10px, 2.5cqmin)',
                height: 'min(10px, 2.5cqmin)',
              }}
            />
            <div className="flex flex-col">
              <div
                className="flex items-center gap-1.5 font-black text-brand-red-primary leading-none uppercase tracking-tight"
                style={{ fontSize: 'min(12px, 4cqmin)' }}
              >
                {modeIcon}
                <span>{modeLabel}</span>
              </div>
              <span
                className="text-brand-blue-dark font-bold truncate"
                style={{ fontSize: 'min(11px, 3.5cqmin)', maxWidth: '140px' }}
              >
                {session.quizTitle}
              </span>
            </div>
          </div>
          <button
            onClick={() => void handleEnd()}
            disabled={ending}
            className="flex items-center bg-brand-red-primary hover:bg-brand-red-dark disabled:opacity-50 text-white font-black rounded-xl transition-all shadow-md active:scale-95"
            style={{
              gap: 'min(6px, 1.5cqmin)',
              padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
              fontSize: 'min(11px, 3.5cqmin)',
            }}
          >
            {ending ? (
              <Loader2
                className="animate-spin"
                style={{
                  width: 'min(14px, 3.5cqmin)',
                  height: 'min(14px, 3.5cqmin)',
                }}
              />
            ) : (
              <Square
                style={{
                  width: 'min(14px, 3.5cqmin)',
                  height: 'min(14px, 3.5cqmin)',
                }}
              />
            )}
            END
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: 'min(16px, 4cqmin)' }}
      >
        <div className="flex flex-col" style={{ gap: 'min(16px, 4cqmin)' }}>
          {/* Join code section */}
          <div
            className="bg-white border-2 border-brand-blue-primary/10 rounded-2xl shadow-sm"
            style={{ padding: 'min(16px, 4cqmin)' }}
          >
            <p
              className="text-brand-blue-primary/60 font-bold uppercase tracking-wider text-center"
              style={{
                fontSize: 'min(11px, 3cqmin)',
                marginBottom: 'min(8px, 2cqmin)',
              }}
            >
              Join Code
            </p>
            <div
              className="flex items-center justify-center"
              style={{
                marginBottom: 'min(16px, 4cqmin)',
              }}
            >
              <span
                className="font-black tracking-[0.2em] text-brand-blue-dark font-mono bg-brand-blue-lighter/40 px-6 py-2 rounded-2xl border border-brand-blue-primary/5"
                style={{ fontSize: 'min(32px, 10cqmin)' }}
              >
                {session.code}
              </span>
            </div>
            <div
              className="grid grid-cols-2"
              style={{ gap: 'min(10px, 2.5cqmin)' }}
            >
              <button
                onClick={handleCopy}
                className="flex items-center justify-center bg-brand-blue-lighter hover:bg-brand-blue-primary/20 text-brand-blue-primary font-bold rounded-xl transition-all active:scale-95"
                style={{
                  gap: 'min(6px, 1.5cqmin)',
                  padding: 'min(8px, 2cqmin)',
                  fontSize: 'min(11px, 3.5cqmin)',
                }}
              >
                {copied ? (
                  <CheckCircle2
                    className="text-emerald-600"
                    style={{
                      width: 'min(16px, 4cqmin)',
                      height: 'min(16px, 4cqmin)',
                    }}
                  />
                ) : (
                  <Copy
                    style={{
                      width: 'min(16px, 4cqmin)',
                      height: 'min(16px, 4cqmin)',
                    }}
                  />
                )}
                {copied ? 'COPIED' : 'COPY LINK'}
              </button>
              <a
                href={joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-xl transition-all shadow-sm active:scale-95 text-center"
                style={{
                  gap: 'min(6px, 1.5cqmin)',
                  padding: 'min(8px, 2cqmin)',
                  fontSize: 'min(11px, 3.5cqmin)',
                }}
              >
                <ExternalLink
                  style={{
                    width: 'min(16px, 4cqmin)',
                    height: 'min(16px, 4cqmin)',
                  }}
                />
                OPEN PAGE
              </a>
            </div>
          </div>

          {/* Student summary counters */}
          <div className="grid grid-cols-3" style={{ gap: 'min(8px, 2cqmin)' }}>
            <StatBox
              label="Joined"
              value={joined + inProgress + completed}
              icon={
                <Users
                  style={{
                    width: 'min(14px, 4cqmin)',
                    height: 'min(14px, 4cqmin)',
                  }}
                />
              }
              color="blue"
            />
            <StatBox
              label="Active"
              value={inProgress}
              icon={
                <Clock
                  style={{
                    width: 'min(14px, 4cqmin)',
                    height: 'min(14px, 4cqmin)',
                  }}
                />
              }
              color="amber"
            />
            <StatBox
              label="Finished"
              value={completed}
              icon={
                <CheckCircle2
                  style={{
                    width: 'min(14px, 4cqmin)',
                    height: 'min(14px, 4cqmin)',
                  }}
                />
              }
              color="green"
            />
          </div>

          {/* Session Logic Views */}
          {session.status === 'waiting' && (
            <div className="p-5 bg-white border-2 border-dashed border-brand-blue-primary/20 rounded-2xl text-center shadow-inner">
              <p
                className="text-brand-blue-primary font-black uppercase tracking-wider"
                style={{ fontSize: 'min(14px, 4.5cqmin)' }}
              >
                Waiting for Students
              </p>
              <p
                className="text-brand-gray-primary font-medium"
                style={{
                  fontSize: 'min(12px, 3.5cqmin)',
                  marginTop: 'min(4px, 1cqmin)',
                }}
              >
                Students appear below as they join. Press START to begin the
                first question.
              </p>
            </div>
          )}

          {session.status === 'active' && currentQ && (
            <div
              className="bg-white border border-brand-blue-primary/10 rounded-2xl shadow-sm overflow-hidden relative"
              style={{ padding: 'min(16px, 4cqmin)' }}
            >
              {autoCountdown !== null && (
                <div className="absolute top-0 left-0 w-full h-1 bg-brand-blue-lighter">
                  <div
                    className="h-full bg-brand-red-primary transition-all duration-1000 ease-linear"
                    style={{ width: `${(autoCountdown / 5) * 100}%` }}
                  />
                </div>
              )}

              <div
                className="flex items-center justify-between"
                style={{ marginBottom: 'min(10px, 2.5cqmin)' }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="bg-brand-blue-primary text-white font-bold rounded-lg"
                    style={{
                      fontSize: 'min(10px, 3cqmin)',
                      padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Q {session.currentQuestionIndex + 1} /{' '}
                    {session.totalQuestions}
                  </span>
                  {autoCountdown !== null && (
                    <div
                      className="flex items-center gap-1 text-brand-red-primary font-black animate-bounce"
                      style={{ fontSize: 'min(10px, 3cqmin)' }}
                    >
                      <Zap className="w-3 h-3 fill-current" />
                      ADVANCING IN {autoCountdown}s
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowStats(!showStats)}
                  className="flex items-center text-brand-blue-primary font-bold hover:underline"
                  style={{
                    gap: 'min(4px, 1cqmin)',
                    fontSize: 'min(11px, 3.5cqmin)',
                  }}
                >
                  <BarChart3
                    style={{
                      width: 'min(14px, 3.5cqmin)',
                      height: 'min(14px, 3.5cqmin)',
                    }}
                  />
                  {showStats ? 'Hide Stats' : 'Show Stats'}
                </button>
              </div>
              <p
                className="text-brand-blue-dark font-black leading-tight"
                style={{ fontSize: 'min(15px, 5cqmin)' }}
              >
                {currentQ.text}
              </p>

              <div className="mt-4 space-y-2">
                <div
                  className="flex items-center justify-between text-brand-gray-primary font-bold uppercase tracking-wider"
                  style={{ fontSize: 'min(10px, 3cqmin)' }}
                >
                  <span>Completion Rate</span>
                  <span>
                    {answered} / {responses.length} Students
                  </span>
                </div>
                <div className="h-3 bg-brand-blue-lighter rounded-full overflow-hidden shadow-inner border border-brand-blue-primary/5">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                    style={{
                      width: `${responses.length > 0 ? (answered / responses.length) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Live answer distribution (MC only for now) */}
              {showStats && currentQ.type === 'MC' && (
                <div className="mt-6 pt-6 border-t border-brand-blue-primary/5">
                  <MCDistribution question={currentQ} responses={responses} />
                </div>
              )}
            </div>
          )}

          {session.status === 'ended' && (
            <div className="p-5 bg-emerald-50 text-center rounded-2xl border-2 border-emerald-100 shadow-sm">
              <div
                className="bg-emerald-500 text-white mx-auto rounded-full flex items-center justify-center shadow-lg"
                style={{
                  width: 'min(32px, 8cqmin)',
                  height: 'min(32px, 8cqmin)',
                  marginBottom: 'min(12px, 3cqmin)',
                }}
              >
                <CheckCircle2
                  style={{
                    width: 'min(20px, 5cqmin)',
                    height: 'min(20px, 5cqmin)',
                  }}
                />
              </div>
              <p
                className="text-emerald-800 font-black uppercase tracking-wider"
                style={{ fontSize: 'min(16px, 5cqmin)' }}
              >
                Quiz Finished!
              </p>
              <p
                className="text-emerald-700/70 font-bold"
                style={{
                  fontSize: 'min(13px, 4cqmin)',
                  marginTop: 'min(4px, 1cqmin)',
                }}
              >
                {completed} students crossed the finish line
              </p>
            </div>
          )}

          {/* Detailed Student Progress List */}
          {responses.length > 0 && (
            <div className="space-y-2 mt-2">
              <div className="flex items-center justify-between border-b border-brand-blue-primary/10 pb-1">
                <span
                  className="text-brand-blue-primary/60 font-black uppercase tracking-widest"
                  style={{ fontSize: 'min(10px, 3cqmin)' }}
                >
                  Roster Progress
                </span>
                <span
                  className="text-brand-blue-primary/40 font-bold"
                  style={{ fontSize: 'min(10px, 3cqmin)' }}
                >
                  {responses.length} ACTIVE
                </span>
              </div>
              <div
                className="max-h-60 overflow-y-auto pr-1 custom-scrollbar"
                style={{
                  gap: 'min(8px, 2cqmin)',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {responses
                  .slice()
                  .sort((a, b) => a.pin.localeCompare(b.pin))
                  .map((r) => (
                    <StudentRow
                      key={r.studentUid}
                      response={r}
                      totalQuestions={session.totalQuestions}
                      questions={quizData.questions}
                    />
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Primary Advance Control */}
      {(session.status === 'waiting' ||
        (session.status === 'active' && session.sessionMode !== 'student')) && (
        <div
          className="bg-white border-t border-brand-blue-primary/10"
          style={{ padding: 'min(16px, 4cqmin)' }}
        >
          <button
            onClick={() => void handleAdvance()}
            disabled={advancing}
            className="w-full bg-brand-blue-primary hover:bg-brand-blue-dark disabled:bg-brand-gray-lighter text-white font-black rounded-2xl flex items-center justify-center shadow-xl transition-all active:scale-95 group/adv"
            style={{
              padding: 'min(14px, 3.5cqmin)',
              gap: 'min(10px, 2.5cqmin)',
              fontSize: 'min(15px, 5cqmin)',
            }}
          >
            {advancing ? (
              <Loader2
                className="animate-spin"
                style={{
                  width: 'min(20px, 5cqmin)',
                  height: 'min(20px, 5cqmin)',
                }}
              />
            ) : (
              <>
                {session.status === 'waiting'
                  ? 'START QUIZ SESSION'
                  : session.currentQuestionIndex + 1 >= session.totalQuestions
                    ? 'COMPLETE & VIEW RESULTS'
                    : 'NEXT QUESTION'}
                <ChevronRight
                  className="group-hover/adv:translate-x-1 transition-transform"
                  style={{
                    width: 'min(20px, 5cqmin)',
                    height: 'min(20px, 5cqmin)',
                  }}
                />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

const StatBox: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  color: 'blue' | 'amber' | 'green';
}> = ({ label, value, icon, color }) => {
  const themes = {
    blue: 'bg-brand-blue-lighter border-brand-blue-primary/10 text-brand-blue-primary',
    amber: 'bg-amber-50 border-amber-200 text-amber-600',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-600',
  };

  return (
    <div
      className={`${themes[color]} rounded-2xl text-center border shadow-sm`}
      style={{ padding: 'min(10px, 2.5cqmin)' }}
    >
      <div
        className="opacity-60"
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: 'min(4px, 1cqmin)',
        }}
      >
        {icon}
      </div>
      <p
        className="font-black leading-none"
        style={{ fontSize: 'min(20px, 6.5cqmin)' }}
      >
        {value}
      </p>
      <p
        className="font-bold uppercase tracking-tighter opacity-70"
        style={{
          fontSize: 'min(10px, 3.5cqmin)',
          marginTop: 'min(2px, 0.5cqmin)',
        }}
      >
        {label}
      </p>
    </div>
  );
};

const StudentRow: React.FC<{
  response: QuizResponse;
  totalQuestions: number;
  questions: QuizQuestion[];
}> = ({ response, totalQuestions, questions }) => {
  const themes = {
    completed: {
      bg: 'bg-emerald-50 border-emerald-100',
      dot: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]',
      text: 'text-emerald-700 font-black',
    },
    'in-progress': {
      bg: 'bg-amber-50/50 border-amber-100',
      dot: 'bg-amber-500',
      text: 'text-amber-700 font-bold',
    },
    joined: {
      bg: 'bg-white border-brand-blue-primary/5',
      dot: 'bg-brand-gray-light',
      text: 'text-brand-gray-primary font-medium',
    },
  };

  const currentTheme = themes[response.status];
  const warnings = response.tabSwitchWarnings ?? 0;

  const correctCount = response.answers.filter((a) => {
    const q = questions.find((qn) => qn.id === a.questionId);
    return q ? gradeAnswer(q, a.answer) : false;
  }).length;

  return (
    <div
      className={`flex items-center rounded-xl border transition-all ${currentTheme.bg}`}
      style={{
        gap: 'min(12px, 3cqmin)',
        padding: 'min(10px, 2.5cqmin)',
      }}
    >
      <div
        className={`rounded-full shrink-0 ${currentTheme.dot}`}
        style={{ width: 'min(8px, 2cqmin)', height: 'min(8px, 2cqmin)' }}
      />
      <span
        className="flex-1 flex items-center gap-2 text-brand-blue-dark font-bold truncate"
        style={{ fontSize: 'min(13px, 4cqmin)' }}
      >
        <span className="font-mono">PIN {response.pin}</span>

        {warnings > 0 && (
          <span
            className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-0.5 rounded uppercase font-black shrink-0 animate-in zoom-in duration-300"
            style={{ fontSize: 'min(10px, 3cqmin)' }}
            title={`${warnings} Tab Switch Warning(s)`}
          >
            <AlertTriangle className="w-3 h-3" />
            {warnings}
          </span>
        )}
      </span>
      <span
        className={`px-2 py-0.5 rounded-md bg-white/60 border border-white/80 ${currentTheme.text}`}
        style={{ fontSize: 'min(12px, 3.5cqmin)' }}
      >
        {response.status === 'completed'
          ? `${Math.round((correctCount / Math.max(totalQuestions, 1)) * 100)}%`
          : `${response.answers.length}/${totalQuestions}`}
      </span>
    </div>
  );
};

const MCDistribution: React.FC<{
  question: QuizQuestion;
  responses: QuizResponse[];
}> = ({ question, responses }) => {
  const options = [
    question.correctAnswer,
    ...question.incorrectAnswers.filter(Boolean),
  ];
  const totalAnswered = responses.filter((r) =>
    r.answers.some((a) => a.questionId === question.id)
  ).length;

  return (
    <div className="flex flex-col" style={{ gap: 'min(8px, 2cqmin)' }}>
      <p
        className="font-bold text-brand-blue-primary/60 uppercase tracking-widest"
        style={{ fontSize: 'min(9px, 2.5cqmin)' }}
      >
        Live Answer Distribution
      </p>
      {options.map((opt) => {
        const count = responses.filter((r) =>
          r.answers.some(
            (a) => a.questionId === question.id && a.answer === opt
          )
        ).length;
        const pct =
          totalAnswered > 0 ? Math.round((count / totalAnswered) * 100) : 0;
        const isCorrect = gradeAnswer(question, opt);

        return (
          <div key={opt}>
            <div
              className="flex items-center justify-between font-bold"
              style={{
                marginBottom: 'min(4px, 1cqmin)',
                fontSize: 'min(11px, 3.5cqmin)',
              }}
            >
              <span
                className={
                  isCorrect ? 'text-emerald-700' : 'text-brand-blue-dark'
                }
                style={{ maxWidth: '80%' }}
              >
                {opt} {isCorrect && '✓'}
              </span>
              <span
                className={
                  isCorrect ? 'text-emerald-600' : 'text-brand-gray-primary'
                }
              >
                {count}
              </span>
            </div>
            <div className="h-2 bg-brand-blue-lighter rounded-full overflow-hidden shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-700 ${isCorrect ? 'bg-emerald-500' : 'bg-brand-blue-primary/40'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
