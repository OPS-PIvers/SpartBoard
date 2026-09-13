p = 'hooks/useQuizAssignments.ts'
s = open(p).read()

def sub(o, n):
    global s
    assert o in s, 'NOT FOUND: ' + o[:120]
    s = s.replace(o, n, 1)

sub("""  /** Frozen bank pools; the session's `totalQuestions` becomes fixed + Σ count. */
  bankSlots?: QuizSessionBankSlot[];
}""",
    """  /** Frozen bank pools; the session's `totalQuestions` becomes fixed + Σ count. */
  bankSlots?: QuizSessionBankSlot[];
  /** `QuizMetadata.translations` — lets publish load sidecars with zero extra reads (§4.2). */
  translationIndex?: Record<string, QuizTranslationIndexEntry>;
}""")

sub("""        openAt,
        closeAt,
        bankSlots,
      } = options ?? {};""",
    """        openAt,
        closeAt,
        bankSlots,
        translationIndex,
      } = options ?? {};""")

sub("""      const sessionPublicQuestions = sessionQuestions.map((q) =>
        projectPublicQuestionForMode(q, mode, opts.showLearningTargets)
      );""",
    """      // Translations ride the projection so locale strings share the English shuffle (§4.2).
      // Bank-slot quizzes are never translated (D29).
      const targetedLocaleCountByCode = hasBankSlots
        ? {}
        : targetedLocaleCounts(overridesBySourcedId);
      const translations = await loadTranslationsForPublish(
        translationLoader(),
        translationIndex,
        Object.keys(targetedLocaleCountByCode),
        sessionQuestions
      );
      const sessionPublicQuestions = sessionQuestions.map((q) =>
        projectPublicQuestionForMode(
          q,
          mode,
          opts.showLearningTargets,
          translations.byLocale,
          translations.freshQuestionIdsByLocale
        )
      );""")

sub("""        ...(quiz.language ? { language: quiz.language } : {}),""",
    """        ...(quiz.language ? { language: quiz.language } : {}),
        ...(Object.keys(translations.titleByLocale).length > 0
          ? { quizTitleLocalized: { ...translations.titleByLocale } }
          : {}),""")

open(p, 'w').write(s)
print('publish wiring applied')
