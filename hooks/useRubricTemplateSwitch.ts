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
      const changes = before !== after;
      const message = [
        hasLevelText && 'This change will remove level names and descriptions.',
        changes &&
          `${hasLevelText ? 'Additionally, the' : 'The'} total score will change from ${before} to ${after}.`,
      ]
        .filter(Boolean)
        .join(' ');
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
