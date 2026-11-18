import { useContext } from 'react';
import type { Rubric } from '@/types';
import { DialogContext } from '@/context/DialogContextValue';
import { convertRubricTemplate, isScoringGuide } from '@/utils/rubricGuide';
import { rubricMaxPoints } from '@/utils/rubricPoints';

/** Converts a draft between levels and a scoring guide, confirming first when wording or points would change. */
export const useRubricTemplateSwitch = (
  draft: Rubric | null,
  onConverted: (next: Rubric) => void
) => {
  // Optional so hosts without a DialogProvider (the Classroom add-on grader) still switch.
  const showConfirm =
    useContext(DialogContext)?.showConfirm ?? (() => Promise.resolve(true));
  return async (toGuide: boolean) => {
    if (!draft || toGuide === isScoringGuide(draft)) return;
    const next = convertRubricTemplate(draft, toGuide);
    if (toGuide) {
      const hasLevelText = draft.criteria.some((c) =>
        c.levels.some((l) => l.label.trim() || l.description?.trim())
      );
      const before = rubricMaxPoints(draft);
      const after = rubricMaxPoints(next);
      const message =
        before !== after
          ? hasLevelText
            ? `Level labels and descriptions are removed, and parts become whole points up to 5, so the total changes from ${before} to ${after}.`
            : `Scoring guide parts are whole points up to 5, so this rubric's total changes from ${before} to ${after} points.`
          : hasLevelText
            ? 'A scoring guide scores each part from 0 to its points, so level labels and descriptions are removed.'
            : null;
      if (message) {
        const ok = await showConfirm(message, {
          title: 'Switch to a scoring guide?',
          variant: 'warning',
          confirmLabel: 'Switch',
        });
        if (!ok) return;
      }
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
    onConverted(next);
  };
};
