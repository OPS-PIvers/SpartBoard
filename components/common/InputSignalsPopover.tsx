import React, { useContext, useMemo } from 'react';
import { MousePointerClick } from 'lucide-react';
import type { InputSignals, QuizResponseAnswer } from '@/types';
import type { ReadingContext } from '@/utils/inputSignals';
import { AuthContext } from '@/context/AuthContextValue';
import {
  INPUT_SIGNALS_FEATURE,
  MANAGED_PROFILE_FEATURE,
  formatFindingQuestions,
  inputFindingsByAttempt,
} from '@/utils/inputSignals';
import {
  applyInputSignSettings,
  hiddenFindings,
  readInputSignSettings,
} from '@/utils/inputSignalSettings';
import { BadgePopover } from './BadgePopover';

interface InputSignalsBadgeProps {
  signals: InputSignals | undefined;
  /** Completed attempts on the response. */
  completedAttempts: number | undefined;
  completed: boolean;
  /** Pass only for self-paced sessions, where the gaps between answers are the student's own. */
  answers?: Pick<QuizResponseAnswer, 'answeredAt'>[];
  /** Words to read on each question, by id; with `allAnswers` it flags answers given faster than reading. */
  questionWords?: ReadingContext['words'];
  allAnswers?: Pick<QuizResponseAnswer, 'questionId'>[];
  studentName: string;
  /** Question ids in the quiz's own order, to number them; omit where that order isn't known. */
  questionOrder?: readonly string[];
  /** Renders the badge for a count of findings. */
  children: (count: number) => React.ReactNode;
}

/** A badge that opens what looked unusual about how answers were entered; nothing without the flag or findings. */
export const InputSignalsBadge: React.FC<InputSignalsBadgeProps> = ({
  signals,
  completedAttempts,
  completed,
  answers,
  questionWords,
  allAnswers,
  studentName,
  questionOrder,
  children,
}) => {
  const auth = useContext(AuthContext);
  const enabled = auth?.canAccessFeature?.(INPUT_SIGNALS_FEATURE) === true;
  const expectManaged =
    auth?.canAccessFeature?.(MANAGED_PROFILE_FEATURE) === true;
  const isAdmin = auth?.isAdmin === true;
  const settings = useMemo(
    () => readInputSignSettings(auth?.globalPermissions),
    [auth?.globalPermissions]
  );
  const attempts = useMemo(() => {
    if (!enabled) return [];
    // A submit bumps the count, so the answers on the doc are the attempt before it.
    const current = Math.max(0, (completedAttempts ?? 0) - (completed ? 1 : 0));
    const reading =
      questionWords && allAnswers
        ? {
            words: questionWords,
            answered: new Set(allAnswers.map((a) => a.questionId)),
          }
        : undefined;
    return applyInputSignSettings(
      inputFindingsByAttempt(
        signals,
        current,
        answers,
        reading,
        expectManaged,
        hiddenFindings(settings, isAdmin)
      ),
      settings,
      isAdmin
    );
  }, [
    settings,
    isAdmin,
    enabled,
    signals,
    completedAttempts,
    completed,
    answers,
    questionWords,
    allAnswers,
    expectManaged,
  ]);

  const count = attempts.reduce((n, a) => n + a.findings.length, 0);
  if (count === 0) return null;

  return (
    <BadgePopover
      triggerLabel={`Show unusual input for ${studentName}`}
      dialogLabel={`Unusual input for ${studentName}`}
      panel={
        <>
          <p className="mb-1 flex items-center gap-1.5 font-bold text-slate-800">
            <MousePointerClick aria-hidden className="h-4 w-4 shrink-0" />
            Unusual input
          </p>
          <p className="mb-2 text-xs text-slate-600">
            Signs that another app may have entered answers. Each has innocent
            causes, so treat these as a reason to talk, not as proof.
          </p>
          {attempts.map(({ attempt, findings, browsers }) => (
            <div key={attempt} className="mt-2">
              {attempts.length > 1 && (
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Attempt {attempt + 1}
                </p>
              )}
              <ul className="space-y-2">
                {findings.map((f) => (
                  <li key={f.id} className="border-t border-slate-100 pt-2">
                    <p className="font-semibold text-slate-800">
                      {f.text}
                      <span className="font-normal text-slate-600">
                        {formatFindingQuestions(f.questions, questionOrder)}
                      </span>
                    </p>
                    <p className="text-xs text-slate-600">
                      Could also be: {f.otherCauses}
                    </p>
                    {f.hidden && (
                      <p className="text-xs font-semibold text-slate-500">
                        Hidden from teachers
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              {browsers.length > 0 && (
                <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
                  Browser: {browsers.join('; ')}
                </p>
              )}
            </div>
          ))}
        </>
      }
    >
      {children(count)}
    </BadgePopover>
  );
};
