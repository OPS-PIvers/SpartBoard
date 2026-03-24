import React, { useEffect } from 'react';
import {
  BarChart2,
  Download,
  X,
  Users,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { GuidedLearningSet } from '@/types';
import {
  useGuidedLearningSessionTeacher,
  isAnswerCorrect,
} from '@/hooks/useGuidedLearningSession';

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

  const questionSteps = set.steps.filter(
    (s) => s.interactionType === 'question' && s.question
  );

  const completedResponses = responses.filter((r) => r.completedAt !== null);

  // Compute avg score from answer keys rather than trusting client-provided scores
  const avgScore = (() => {
    if (completedResponses.length === 0 || questionSteps.length === 0)
      return null;
    const total = completedResponses.reduce((sum, r) => {
      const correct = questionSteps.filter((step) => {
        const a = r.answers.find((ans) => ans.stepId === step.id);
        return a ? isAnswerCorrect(step, a.answer) : false;
      }).length;
      return sum + Math.round((correct / questionSteps.length) * 100);
    }, 0);
    return Math.round(total / completedResponses.length);
  })();

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
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 flex-shrink-0">
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors"
          aria-label="Back"
        >
          <X className="w-4 h-4" />
        </button>
        <BarChart2 className="w-4 h-4 text-indigo-400 flex-shrink-0" />
        <span className="text-white font-semibold text-sm flex-1 truncate">
          Results: {set.title}
        </span>
        <button
          onClick={handleExport}
          disabled={responses.length === 0}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-xs rounded-lg transition-colors"
        >
          <Download className="w-3 h-3" />
          CSV
        </button>
      </div>

      {responsesLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-white">
                {responses.length}
              </div>
              <div className="text-slate-400 text-xs mt-0.5 flex items-center justify-center gap-1">
                <Users className="w-3 h-3" /> Total
              </div>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-emerald-400">
                {completedResponses.length}
              </div>
              <div className="text-slate-400 text-xs mt-0.5 flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Done
              </div>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-indigo-400">
                {avgScore !== null ? `${avgScore}%` : '—'}
              </div>
              <div className="text-slate-400 text-xs mt-0.5">Avg Score</div>
            </div>
          </div>

          {/* Per-question breakdown */}
          {questionSteps.length > 0 && (
            <div>
              <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">
                Question Results
              </h3>
              <div className="space-y-2">
                {questionSteps.map((step, idx) => {
                  const stepAnswers = responses.flatMap((r) =>
                    r.answers.filter((a) => a.stepId === step.id)
                  );
                  // Recompute correctness from the teacher's answer key
                  const correct = stepAnswers.filter((a) =>
                    isAnswerCorrect(step, a.answer)
                  ).length;
                  const pct =
                    stepAnswers.length > 0
                      ? Math.round((correct / stepAnswers.length) * 100)
                      : null;

                  return (
                    <div key={step.id} className="bg-white/5 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-white text-xs font-medium flex-1">
                          Q{idx + 1}: {step.question?.text}
                        </p>
                        <span
                          className={`shrink-0 text-xs font-bold ${
                            pct === null
                              ? 'text-slate-500'
                              : pct >= 70
                                ? 'text-emerald-400'
                                : 'text-amber-400'
                          }`}
                        >
                          {pct !== null ? `${pct}%` : '—'}
                        </span>
                      </div>
                      {pct !== null && (
                        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct >= 70 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                      <p className="text-slate-500 text-xs mt-1">
                        {correct} / {stepAnswers.length} correct
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Student list */}
          {responses.length > 0 && (
            <div>
              <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">
                Responses
              </h3>
              <div className="space-y-1.5">
                {responses.map((r) => {
                  const qCorrect = questionSteps.filter((step) => {
                    const a = r.answers.find((ans) => ans.stepId === step.id);
                    return a ? isAnswerCorrect(step, a.answer) : false;
                  }).length;
                  const qAnswered = questionSteps.filter((step) =>
                    r.answers.some((ans) => ans.stepId === step.id)
                  ).length;
                  return (
                    <div
                      key={r.studentAnonymousId}
                      className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2"
                    >
                      <div>
                        <span className="text-white text-xs font-medium">
                          {r.pin ? `PIN: ${r.pin}` : 'Anonymous'}
                        </span>
                        <span className="text-slate-500 text-xs ml-2">
                          {r.completedAt ? 'Completed' : 'In progress'}
                        </span>
                      </div>
                      {questionSteps.length > 0 && (
                        <span className="text-slate-300 text-xs">
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
            <div className="text-center text-slate-500 text-sm py-8">
              No responses yet. Share the assignment link with students.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
