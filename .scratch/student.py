import re, sys
p = 'components/quiz/QuizStudentApp.tsx'
s = open(p).read()
orig = s

def sub(old, new, count=1):
    global s
    assert s.count(old) >= 1, 'NOT FOUND: ' + old[:120]
    s = s.replace(old, new, count)

# ── imports ────────────────────────────────────────────────────────────────
sub("import { ReadAloudToolbar } from './readAloud/ReadAloudToolbar';",
    "import { StudentAccommodationBar } from './StudentAccommodationBar';")

sub("""  toCanonicalAnswer,
  toDisplayAnswer,""",
    """  toCanonicalAnswer,
  toDisplayAnswer,""")

# ── activeLocale + display question ────────────────────────────────────────
sub("""  // PR1 is dark: the locale toggle and the pointer's `language` land in PR3.
  const activeLocale: string | undefined = undefined;
""",
    """  // The student's accommodation language; the toggle resets to it on advance (§4.6).
  const assignedLocale = override?.language;
  const currentQidForLocale = currentQuestion?.id ?? null;
  const [localeChoice, setLocaleChoice] = useState<{
    qid: string | null;
    locale: string | undefined;
  }>({ qid: currentQidForLocale, locale: assignedLocale });
  if (
    localeChoice.qid !== currentQidForLocale ||
    (localeChoice.locale !== undefined && localeChoice.locale !== assignedLocale)
  ) {
    setLocaleChoice({ qid: currentQidForLocale, locale: assignedLocale });
  }
  const activeLocale = localeChoice.locale;
  // Per-question English fallback: a question with no reviewed translation just renders English.
  const localizedStrings = currentQuestion
    ? serveLocalizedQuestion(currentQuestion, activeLocale)
    : null;
  const localeAvailable =
    !!assignedLocale &&
    !!currentQuestion &&
    serveLocalizedQuestion(currentQuestion, assignedLocale) !== null;
  const displayQuestion = currentQuestion
    ? applyLocalizedStrings(currentQuestion, localizedStrings)
    : currentQuestion;
""")

# ── read-aloud suppression (§4.7) ──────────────────────────────────────────
sub("""  const readAloud = useQuizReadAloud({
    enabled: readAloudRequested === true && isStudentPaced,""",
    """  const readAloud = useQuizReadAloud({
    // D25: no speaker on a localized rendering; it returns on the English toggle.
    enabled:
      readAloudRequested === true && isStudentPaced && localizedStrings === null,""")

# ── the accommodation bar ──────────────────────────────────────────────────
sub("""      {readAloudOn && <ReadAloudToolbar controller={readAloud} />}""",
    """      {(readAloudOn || localeAvailable) && (
        <StudentAccommodationBar
          readAloud={readAloudOn ? readAloud : undefined}
          locale={
            localeAvailable && assignedLocale
              ? {
                  nativeLabel: languageNativeLabel(assignedLocale),
                  localized: activeLocale !== undefined,
                  onChange: (localized) =>
                    setLocaleChoice({
                      qid: currentQidForLocale,
                      locale: localized ? assignedLocale : undefined,
                    }),
                }
              : undefined
          }
        />
      )}""")

# ── locale stamping on every write path ────────────────────────────────────
sub("""  const onAnswerRef = useRef(onAnswer);
  onAnswerRef.current = onAnswer;""",
    """  // `locale` is per-call (D18): stamped only while a localized rendering is on screen.
  const answerLocaleRef = useRef<{ qid: string | null; locale?: string }>({
    qid: null,
  });
  answerLocaleRef.current = {
    qid: currentQidForLocale,
    locale: localizedStrings ? activeLocale : undefined,
  };
  const onAnswerRef = useRef(onAnswer);
  onAnswerRef.current = (qId, answer, speedBonus, opts) => {
    const stamp =
      answerLocaleRef.current.qid === qId
        ? answerLocaleRef.current.locale
        : undefined;
    return onAnswer(
      qId,
      answer,
      speedBonus,
      stamp ? { ...opts, locale: stamp } : opts
    );
  };""")

sub("""    opts?: { isDraft?: boolean; timedOutUnderMinimum?: boolean }
  ) => Promise<void>;
  /** Appends one committed take;""",
    """    opts?: {
      isDraft?: boolean;
      timedOutUnderMinimum?: boolean;
      locale?: string;
    }
  ) => Promise<void>;
  /** Appends one committed take;""")

# direct onAnswer calls route through the ref so they carry the stamp too
sub("    await onAnswer(currentQuestion.id, answer, computedSpeedBonus);",
    "    await onAnswerRef.current(currentQuestion.id, answer, computedSpeedBonus);")
sub("          await onAnswer(currentQuestion.id, answer, computedSpeedBonus);",
    "          await onAnswerRef.current(\n            currentQuestion.id,\n            answer,\n            computedSpeedBonus\n          );")

open(p, 'w').write(s)
print('student edits applied')
