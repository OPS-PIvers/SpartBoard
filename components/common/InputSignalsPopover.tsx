import React, { useContext, useMemo } from 'react';
import { MousePointerClick } from 'lucide-react';
import type { InputSignals, QuizResponseAnswer } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import {
  INPUT_SIGNALS_FEATURE,
  inputFindingsByAttempt,
} from '@/utils/inputSignals';
import { BadgePopover } from './BadgePopover';

interface InputSignalsBadgeProps {
  signals: InputSignals | undefined;
  /** Completed attempts on the response. */
  completedAttempts: number | undefined;
  completed: boolean;
  /** Pass only for self-paced sessions, where the gaps between answers are the student's own. */
  answers?: Pick<QuizResponseAnswer, 'answeredAt'>[];
  studentName: string;
  /** Renders the badge for a count of findings. */
  children: (count: number) => React.ReactNode;
}

const questionList = (qs: number[]) =>
  qs.length === 0 ? '' : ` (Q${qs.join(', Q')})`;

/**
 * A badge that opens what looked unusual about how a student's answers were
 * entered. Renders nothing without the input-signals flag or without findings.
 */
export const InputSignalsBadge: React.FC<InputSignalsBadgeProps> = ({
  signals,
  completedAttempts,
  completed,
  answers,
  studentName,
  children,
}) => {
  const enabled =
    useContext(AuthContext)?.canAccessFeature?.(INPUT_SIGNALS_FEATURE) === true;
  const attempts = useMemo(() => {
    if (!enabled) return [];
    // A submit bumps the count, so the answers on the doc are the attempt before it.
    const current = Math.max(0, (completedAttempts ?? 0) - (completed ? 1 : 0));
    return inputFindingsByAttempt(signals, current, answers);
  }, [enabled, signals, completedAttempts, completed, answers]);

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
          {attempts.map(({ attempt, findings }) => (
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
                        {questionList(f.questions)}
                      </span>
                    </p>
                    <p className="text-xs text-slate-600">
                      Could also be: {f.otherCauses}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      }
    >
      {children(count)}
    </BadgePopover>
  );
};
