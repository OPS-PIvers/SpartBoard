import { useContext } from 'react';
import type { Rubric } from '@/types';
import { DialogContext } from '@/context/DialogContextValue';
import { convertRubricTemplate, isScoringGuide } from '@/utils/rubricGuide';

/** Converts a draft between levels and a scoring guide, confirming first when wording would be lost. */
export const useRubricTemplateSwitch = (
  draft: Rubric | null,
  setDraft: (update: (prev: Rubric) => Rubric) => void
) => {
  // Optional so hosts without a DialogProvider (the Classroom add-on grader) still switch.
  const showConfirm =
    useContext(DialogContext)?.showConfirm ?? (() => Promise.resolve(true));
  return async (toGuide: boolean) => {
    if (!draft || toGuide === isScoringGuide(draft)) return;
    const hasLevelText = draft.criteria.some((c) =>
      c.levels.some((l) => l.label.trim() || l.description?.trim())
    );
    if (toGuide && hasLevelText) {
      const ok = await showConfirm(
        'A scoring guide scores each part from 0 to its points, so level labels and descriptions are removed.',
        {
          title: 'Switch to a scoring guide?',
          variant: 'warning',
          confirmLabel: 'Switch',
        }
      );
      if (!ok) return;
    }
    if (!toGuide && draft.criteria.some((c) => c.guide?.examples?.length)) {
      const ok = await showConfirm(
        'Levels rubrics have no example responses, so the examples are removed.',
        {
          title: 'Switch to levels?',
          variant: 'warning',
          confirmLabel: 'Switch',
        }
      );
      if (!ok) return;
    }
    setDraft((prev) => convertRubricTemplate(prev, toGuide));
  };
};
