import { useCallback, useState } from 'react';
import type { QuestionTargetTag } from '@/types';
import { useAuth } from '@/context/useAuth';
import { loadCatalog } from '@/hooks/useStandardsCatalog';
import { tagFromBenchmark } from '@/utils/learningTargets';
import { logError } from '@/utils/logError';
import {
  findStandardRuns,
  indexByCode,
  takeStandardsFromText,
} from '@/utils/standardsInText';

interface Taken {
  questionId: string;
  codes: string[];
  before: { text: string; targets: QuestionTargetTag[] | undefined };
}

interface Patch {
  text: string;
  targets: QuestionTargetTag[] | undefined;
}

/** Moves standard codes typed in a question prompt into its Learning targets when the prompt loses focus. */
export function useStandardsFromPrompt(
  updateQuestion: (id: string, patch: Patch) => void,
  currentText: () => string | undefined
) {
  const { canAccessFeature, subjectsTaught, effectiveGrades } = useAuth();
  const enabled = canAccessFeature('standards-from-question-text');
  const [taken, setTaken] = useState<Taken | null>(null);

  const onPromptBlur = useCallback(
    async (
      questionId: string,
      text: string,
      targets: QuestionTargetTag[] | undefined
    ) => {
      if (!enabled || findStandardRuns(text).length === 0) return;
      let benchmarks;
      try {
        benchmarks = await loadCatalog();
      } catch (err) {
        logError('standards-from-question-text', err);
        return;
      }
      // The teacher typed again or moved on while the catalog loaded.
      if (currentText() !== text) return;
      const out = takeStandardsFromText(text, indexByCode(benchmarks), {
        subjects: subjectsTaught,
        grades: effectiveGrades,
      });
      if (out.matched.length === 0) return;
      const have = targets ?? [];
      const added = out.matched
        .map(tagFromBenchmark)
        .filter((tag) => !have.some((t) => t.id === tag.id));
      updateQuestion(questionId, {
        text: out.text,
        targets: [...have, ...added].length ? [...have, ...added] : undefined,
      });
      setTaken({
        questionId,
        codes: out.matched.map((b) => b.code),
        before: { text, targets },
      });
    },
    [enabled, currentText, subjectsTaught, effectiveGrades, updateQuestion]
  );

  const undo = useCallback(() => {
    if (!taken) return;
    updateQuestion(taken.questionId, taken.before);
    setTaken(null);
  }, [taken, updateQuestion]);

  return { taken, onPromptBlur, undo, dismiss: () => setTaken(null) };
}
