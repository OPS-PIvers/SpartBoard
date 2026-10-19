import { useAuth } from '@/context/useAuth';
import { usePaperAnswerSheetsSettings } from '@/hooks/usePaperAnswerSheetsSettings';

/** Scored paper work needs the district paper switch plus both feature gates. */
export function useScoredWorkAccess(): boolean {
  const { canAccessFeature } = useAuth();
  const rollout = usePaperAnswerSheetsSettings();
  return (
    rollout.enabled &&
    canAccessFeature('paper-answer-sheets') &&
    canAccessFeature('paper-scored-work')
  );
}
