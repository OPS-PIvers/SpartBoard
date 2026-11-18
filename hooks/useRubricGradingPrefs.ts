// Rubric grading auto-advance preferences (saved to the profile), with a local fallback outside AuthContext.
import { useContext, useState } from 'react';
import { AuthContext } from '@/context/AuthContextValue';

export interface RubricGradingPrefs {
  autoAdvance: boolean;
  openNext: boolean;
  setAutoAdvance: (on: boolean) => void;
  setOpenNext: (on: boolean) => void;
}

export const useRubricGradingPrefs = (): RubricGradingPrefs => {
  const auth = useContext(AuthContext);
  const [local, setLocal] = useState({ autoAdvance: false, openNext: true });
  const save = (update: {
    rubricAutoAdvance?: boolean;
    rubricOpenNext?: boolean;
  }) => {
    if (auth) {
      auth.updateAccountPreferences(update).catch(() => {
        // Kept for this session even if the profile write fails.
      });
    } else {
      setLocal((prev) => ({
        autoAdvance: update.rubricAutoAdvance ?? prev.autoAdvance,
        openNext: update.rubricOpenNext ?? prev.openNext,
      }));
    }
  };
  return {
    autoAdvance: auth?.rubricAutoAdvance ?? local.autoAdvance,
    openNext: auth?.rubricOpenNext ?? local.openNext,
    setAutoAdvance: (on) => save({ rubricAutoAdvance: on }),
    setOpenNext: (on) => save({ rubricOpenNext: on }),
  };
};
