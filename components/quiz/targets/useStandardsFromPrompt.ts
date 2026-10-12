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
  before: Patch;
  after: Patch;
}

interface Patch {
  text: string;
  targets: QuestionTargetTag[] | undefined;
}

/** Moves standard codes typed in a question prompt into its Learning targets when the prompt loses focus. */
export function useStandardsFromPrompt(
  updateQuestion: (id: string, patch: Patch) => void,
  currentText: () => string | undefined,
  currentTargets: () => QuestionTargetTag[] | undefined
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
      if (currentText() !== text || currentTargets() !== targets) return;
      const out = takeStandardsFromText(text, indexByCode(benchmarks), {
        subjects: subjectsTaught,
        grades: effectiveGrades,
      });
      if (out.matched.length === 0) return;
      const have = targets ?? [];
      const added = out.matched
        .map(tagFromBenchmark)
        .filter((tag) => !have.some((t) => t.id === tag.id));
      const after = {
        text: out.text,
        targets: [...have, ...added].length ? [...have, ...added] : undefined,
      };
      updateQuestion(questionId, after);
      setTaken({
        questionId,
        codes: out.matched.map((b) => b.code),
        before: { text, targets },
        after,
      });
    },
    [
      enabled,
      currentText,
      currentTargets,
      subjectsTaught,
      effectiveGrades,
      updateQuestion,
    ]
  );

  /** Undo is offered only while the question is exactly as tagging left it. */
  const isCurrent = (
    questionId: string,
    text: string,
    targets: QuestionTargetTag[] | undefined
  ) =>
    taken?.questionId === questionId &&
    taken.after.text === text &&
    JSON.stringify(taken.after.targets) === JSON.stringify(targets);

  const undo = useCallback(() => {
    if (!taken) return;
    if (
      currentText() === taken.after.text &&
      JSON.stringify(currentTargets()) === JSON.stringify(taken.after.targets)
    )
      updateQuestion(taken.questionId, taken.before);
    setTaken(null);
  }, [taken, currentText, currentTargets, updateQuestion]);

  return {
    taken,
    isCurrent,
    onPromptBlur,
    undo,
    dismiss: () => setTaken(null),
  };
}
