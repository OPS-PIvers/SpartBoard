import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart2,
  Download,
  X,
  Users,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { GuidedLearningSet } from '@/types';
import {
  useGuidedLearningSessionTeacher,
  isAnswerCorrect,
} from '@/hooks/useGuidedLearningSession';
import {
  useAssignmentPseudonymsMulti,
  formatStudentName,
} from '@/hooks/useAssignmentPseudonyms';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { logError } from '@/utils/logError';

interface Props {
  set: GuidedLearningSet;
  sessionId: string;
  onClose: () => void;
}

export const GuidedLearningResults: React.FC<Props> = ({
  set,
  sessionId,
  onClose,
}) => {
  const {
    responses,
    responsesLoading,
    subscribeToResponses,
    exportResponsesAsCSV,
  } = useGuidedLearningSessionTeacher(undefined);

  useEffect(() => {
    const unsub = subscribeToResponses(sessionId);
    return unsub;
  }, [sessionId, subscribeToResponses]);

  // Fetch the session doc once to learn the targeted ClassLink class ids.
  // Prefer `classIds` (multi-class sessions) so an assignment targeted at
  // multiple periods resolves names for students from every targeted class,
  // not just `classIds[0]`. Falls back to the legacy single `classId` for
  // older sessions written before multi-class support.
  const { addToast } = useDashboard();
  const [sessionClassIds, setSessionClassIds] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDoc(
          doc(db, 'guided_learning_sessions', sessionId)
        );
        if (cancelled) return;
        const data = snap.data() as
          | { classId?: string; classIds?: string[] }
          | undefined;
        if (data?.classIds && data.classIds.length > 0) {
          setSessionClassIds(data.classIds);
        } else if (data?.classId) {
          setSessionClassIds([data.classId]);
        } else {
          setSessionClassIds([]);
        }
      } catch (err) {
        if (cancelled) return;
        // Log for ops AND surface to the teacher. Without the toast, a
        // permissions regression on guided_learning_sessions/{id} silently
        // degrades name resolution to anonymous — observationally
        // identical to a legacy code+PIN session — and the teacher has no
        // way to know what changed.
        logError('GuidedLearningResults.fetchSessionClassIds', err, {
          sessionId,
        });
        addToast(
          "Couldn't load student names for this session — they'll show as anonymous. Refresh to retry.",
          'error'
        );
        setSessionClassIds([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, addToast]);

  const { orgId } = useAuth();
  const { byStudentUid } = useAssignmentPseudonymsMulti(
    sessionId,
    sessionClassIds,
    orgId
  );

  const {
    questionSteps,
    completedResponsesCount,
    avgScore,
    questionStats,
    responseStats,
  } = useMemo(() => {
    const qSteps = set.steps.filter(
      (s) => s.interactionType === 'question' && s.question
    );

    // Create a fast lookup map for question steps.
    const qStepMap = new Map(qSteps.map((step) => [step.id, step]));

    // Pre-process responses to create lookup maps for efficiency.
    const answersByStep = new Map<string, { answer: string | string[] }[]>();

    const rStats = responses.map((r) => {
      let qCorrect = 0;
      let qAnswered = 0;

      // We iterate over the student's answers instead of scanning all possible steps
      for (const a of r.answers) {
        const step = qStepMap.get(a.stepId);
        if (step) {
          qAnswered++;
          if (isAnswerCorrect(step, a.answer)) {
            qCorrect++;
          }

          // Also build up the answersByStep map for the later qStats pass
          if (!answersByStep.has(a.stepId)) {
            answersByStep.set(a.stepId, []);
          }
          const bucket = answersByStep.get(a.stepId);
          if (bucket) {
            bucket.push(a);
          }
        }
      }

      return { response: r, qCorrect, qAnswered };
    });

    const qStats = qSteps.map((step) => {
      const stepAnswers = answersByStep.get(step.id) ?? [];
      const correct = stepAnswers.filter((a) =>
        isAnswerCorrect(step, a.answer)
      ).length;
      const pct =
        stepAnswers.length > 0
          ? Math.round((correct / stepAnswers.length) * 100)
          : null;
      return { step, correct, total: stepAnswers.length, pct };
    });

    let completedResponsesCount = 0;
    let totalScore = 0;

    for (const r of rStats) {
      if (r.response.completedAt !== null) {
        completedResponsesCount++;
        if (qSteps.length > 0) {
          totalScore += Math.round((r.qCorrect / qSteps.length) * 100);
        }
      }
    }

    let computedAvgScore: number | null = null;
    if (completedResponsesCount > 0 && qSteps.length > 0) {
      computedAvgScore = Math.round(totalScore / completedResponsesCount);
    }

    return {
      questionSteps: qSteps,
      completedResponsesCount,
      avgScore: computedAvgScore,
      questionStats: qStats,
      responseStats: rStats,
    };
  }, [set.steps, responses]);

  const handleExport = () => {
    const csv = exportResponsesAsCSV(responses, set);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${set.title.replace(/[^a-z0-9]/gi, '_')}_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div
        className="flex items-center border-b border-white/10 flex-shrink-0"
        style={{
          gap: 'min(8px, 2cqmin)',
          padding: 'min(8px, 1.5cqmin) min(12px, 2.5cqmin)',
        }}
      >
        <button
          onClick={onClose}
          className="text-slate-300 hover:text-white transition-colors"
          aria-label="Back"
        >
          <X
            style={{ width: 'min(16px, 4cqmin)', height: 'min(16px, 4cqmin)' }}
          />
        </button>
        <BarChart2
          className="text-indigo-400 flex-shrink-0"
          style={{ width: 'min(16px, 4cqmin)', height: 'min(16px, 4cqmin)' }}
        />
        <span
          className="text-white font-semibold flex-1 truncate"
          style={{ fontSize: 'min(14px, 5.5cqmin)' }}
        >
          Results: {set.title}
        </span>
        <button
          onClick={handleExport}
          disabled={responses.length === 0}
          className="flex items-center bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-lg transition-colors"
          style={{
            gap: 'min(6px, 1.5cqmin)',
            padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
            fontSize: 'min(12px, 4.5cqmin)',
          }}
        >
          <Download
            style={{ width: 'min(12px, 3cqmin)', height: 'min(12px, 3cqmin)' }}
          />
          CSV
        </button>
      </div>

      {responsesLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2
            className="text-slate-300 animate-spin"
            style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
          />
        </div>
      ) : (
        <div
          className="flex-1 overflow-y-auto flex flex-col"
          style={{
            padding: 'min(12px, 2.5cqmin)',
            gap: 'min(16px, 3.5cqmin)',
          }}
        >
          {/* Summary cards */}
          <div className="grid grid-cols-3" style={{ gap: 'min(8px, 2cqmin)' }}>
            <div
              className="bg-white/5 rounded-xl text-center"
              style={{ padding: 'min(12px, 2.5cqmin)' }}
            >
              <div
                className="font-bold text-white"
                style={{ fontSize: 'min(24px, 12cqmin)' }}
              >
                {responses.length}
              </div>
              <div
                className="text-slate-300 flex items-center justify-center"
                style={{
                  fontSize: 'min(12px, 4.5cqmin)',
                  marginTop: 'min(2px, 0.5cqmin)',
                  gap: 'min(4px, 1cqmin)',
                }}
              >
                <Users
                  style={{
                    width: 'min(12px, 3cqmin)',
                    height: 'min(12px, 3cqmin)',
                  }}
                />{' '}
                Total
              </div>
            </div>
            <div
              className="bg-white/5 rounded-xl text-center"
              style={{ padding: 'min(12px, 2.5cqmin)' }}
            >
              <div
                className="font-bold text-emerald-400"
                style={{ fontSize: 'min(24px, 12cqmin)' }}
              >
                {completedResponsesCount}
              </div>
              <div
                className="text-slate-300 flex items-center justify-center"
                style={{
                  fontSize: 'min(12px, 4.5cqmin)',
                  marginTop: 'min(2px, 0.5cqmin)',
                  gap: 'min(4px, 1cqmin)',
                }}
              >
                <CheckCircle2
                  style={{
                    width: 'min(12px, 3cqmin)',
                    height: 'min(12px, 3cqmin)',
                  }}
                />{' '}
                Done
              </div>
            </div>
            <div
              className="bg-white/5 rounded-xl text-center"
              style={{ padding: 'min(12px, 2.5cqmin)' }}
            >
              <div
                className="font-bold text-indigo-400"
                style={{ fontSize: 'min(24px, 12cqmin)' }}
              >
                {avgScore !== null ? `${avgScore}%` : '—'}
              </div>
              <div
                className="text-slate-300"
                style={{
                  fontSize: 'min(12px, 4.5cqmin)',
                  marginTop: 'min(2px, 0.5cqmin)',
                }}
              >
                Avg Score
              </div>
            </div>
          </div>

          {/* Per-question breakdown */}
          {questionSteps.length > 0 && (
            <div>
              <h3
                className="text-slate-300 font-semibold uppercase tracking-wider"
                style={{
                  fontSize: 'min(12px, 4.5cqmin)',
                  marginBottom: 'min(8px, 2cqmin)',
                }}
              >
                Question Results
              </h3>
              <div
                className="flex flex-col"
                style={{ gap: 'min(8px, 2cqmin)' }}
              >
                {questionStats.map(({ step, correct, total, pct }, idx) => (
                  <div
                    key={step.id}
                    className="bg-white/5 rounded-xl"
                    style={{ padding: 'min(12px, 2.5cqmin)' }}
                  >
                    <div
                      className="flex items-start justify-between"
                      style={{
                        gap: 'min(8px, 2cqmin)',
                        marginBottom: 'min(8px, 2cqmin)',
                      }}
                    >
                      <p
                        className="text-white font-medium flex-1"
                        style={{ fontSize: 'min(12px, 4.5cqmin)' }}
                      >
                        Q{idx + 1}: {step.question?.text}
                      </p>
                      <span
                        className={`shrink-0 font-bold ${
                          pct === null
                            ? 'text-slate-300'
                            : pct >= 70
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                        }`}
                        style={{ fontSize: 'min(12px, 4.5cqmin)' }}
                      >
                        {pct !== null ? `${pct}%` : '—'}
                      </span>
                    </div>
                    {pct !== null && (
                      <div
                        className="bg-slate-700 rounded-full overflow-hidden"
                        style={{ height: 'min(6px, 1.5cqmin)' }}
                      >
                        <div
                          className={`h-full rounded-full ${pct >= 70 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                    <p
                      className="text-slate-300"
                      style={{
                        fontSize: 'min(12px, 4.5cqmin)',
                        marginTop: 'min(4px, 1cqmin)',
                      }}
                    >
                      {correct} / {total} correct
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Student list */}
          {responses.length > 0 && (
            <div>
              <h3
                className="text-slate-300 font-semibold uppercase tracking-wider"
                style={{
                  fontSize: 'min(12px, 4.5cqmin)',
                  marginBottom: 'min(8px, 2cqmin)',
                }}
              >
                Responses
              </h3>
              <div
                className="flex flex-col"
                style={{ gap: 'min(6px, 1.5cqmin)' }}
              >
                {responseStats.map(({ response: r, qCorrect, qAnswered }) => {
                  const classLinkName = formatStudentName(
                    byStudentUid.get(r.studentAnonymousId)
                  );
                  const label =
                    classLinkName || (r.pin ? `PIN: ${r.pin}` : 'Anonymous');
                  return (
                    <div
                      key={r.studentAnonymousId}
                      className="flex items-center justify-between bg-white/5 rounded-lg"
                      style={{
                        padding: 'min(8px, 2cqmin) min(12px, 2.5cqmin)',
                      }}
                    >
                      <div>
                        <span
                          className="text-white font-medium"
                          style={{ fontSize: 'min(12px, 4.5cqmin)' }}
                        >
                          {label}
                        </span>
                        <span
                          className="text-slate-300"
                          style={{
                            fontSize: 'min(12px, 4.5cqmin)',
                            marginLeft: 'min(8px, 2cqmin)',
                          }}
                        >
                          {r.completedAt ? 'Completed' : 'In progress'}
                        </span>
                      </div>
                      {questionSteps.length > 0 && (
                        <span
                          className="text-slate-300"
                          style={{ fontSize: 'min(12px, 4.5cqmin)' }}
                        >
                          {qCorrect}/{qAnswered} correct
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {responses.length === 0 && (
            <div
              className="text-center text-slate-300"
              style={{
                fontSize: 'min(14px, 5.5cqmin)',
                padding: 'min(32px, 7cqmin) 0',
              }}
            >
              No responses yet. Share the assignment link with students.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
