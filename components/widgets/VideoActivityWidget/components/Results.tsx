/**
 * Results — aggregated results view for a video activity session.
 * Adapted from QuizResults. Shows per-student scores and per-question accuracy.
 */

import React, { useState } from 'react';
import {
  ArrowLeft,
  Download,
  Loader2,
  ExternalLink,
  AlertTriangle,
  BarChart3,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { VideoActivityResponse, VideoActivitySession } from '@/types';
import { useAuth } from '@/context/useAuth';
import { QuizDriveService } from '@/utils/quizDriveService';
import {
  useAssignmentPseudonyms,
  formatStudentName,
} from '@/hooks/useAssignmentPseudonyms';

interface ResultsProps {
  session: VideoActivitySession;
  responses: VideoActivityResponse[];
  onBack: () => void;
}

export const Results: React.FC<ResultsProps> = ({
  session,
  responses,
  onBack,
}) => {
  const { googleAccessToken, orgId } = useAuth();
  const { byStudentUid } = useAssignmentPseudonyms(
    session.id,
    session.classId ?? null,
    orgId
  );
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'questions' | 'students'
  >('overview');

  const questions = session.questions;
  const totalStudents = responses.length;

  /** Compute correctness from the authoritative activity question data. */
  const isAnswerCorrect = (questionId: string, answer: string): boolean => {
    const q = questions.find((q) => q.id === questionId);
    return q ? answer === q.correctAnswer : false;
  };

  const getStudentScore = (r: VideoActivityResponse): number => {
    if (questions.length === 0) return 0;
    // Count at most one correct answer per question to prevent inflated scores
    // from duplicate entries (e.g. if arrayUnion raced and stored multiple answers).
    let correct = 0;
    for (const question of questions) {
      if (
        r.answers.some(
          (a) =>
            a.questionId === question.id &&
            isAnswerCorrect(a.questionId, a.answer)
        )
      ) {
        correct += 1;
      }
    }
    return Math.round((correct / questions.length) * 100);
  };

  // ⚡ Bolt: Consolidate multiple O(N) array passes inside render
  // Calculate completed count and average score in a single loop
  const { completed, avgScore } = React.useMemo(() => {
    if (responses.length === 0) {
      return { completed: 0, avgScore: 0 };
    }

    const correctAnswersMap = new Map<string, string>();
    for (const q of questions) {
      correctAnswersMap.set(q.id, q.correctAnswer);
    }

    let completedCount = 0;
    let scoreSum = 0;

    for (const r of responses) {
      if (r.completedAt !== null) {
        completedCount++;

        const correctAnswersForStudent = new Set<string>();
        for (const answer of r.answers) {
          if (answer.answer === correctAnswersMap.get(answer.questionId)) {
            correctAnswersForStudent.add(answer.questionId);
          }
        }
        const score =
          questions.length > 0
            ? Math.round(
                (correctAnswersForStudent.size / questions.length) * 100
              )
            : 0;
        scoreSum += score;
      }
    }

    return {
      completed: completedCount,
      avgScore: completedCount > 0 ? Math.round(scoreSum / completedCount) : 0,
    };
  }, [responses, questions]);

  const getQuestionAccuracy = (questionId: string): number => {
    const answered = responses.filter((r) =>
      r.answers.some((a) => a.questionId === questionId)
    );
    if (answered.length === 0) return 0;
    const correct = answered.filter((r) =>
      r.answers.some(
        (a) =>
          a.questionId === questionId && isAnswerCorrect(a.questionId, a.answer)
      )
    ).length;
    return Math.round((correct / answered.length) * 100);
  };

  const formatTimestamp = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleExport = async () => {
    if (!googleAccessToken) {
      setExportError(
        'Google Drive access is required to export. Please sign out and sign in again.'
      );
      return;
    }

    setExporting(true);
    setExportError(null);

    try {
      const drive = new QuizDriveService(googleAccessToken);

      // Map VideoActivityResponses to QuizResponse shape for reuse
      const quizResponses = responses.map((r) => ({
        studentUid: r.pin,
        pin: r.pin,
        joinedAt: r.joinedAt,
        status: (r.completedAt ? 'completed' : 'in-progress') as
          | 'completed'
          | 'in-progress'
          | 'joined',
        answers: r.answers.map((a) => ({
          questionId: a.questionId,
          answer: a.answer,
          answeredAt: a.answeredAt,
          isCorrect: a.isCorrect,
        })),
        score: r.score,
        submittedAt: r.completedAt,
        tabSwitchWarnings: 0,
      }));

      const url = await drive.exportResultsToSheet(
        session.assignmentName,
        quizResponses,
        questions
      );
      setExportUrl(url);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Export failed. Please try again.'
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full font-sans">
      {/* Header */}
      <div
        className="flex items-center justify-between border-b border-brand-blue-primary/10 bg-brand-blue-lighter/30"
        style={{ padding: 'min(10px, 2.5cqmin) min(16px, 4cqmin)' }}
      >
        <div className="flex items-center" style={{ gap: 'min(8px, 2cqmin)' }}>
          <button
            onClick={onBack}
            className="text-brand-blue-primary hover:text-brand-blue-dark transition-colors"
          >
            <ArrowLeft
              style={{
                width: 'min(18px, 4.5cqmin)',
                height: 'min(18px, 4.5cqmin)',
              }}
            />
          </button>
          <div>
            <p
              className="font-bold text-brand-blue-dark truncate"
              style={{ fontSize: 'min(13px, 4cqmin)' }}
            >
              Results: {session.assignmentName}
            </p>
            <p
              className="text-brand-blue-primary/60"
              style={{ fontSize: 'min(10px, 3cqmin)' }}
            >
              {session.activityTitle} · {totalStudents} student
              {totalStudents !== 1 ? 's' : ''} ·{' '}
              {session.status === 'ended' ? 'Closed' : 'Active'} · {completed}{' '}
              completed
            </p>
          </div>
        </div>

        {/* Export button */}
        {exportUrl ? (
          <a
            href={exportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors"
            style={{
              gap: 'min(6px, 1.5cqmin)',
              padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
              fontSize: 'min(11px, 3cqmin)',
            }}
          >
            <ExternalLink
              style={{
                width: 'min(12px, 3cqmin)',
                height: 'min(12px, 3cqmin)',
              }}
            />
            Open Sheet
          </a>
        ) : (
          <button
            onClick={handleExport}
            disabled={exporting || totalStudents === 0}
            className="flex items-center font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            style={{
              gap: 'min(6px, 1.5cqmin)',
              padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
              fontSize: 'min(11px, 3cqmin)',
            }}
          >
            {exporting ? (
              <Loader2
                className="animate-spin"
                style={{
                  width: 'min(12px, 3cqmin)',
                  height: 'min(12px, 3cqmin)',
                }}
              />
            ) : (
              <Download
                style={{
                  width: 'min(12px, 3cqmin)',
                  height: 'min(12px, 3cqmin)',
                }}
              />
            )}
            Export
          </button>
        )}
      </div>

      {exportError && (
        <div
          className="flex items-center bg-amber-50 border-b border-amber-200 text-amber-700"
          style={{
            padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
            gap: 'min(8px, 2cqmin)',
            fontSize: 'min(11px, 3.5cqmin)',
          }}
        >
          <AlertTriangle
            className="shrink-0"
            style={{
              width: 'min(14px, 4cqmin)',
              height: 'min(14px, 4cqmin)',
            }}
          />
          {exportError}
        </div>
      )}

      {/* Tabs */}
      <div
        className="flex border-b border-slate-200"
        style={{ padding: '0 min(16px, 4cqmin)' }}
      >
        {(
          [
            { id: 'overview', icon: <BarChart3 />, label: 'Overview' },
            { id: 'questions', icon: <Clock />, label: 'Questions' },
            { id: 'students', icon: <Users />, label: 'Students' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center font-bold transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'text-brand-blue-primary border-brand-blue-primary'
                : 'text-slate-400 border-transparent hover:text-slate-600'
            }`}
            style={{
              gap: 'min(5px, 1.2cqmin)',
              padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
              fontSize: 'min(11px, 3cqmin)',
            }}
          >
            {React.cloneElement(tab.icon, {
              style: {
                width: 'min(13px, 3.5cqmin)',
                height: 'min(13px, 3.5cqmin)',
              },
            })}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: 'min(14px, 3.5cqmin)' }}
      >
        {/* Overview tab */}
        {activeTab === 'overview' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  label: 'Students',
                  value: totalStudents,
                  color: 'text-brand-blue-primary',
                },
                {
                  label: 'Completed',
                  value: completed,
                  color: 'text-emerald-600',
                },
                {
                  label: 'Avg Score',
                  value: `${avgScore}%`,
                  color: 'text-violet-600',
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-white border border-slate-100 rounded-xl text-center"
                  style={{ padding: 'min(10px, 2.5cqmin)' }}
                >
                  <p
                    className={`font-black ${stat.color}`}
                    style={{ fontSize: 'min(22px, 7cqmin)' }}
                  >
                    {stat.value}
                  </p>
                  <p
                    className="text-slate-500 font-medium"
                    style={{ fontSize: 'min(10px, 3cqmin)' }}
                  >
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>

            {totalStudents === 0 && (
              <p
                className="text-center text-slate-400"
                style={{
                  fontSize: 'min(12px, 4cqmin)',
                  marginTop: 'min(24px, 6cqmin)',
                }}
              >
                No students have joined this session yet.
              </p>
            )}
          </div>
        )}

        {/* Questions tab */}
        {activeTab === 'questions' && (
          <div className="space-y-2">
            {questions.map((q, idx) => {
              const accuracy = getQuestionAccuracy(q.id);
              return (
                <div
                  key={q.id}
                  className="bg-white border border-slate-100 rounded-xl"
                  style={{ padding: 'min(10px, 2.5cqmin)' }}
                >
                  <div
                    className="flex items-start justify-between"
                    style={{ gap: 'min(8px, 2cqmin)' }}
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className="flex items-center"
                        style={{
                          gap: 'min(6px, 1.5cqmin)',
                          marginBottom: 'min(4px, 1cqmin)',
                        }}
                      >
                        <span
                          className="bg-brand-blue-lighter text-brand-blue-primary font-black rounded-md shrink-0"
                          style={{
                            fontSize: 'min(9px, 2.5cqmin)',
                            padding: 'min(1px, 0.2cqmin) min(5px, 1.2cqmin)',
                          }}
                        >
                          {formatTimestamp(q.timestamp)}
                        </span>
                        <p
                          className="text-slate-700 font-medium truncate"
                          style={{ fontSize: 'min(12px, 3.5cqmin)' }}
                        >
                          {idx + 1}. {q.text}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={`font-black ${accuracy >= 70 ? 'text-emerald-600' : accuracy >= 40 ? 'text-amber-600' : 'text-brand-red-primary'}`}
                        style={{ fontSize: 'min(16px, 5cqmin)' }}
                      >
                        {accuracy}%
                      </p>
                      <p
                        className="text-slate-400"
                        style={{ fontSize: 'min(9px, 2.5cqmin)' }}
                      >
                        accuracy
                      </p>
                    </div>
                  </div>

                  {/* Accuracy bar */}
                  <div
                    className="bg-slate-100 rounded-full overflow-hidden"
                    style={{
                      height: 'min(6px, 1.5cqmin)',
                      marginTop: 'min(6px, 1.5cqmin)',
                    }}
                  >
                    <div
                      className={`h-full rounded-full transition-all ${accuracy >= 70 ? 'bg-emerald-500' : accuracy >= 40 ? 'bg-amber-500' : 'bg-brand-red-primary'}`}
                      style={{ width: `${accuracy}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Students tab */}
        {activeTab === 'students' && (
          <div className="space-y-2">
            {responses.length === 0 ? (
              <p
                className="text-center text-slate-400"
                style={{
                  fontSize: 'min(12px, 4cqmin)',
                  marginTop: 'min(24px, 6cqmin)',
                }}
              >
                No students have joined this session yet.
              </p>
            ) : (
              responses
                .slice()
                .sort((a, b) => getStudentScore(b) - getStudentScore(a))
                .map((r) => {
                  const score = getStudentScore(r);
                  const correct = r.answers.filter((a) =>
                    isAnswerCorrect(a.questionId, a.answer)
                  ).length;
                  return (
                    <div
                      key={r.pin}
                      className="flex items-center bg-white border border-slate-100 rounded-xl"
                      style={{
                        padding: 'min(10px, 2.5cqmin)',
                        gap: 'min(10px, 2.5cqmin)',
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p
                          className="font-bold text-slate-800 truncate"
                          style={{ fontSize: 'min(13px, 4cqmin)' }}
                        >
                          {formatStudentName(byStudentUid.get(r.studentUid)) ||
                            r.name ||
                            r.pin}
                        </p>
                        <p
                          className="text-slate-400"
                          style={{ fontSize: 'min(10px, 3cqmin)' }}
                        >
                          {r.completedAt ? 'Completed' : 'In progress'} ·{' '}
                          {correct}/{questions.length} correct
                        </p>
                      </div>
                      <div
                        className="flex items-center shrink-0"
                        style={{ gap: 'min(6px, 1.5cqmin)' }}
                      >
                        {r.answers.map((a) =>
                          isAnswerCorrect(a.questionId, a.answer) ? (
                            <CheckCircle2
                              key={a.questionId}
                              className="text-emerald-500"
                              style={{
                                width: 'min(14px, 3.5cqmin)',
                                height: 'min(14px, 3.5cqmin)',
                              }}
                            />
                          ) : (
                            <XCircle
                              key={a.questionId}
                              className="text-brand-red-primary"
                              style={{
                                width: 'min(14px, 3.5cqmin)',
                                height: 'min(14px, 3.5cqmin)',
                              }}
                            />
                          )
                        )}
                        <span
                          className={`font-black ml-1 ${score >= 70 ? 'text-emerald-600' : score >= 40 ? 'text-amber-600' : 'text-brand-red-primary'}`}
                          style={{ fontSize: 'min(14px, 4.5cqmin)' }}
                        >
                          {score}%
                        </span>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
