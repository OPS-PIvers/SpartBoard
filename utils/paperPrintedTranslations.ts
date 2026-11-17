// Loads each printed group's language for its test paper, with the same review and freshness gate the device uses.
import type {
  QuestionTranslation,
  QuizData,
  QuizTranslationIndexEntry,
} from '@/types';
import type { PrintedGroupPick } from '@/components/common/library/assignStepper/modificationGroups';
import {
  loadTranslationsForPublish,
  type TranslationLoader,
} from './quizTranslationPublish';
import {
  printedTranslation,
  type PrintedTranslation,
} from './paperPrintedVersions';

/** One entry per pick, in order; undefined where the group prints in English. */
export async function printedGroupTranslations(
  quiz: QuizData,
  picks: readonly PrintedGroupPick[],
  index: Record<string, QuizTranslationIndexEntry> | undefined,
  loader: TranslationLoader | null
): Promise<(PrintedTranslation | undefined)[]> {
  const locales = [
    ...new Set(
      picks.flatMap((p) => (p.group.language ? [p.group.language] : []))
    ),
  ];
  if (locales.length === 0) return picks.map(() => undefined);
  try {
    const loaded = await loadTranslationsForPublish(
      loader,
      index,
      locales,
      quiz.questions
    );
    return picks.map((p) => {
      const code = p.group.language;
      const payload = code ? loaded.byLocale[code] : undefined;
      if (!code || !payload) return undefined;
      const fresh = loaded.freshQuestionIdsByLocale[code];
      const entries: Record<string, QuestionTranslation> = {};
      for (const q of quiz.questions) {
        const entry = payload.questions?.[q.id];
        if (
          entry &&
          payload.reviewedQuestionIds?.includes(q.id) &&
          fresh?.has(q.id)
        )
          entries[q.id] = entry;
      }
      return printedTranslation(
        quiz,
        entries,
        p.group,
        loaded.titleByLocale[code]
      );
    });
  } catch (err) {
    console.warn('[paperPrintedTranslations] printing in English:', err);
    return picks.map(() => undefined);
  }
}
