/**
 * QuizResults — aggregated results view for a completed quiz session.
 * Shows score distribution, per-question accuracy, and per-student breakdown.
 * Allows exporting to Google Sheets.
 */

import React, { useState } from 'react';
import {
  ArrowLeft,
  Download,
  BarChart3,
  Users,
  CheckCircle2,
  XCircle,
  Trophy,
  Loader2,
  ExternalLink,
  Target,
  AlertTriangle,
} from 'lucide-react';
import { QuizResponse, QuizData, QuizQuestion } from '@/types';
import { useAuth } from '@/context/useAuth';
import { QuizDriveService } from '@/utils/quizDriveService';
import { gradeAnswer } from '@/hooks/useQuizSession';

/**
 * Compute a student's percentage score by re-grading answers with gradeAnswer
 */
function getResponseScore(r: QuizResponse, questions: QuizQuestion[]): number {
  if (questions.length === 0) return 0;
  const correct = r.answers.filter((a) => {
    const q = questions.find((qn) => qn.id === a.questionId);
    return q ? gradeAnswer(q, a.answer) : false;
  }).length;
  return Math.round((correct / questions.length) * 100);
}

interface QuizResultsProps {
  quiz: QuizData;
  responses: QuizResponse[];
  onBack: () => void;
}

export const QuizResults: React.FC<QuizResultsProps> = ({
  quiz,
  responses,
  onBack,
}) => {
  const { googleAccessToken } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'questions' | 'students'
  >('overview');

  const completed = responses.filter((r) => r.status === 'completed');
  const avgScore =
    completed.length > 0
      ? Math.round(
          completed.reduce(
            (sum, r) => sum + getResponseScore(r, quiz.questions),
            0
          ) / completed.length
        )
      : null;

  const handleExport = async () => {
    if (!googleAccessToken) {
      setExportError(
        'Google access token not available. Please sign in again.'
      );
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      const svc = new QuizDriveService(googleAccessToken);
      const url = await svc.exportResultsToSheet(
        quiz.title,
        responses,
        quiz.questions
      );
      setExportUrl(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full font-sans">
      {/* Header */}
      <div
        className="flex items-center border-b border-brand-blue-primary/10 bg-brand-blue-lighter/30"
        style={{
          gap: 'min(12px, 3cqmin)',
          padding: 'min(12px, 2.5cqmin) min(16px, 4cqmin)',
        }}
      >
        <button
          onClick={onBack}
          className="p-1.5 hover:bg-brand-blue-primary/10 rounded-lg transition-colors text-brand-blue-primary shrink-0"
        >
          <ArrowLeft
            style={{
              width: 'min(16px, 4.5cqmin)',
              height: 'min(16px, 4.5cqmin)',
            }}
          />
        </button>
        <div className="flex-1 min-w-0">
          <p
            className="font-black text-brand-blue-dark truncate"
            style={{ fontSize: 'min(14px, 4.5cqmin)' }}
          >
            Results: {quiz.title}
          </p>
          <p
            className="text-brand-blue-primary/60 font-bold"
            style={{ fontSize: 'min(11px, 3.5cqmin)' }}
          >
            {completed.length} of {responses.length} students finished
          </p>
        </div>

        {exportUrl ? (
          <a
            href={exportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-md active:scale-95 shrink-0"
            style={{
              gap: 'min(6px, 1.5cqmin)',
              padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
              fontSize: 'min(11px, 3.5cqmin)',
            }}
          >
            <ExternalLink
              style={{
                width: 'min(14px, 4cqmin)',
                height: 'min(14px, 4cqmin)',
              }}
            />
            OPEN SHEET
          </a>
        ) : (
          <button
            onClick={() => void handleExport()}
            disabled={exporting || responses.length === 0}
            className="flex items-center bg-brand-blue-primary hover:bg-brand-blue-dark disabled:bg-brand-gray-lighter text-white font-bold rounded-xl transition-all shadow-md active:scale-95 shrink-0"
            style={{
              gap: 'min(6px, 1.5cqmin)',
              padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
              fontSize: 'min(11px, 3.5cqmin)',
            }}
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download
                style={{
                  width: 'min(14px, 4cqmin)',
                  height: 'min(14px, 4cqmin)',
                }}
              />
            )}
            EXPORT
          </button>
        )}
      </div>

      {exportError && (
        <div
          className="mx-4 mt-3 p-3 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-xl text-brand-red-dark font-bold text-center"
          style={{ fontSize: 'min(11px, 3.5cqmin)' }}
        >
          {exportError}
        </div>
      )}

      {responses.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center h-full text-brand-blue-primary/30"
          style={{ gap: 'min(16px, 4cqmin)' }}
        >
          <div className="bg-brand-blue-lighter/50 p-6 rounded-full border-2 border-dashed border-brand-blue-primary/10">
            <BarChart3
              style={{
                width: 'min(48px, 12cqmin)',
                height: 'min(48px, 12cqmin)',
              }}
            />
          </div>
          <p className="font-bold" style={{ fontSize: 'min(14px, 4.5cqmin)' }}>
            No data available yet.
          </p>
        </div>
      ) : (
        <>
          {/* Tabs Navigation */}
          <div
            className="flex bg-white/50 border-b border-brand-blue-primary/10"
            style={{
              padding: 'min(8px, 2cqmin) min(16px, 4cqmin) 0',
              gap: 'min(4px, 1cqmin)',
            }}
          >
            {(['overview', 'questions', 'students'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`font-black uppercase tracking-widest rounded-t-xl transition-all ${
                  activeTab === tab
                    ? 'bg-white text-brand-blue-primary border-x border-t border-brand-blue-primary/10'
                    : 'text-brand-blue-primary/40 hover:text-brand-blue-primary hover:bg-brand-blue-lighter/30'
                }`}
                style={{
                  padding: 'min(10px, 2.5cqmin) min(16px, 4cqmin)',
                  fontSize: 'min(10px, 3cqmin)',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          <div
            className="flex-1 overflow-y-auto custom-scrollbar"
            style={{ padding: 'min(16px, 4cqmin)' }}
          >
            {activeTab === 'overview' && (
              <OverviewTab
                responses={responses}
                completed={completed}
                avgScore={avgScore}
                questions={quiz.questions}
              />
            )}
            {activeTab === 'questions' && (
              <QuestionsTab questions={quiz.questions} responses={responses} />
            )}
            {activeTab === 'students' && (
              <StudentsTab responses={responses} questions={quiz.questions} />
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ─── Sub-tabs ─────────────────────────────────────────────────────────────────

const OverviewTab: React.FC<{
  responses: QuizResponse[];
  completed: QuizResponse[];
  avgScore: number | null;
  questions: QuizQuestion[];
}> = ({ responses: _responses, completed, avgScore, questions }) => {
  const buckets = [
    {
      label: '90-100%',
      min: 90,
      max: 100,
      color: 'bg-emerald-500 shadow-emerald-500/20',
    },
    {
      label: '80-89%',
      min: 80,
      max: 89,
      color: 'bg-blue-500 shadow-blue-500/20',
    },
    {
      label: '60-79%',
      min: 60,
      max: 79,
      color: 'bg-amber-500 shadow-amber-500/20',
    },
    {
      label: '0-59%',
      min: 0,
      max: 59,
      color: 'bg-brand-red-primary shadow-brand-red-primary/20',
    },
  ];

  return (
    <div className="flex flex-col" style={{ gap: 'min(20px, 5cqmin)' }}>
      {/* Top Level Scoreboard */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border-2 border-brand-blue-primary/10 rounded-2xl p-4 text-center shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-400"></div>
          <Trophy
            className="text-amber-400 mx-auto mb-1 group-hover:scale-110 transition-transform"
            style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
          />
          <p
            className="font-black text-brand-blue-dark leading-none"
            style={{ fontSize: 'min(28px, 9cqmin)' }}
          >
            {avgScore !== null ? `${avgScore}%` : '—'}
          </p>
          <p
            className="text-brand-blue-primary/60 font-black uppercase tracking-widest mt-1"
            style={{ fontSize: 'min(10px, 3cqmin)' }}
          >
            Class Average
          </p>
        </div>
        <div className="bg-white border-2 border-brand-blue-primary/10 rounded-2xl p-4 text-center shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-brand-blue-primary"></div>
          <Users
            className="text-brand-blue-primary mx-auto mb-1 group-hover:scale-110 transition-transform"
            style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
          />
          <p
            className="font-black text-brand-blue-dark leading-none"
            style={{ fontSize: 'min(28px, 9cqmin)' }}
          >
            {completed.length}
          </p>
          <p
            className="text-brand-blue-primary/60 font-black uppercase tracking-widest mt-1"
            style={{ fontSize: 'min(10px, 3cqmin)' }}
          >
            Finished
          </p>
        </div>
      </div>

      {/* Distribution Chart */}
      <div className="bg-white border border-brand-blue-primary/10 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-4 h-4 text-brand-blue-primary" />
          <span
            className="font-black text-brand-blue-dark uppercase tracking-widest"
            style={{ fontSize: 'min(10px, 3.5cqmin)' }}
          >
            Score Distribution
          </span>
        </div>
        <div className="space-y-4">
          {buckets.map((b) => {
            const count = completed.filter((r) => {
              const s = getResponseScore(r, questions);
              return s >= b.min && s <= b.max;
            }).length;
            const pct =
              completed.length > 0
                ? Math.round((count / completed.length) * 100)
                : 0;

            return (
              <div key={b.label}>
                <div
                  className="flex items-center justify-between mb-1.5 font-bold"
                  style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                >
                  <span className="text-brand-blue-dark">{b.label}</span>
                  <span className="text-brand-blue-primary/60">
                    {count} {count === 1 ? 'Student' : 'Students'} ({pct}%)
                  </span>
                </div>
                <div className="h-3 bg-brand-blue-lighter rounded-full overflow-hidden shadow-inner">
                  <div
                    className={`h-full ${b.color} rounded-full transition-all duration-1000 shadow-lg`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const QuestionsTab: React.FC<{
  questions: QuizData['questions'];
  responses: QuizResponse[];
}> = ({ questions, responses }) => (
  <div className="space-y-3">
    {questions.map((q, i) => {
      const answered = responses.filter((r) =>
        r.answers.some((a) => a.questionId === q.id)
      );
      const correct = answered.filter((r) =>
        r.answers.some((a) => a.questionId === q.id && gradeAnswer(q, a.answer))
      );
      const pct =
        answered.length > 0
          ? Math.round((correct.length / answered.length) * 100)
          : 0;

      return (
        <div
          key={q.id}
          className="bg-white border border-brand-blue-primary/10 rounded-2xl p-4 shadow-sm hover:border-brand-blue-primary/20 transition-all"
        >
          <div className="flex items-start justify-between mb-2">
            <div
              className="bg-brand-blue-lighter px-2 py-0.5 rounded text-brand-blue-primary font-black uppercase tracking-tighter"
              style={{ fontSize: 'min(9px, 2.5cqmin)' }}
            >
              Question {i + 1}
            </div>
            <div
              className="font-black text-brand-blue-dark"
              style={{ fontSize: 'min(12px, 4cqmin)' }}
            >
              {pct}% Accuracy
            </div>
          </div>

          <p
            className="font-bold text-brand-blue-dark leading-tight line-clamp-2"
            style={{ fontSize: 'min(13px, 4.5cqmin)' }}
          >
            {q.text}
          </p>

          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-brand-blue-primary/5">
            <div
              className="flex items-center gap-1.5 text-emerald-600 font-bold"
              style={{ fontSize: 'min(11px, 3.5cqmin)' }}
            >
              <CheckCircle2
                style={{
                  width: 'min(14px, 4cqmin)',
                  height: 'min(14px, 4cqmin)',
                }}
              />
              {correct.length} Correct
            </div>
            <div
              className="flex items-center gap-1.5 text-brand-red-primary font-bold"
              style={{ fontSize: 'min(11px, 3.5cqmin)' }}
            >
              <XCircle
                style={{
                  width: 'min(14px, 4cqmin)',
                  height: 'min(14px, 4cqmin)',
                }}
              />
              {answered.length - correct.length} Missed
            </div>
          </div>

          <div className="h-2 bg-brand-blue-lighter rounded-full overflow-hidden mt-3">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                pct >= 80
                  ? 'bg-emerald-500'
                  : pct >= 60
                    ? 'bg-amber-500'
                    : 'bg-brand-red-primary'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      );
    })}
  </div>
);

const StudentsTab: React.FC<{
  responses: QuizResponse[];
  questions: QuizQuestion[];
}> = ({ responses, questions }) => (
  <div className="space-y-2">
    {responses
      .slice()
      .sort((a, b) => {
        const scoreA =
          a.status === 'completed' || a.status === 'in-progress'
            ? getResponseScore(a, questions)
            : -1;
        const scoreB =
          b.status === 'completed' || b.status === 'in-progress'
            ? getResponseScore(b, questions)
            : -1;
        return scoreB - scoreA;
      })
      .map((r) => {
        const score = getResponseScore(r, questions);
        const correct = r.answers.filter((a) => {
          const q = questions.find((qn) => qn.id === a.questionId);
          return q ? gradeAnswer(q, a.answer) : false;
        }).length;
        const warnings = r.tabSwitchWarnings ?? 0;

        return (
          <div
            key={r.studentUid}
            className="flex items-center bg-white border border-brand-blue-primary/10 rounded-xl p-3 shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p
                  className="font-bold text-brand-blue-dark truncate font-mono"
                  style={{ fontSize: 'min(13px, 4.5cqmin)' }}
                >
                  PIN {r.pin}
                </p>
                {warnings > 0 && (
                  <span
                    className="flex items-center gap-1 bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase font-black shrink-0"
                    style={{ fontSize: 'min(10px, 3cqmin)' }}
                    title={`${warnings} Tab Switch Warning(s)`}
                  >
                    <AlertTriangle style={{ width: 10, height: 10 }} />
                    {warnings}
                  </span>
                )}
              </div>
            </div>

            <div className="text-right shrink-0 ml-4 pl-4 border-l border-brand-blue-primary/5">
              {r.status === 'completed' || r.status === 'in-progress' ? (
                <>
                  <p
                    className={`font-black ${score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-brand-red-primary'}`}
                    style={{ fontSize: 'min(15px, 5cqmin)' }}
                  >
                    {score}%
                  </p>
                  <p
                    className="text-brand-blue-primary/60 font-bold"
                    style={{ fontSize: 'min(10px, 3cqmin)' }}
                  >
                    {correct}/{questions.length} Correct
                    {r.status === 'in-progress' && ' (In Progress)'}
                  </p>
                </>
              ) : (
                <div
                  className="bg-brand-gray-lightest text-brand-gray-primary font-black uppercase rounded px-2 py-1 tracking-tighter"
                  style={{ fontSize: 'min(9px, 2.5cqmin)' }}
                >
                  {r.status}
                </div>
              )}
            </div>
          </div>
        );
      })}
  </div>
);
