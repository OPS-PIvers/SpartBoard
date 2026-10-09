import { useContext } from 'react';
import type { GlobalFeature } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import { QUIZ_TIME_LIMIT_FEATURE } from '@/utils/quizTimeLimit';
import type { QuizRuleGates } from './QuizRuleStepValues';

/** Reads the Quiz rule flags via context so a provider-less host hides the rows instead of throwing. */
export const useQuizRuleGates = (): QuizRuleGates => {
  const auth = useContext(AuthContext);
  const can = (id: GlobalFeature) => auth?.canAccessFeature?.(id) === true;
  return {
    timeLimitOn: can(QUIZ_TIME_LIMIT_FEATURE),
    tabAwayTimerOn: can('tab-away-timer'),
    scoreOnSubmitOn: can('quiz-score-on-submit'),
  };
};
