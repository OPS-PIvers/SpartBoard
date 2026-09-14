import { useContext, useMemo } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import {
  DEFAULT_QUIZ_HAND_RAISE_MODE,
  readQuizHandRaiseMode,
  type QuizHandRaiseMode,
} from '@/utils/quizHandRaise';

/** The current user's building-scoped admin raise-hand gate for quizzes. */
export function useQuizHandRaiseMode(): QuizHandRaiseMode {
  // useContext rather than useAuth() so a provider-less render falls back to the default.
  const auth = useContext(AuthContext);
  const permissions = auth?.featurePermissions;
  const buildingIds = auth?.selectedBuildings;
  return useMemo(() => {
    if (!permissions) return DEFAULT_QUIZ_HAND_RAISE_MODE;
    return readQuizHandRaiseMode(permissions, buildingIds);
  }, [permissions, buildingIds]);
}
