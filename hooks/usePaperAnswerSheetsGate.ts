/** Paper answer sheets need both the org rollout switch and the `paper-answer-sheets` flag. */

import { useAuth } from '@/context/useAuth';
import { usePaperAnswerSheetsSettings } from './usePaperAnswerSheetsSettings';

export function usePaperAnswerSheetsGate(): boolean {
  const { canAccessFeature } = useAuth();
  const flagOn = canAccessFeature('paper-answer-sheets');
  const rollout = usePaperAnswerSheetsSettings(flagOn);
  return flagOn && rollout.enabled;
}
