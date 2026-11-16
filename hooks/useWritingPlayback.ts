import { useContext } from 'react';
import type { InputSignals } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import {
  INPUT_SIGNALS_FEATURE,
  readAttemptSignals,
} from '@/utils/inputSignals';
import {
  isSignShown,
  readInputSignSettings,
} from '@/utils/inputSignalSettings';

/** Whether this viewer sees writing playback, and which signs inside it stay hidden. */
export const useWritingPlaybackAccess = () => {
  const auth = useContext(AuthContext);
  const signs = readInputSignSettings(auth?.globalPermissions);
  const isAdmin = auth?.isAdmin === true;
  const hidden = !isSignShown(signs, 'writing-playback');
  return {
    enabled:
      auth?.canAccessFeature?.(INPUT_SIGNALS_FEATURE) === true &&
      (!hidden || isAdmin),
    hidden,
    hidePasted: !isAdmin && !isSignShown(signs, 'pasted'),
    hideUnkeyed: !isAdmin && !isSignShown(signs, 'unkeyed-text'),
  };
};

/** One written answer's edit log for the grader, or null when this viewer can't see playback or none was recorded. */
export const useAnswerWritingLog = (
  signals: InputSignals | undefined,
  attempt: number,
  questionId: string | undefined
) => {
  const access = useWritingPlaybackAccess();
  const log =
    access.enabled && questionId
      ? readAttemptSignals(signals, attempt)[questionId]?.log
      : undefined;
  return log ? { ...access, log } : null;
};

export type AnswerWritingLog = NonNullable<
  ReturnType<typeof useAnswerWritingLog>
>;
