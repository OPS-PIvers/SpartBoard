import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  RotateCcw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  FlashcardAnswerLogEntry,
  FlashcardCard,
  FlashcardSide,
  FlashcardTestType,
} from '@/types';
import { matchFlashcardAnswer } from '@/utils/flashcardMatch';
import { getFlashcardAnswerCharacters } from '@/config/flashcardCharBars';
import { CharacterBar } from './PlayerPrimitives';
import { cx, getFlashcardSides } from './playerUtils';

interface TestModeProps {
  cards: FlashcardCard[];
  round: number;
  showFirst: FlashcardSide;
  termLanguage: string;
  definitionLanguage: string;
  strict: boolean;
  testTypes: FlashcardTestType[];
  testCount: number | 'all';
  dark: boolean;
  seed?: string;
  onRecordBatch: (answers: Array<{ cardId: string; correct: boolean }>) => void;
  onComplete?: (result: {
    types: FlashcardTestType[];
    count: number;
    score: number;
  }) => void;
  /** Check · Test: one attempt, graded by the server instead of reviewed here. */
  check?: TestModeCheck;
}

export interface TestModeCheck {
  submitting: boolean;
  error?: string | null;
  onSubmit: (answerLog: FlashcardAnswerLogEntry[]) => void;
}

interface TestQuestion {
  id: string;
  card: FlashcardCard;
  type: FlashcardTestType;
  options: string[];
}

interface TestResult {
  cardId: string;
  prompt: string;
  response: string;
  expected: string;
  correct: boolean;
}

const hash = (value: string): number => {
  let result = 0;
  for (const character of value) {
    result = Math.imul(result ^ (character.codePointAt(0) ?? 0), 16777619);
  }
  return result >>> 0;
};

const stableShuffle = <T,>(items: T[], seed: string): T[] =>
  [...items].sort(
    (left, right) =>
      hash(`${seed}:${JSON.stringify(left)}`) -
      hash(`${seed}:${JSON.stringify(right)}`)
  );

const buildQuestions = (
  cards: FlashcardCard[],
  showFirst: FlashcardSide,
  testTypes: FlashcardTestType[],
  testCount: number | 'all',
  seed: string
): TestQuestion[] => {
  const enabled =
    cards.length < 4 ? testTypes.filter((type) => type !== 'mc') : testTypes;
  const usableTypes: FlashcardTestType[] =
    enabled.length > 0 ? enabled : ['fib'];
  const count =
    testCount === 'all' ? cards.length : Math.min(testCount, cards.length);
  const selected = stableShuffle(cards, `${seed}:cards`).slice(0, count);
  return selected.map((card, index) => {
    const type = usableTypes[index % usableTypes.length] ?? 'fib';
    const answer = getFlashcardSides(card, showFirst).answer;
    const distractors = stableShuffle(
      [
        ...new Set(
          cards
            .filter((candidate) => candidate.id !== card.id)
            .map((candidate) => getFlashcardSides(candidate, showFirst).answer)
            .filter((candidate) => candidate !== answer)
        ),
      ],
      `${seed}:${card.id}:distractors`
    ).slice(0, 3);
    return {
      id: `${card.id}:${type}`,
      card,
      type,
      options:
        type === 'mc'
          ? stableShuffle(
              [answer, ...distractors],
              `${seed}:${card.id}:options`
            )
          : [],
    };
  });
};

interface FibAnswerProps {
  question: TestQuestion;
  value: string;
  characters: readonly string[];
  dark: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}

const FibAnswer: React.FC<FibAnswerProps> = ({
  question,
  value,
  characters,
  dark,
  disabled,
  onChange,
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="sr-only" htmlFor={`test-answer-${question.id}`}>
        {t('flashcards.write.placeholder')}
      </label>
      <input
        ref={inputRef}
        id={`test-answer-${question.id}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        placeholder={t('flashcards.write.placeholder')}
        className={cx(
          'w-full rounded-xl border-2 font-bold outline-none transition placeholder:opacity-100 focus:ring-4 disabled:opacity-70',
          dark
            ? 'border-white/15 bg-slate-950/60 text-white placeholder:text-white/60 focus:border-cyan-300 focus:ring-cyan-300/20'
            : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-600 focus:border-rose-400 focus:ring-rose-200'
        )}
        style={{
          padding: 'min(11px, 2.5cqmin) min(14px, 3cqmin)',
          fontSize: 'min(14px, 3.5cqmin)',
        }}
      />
      {!disabled && (
        <div style={{ marginTop: 'min(8px, 1.8cqmin)' }}>
          <CharacterBar
            characters={characters}
            inputRef={inputRef}
            value={value}
            onChange={onChange}
            dark={dark}
          />
        </div>
      )}
    </div>
  );
};

export const TestMode: React.FC<TestModeProps> = ({
  cards,
  round,
  showFirst,
  termLanguage,
  definitionLanguage,
  strict,
  testTypes,
  testCount,
  dark,
  seed = 'test',
  onRecordBatch,
  onComplete,
  check,
}) => {
  const { t } = useTranslation();
  const isCheck = Boolean(check);
  const checkRecordedRef = useRef(false);
  const [cycle, setCycle] = useState(0);
  const [retakeIds, setRetakeIds] = useState<string[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<TestResult[] | null>(null);
  const pool = useMemo(
    () =>
      retakeIds ? cards.filter((card) => retakeIds.includes(card.id)) : cards,
    [cards, retakeIds]
  );
  const questions = useMemo(
    () =>
      buildQuestions(
        pool,
        showFirst,
        testTypes,
        retakeIds ? 'all' : testCount,
        isCheck ? seed : `${seed}:${round}:${cycle}`
      ),
    [
      isCheck,
      cycle,
      pool,
      retakeIds,
      round,
      seed,
      showFirst,
      testCount,
      testTypes,
    ]
  );
  const answerLanguage =
    showFirst === 'term' ? definitionLanguage : termLanguage;
  const characters = useMemo(
    () =>
      getFlashcardAnswerCharacters(
        answerLanguage,
        cards.map((card) => getFlashcardSides(card, showFirst).answer)
      ),
    [answerLanguage, cards, showFirst]
  );
  const allAnswered = questions.every(
    (question) => (answers[question.id] ?? '').trim().length > 0
  );

  const submit = (): void => {
    if (!allAnswered || check?.submitting) return;
    const nextResults = questions.map((question) => {
      const sides = getFlashcardSides(question.card, showFirst);
      const response = answers[question.id] ?? '';
      if (question.type === 'mc') {
        return {
          cardId: question.card.id,
          prompt: sides.prompt,
          response,
          expected: sides.answer,
          correct: response === sides.answer,
        };
      }
      const match = matchFlashcardAnswer(response, sides.answer, {
        language: answerLanguage,
        strict,
      });
      return {
        cardId: question.card.id,
        prompt: sides.prompt,
        response,
        expected: match.expected,
        correct: match.result !== 'wrong',
      };
    });
    if (!check || !checkRecordedRef.current) {
      checkRecordedRef.current = true;
      onRecordBatch(
        nextResults.map(({ cardId, correct }) => ({ cardId, correct }))
      );
    }
    if (check) {
      check.onSubmit(
        questions.map((question) => ({
          cardId: question.card.id,
          type: question.type,
          response: answers[question.id] ?? '',
        }))
      );
      return;
    }
    onComplete?.({
      types: [...new Set(questions.map((question) => question.type))],
      count: nextResults.length,
      score: nextResults.filter((result) => result.correct).length,
    });
    setResults(nextResults);
  };

  const startTest = (missedOnly: boolean): void => {
    setRetakeIds(
      missedOnly && results
        ? results
            .filter((result) => !result.correct)
            .map((result) => result.cardId)
        : null
    );
    setAnswers({});
    setResults(null);
    setCycle((current) => current + 1);
  };

  if (questions.length === 0) return null;

  if (results) {
    const score = results.filter((result) => result.correct).length;
    const missed = results.filter((result) => !result.correct);
    return (
      <div className="h-full w-full overflow-y-auto bg-transparent">
        <div
          className="mx-auto w-full max-w-3xl"
          style={{ padding: 'min(18px, 4cqmin)' }}
        >
          <header
            className={cx(
              'rounded-[min(26px,5cqmin)] border text-center shadow-xl',
              dark
                ? 'border-white/15 bg-slate-950/55 text-white'
                : 'border-slate-200 bg-white text-slate-900'
            )}
            style={{ padding: 'min(28px, 6cqmin)' }}
          >
            <p
              className={cx(
                'font-black',
                dark ? 'text-cyan-200' : 'text-rose-700'
              )}
              style={{ fontSize: 'min(13px, 3.4cqmin)' }}
            >
              {t('flashcards.test.complete')}
            </p>
            <h2
              className="font-black"
              style={{
                fontSize: 'min(46px, 12cqmin)',
                marginTop: 'min(6px, 1.5cqmin)',
              }}
            >
              {score}/{results.length}
            </h2>
            <p
              className={dark ? 'text-white/75' : 'text-slate-600'}
              style={{ fontSize: 'min(13px, 3.4cqmin)' }}
            >
              {missed.length === 0
                ? t('flashcards.test.perfect')
                : t('flashcards.test.missed', { count: missed.length })}
            </p>
          </header>

          {missed.length > 0 && (
            <section style={{ marginTop: 'min(16px, 3.5cqmin)' }}>
              <h3
                className={cx(
                  'font-black',
                  dark ? 'text-white' : 'text-slate-900'
                )}
                style={{ fontSize: 'min(16px, 4cqmin)' }}
              >
                {t('flashcards.test.review')}
              </h3>
              <div
                className="grid"
                style={{
                  gap: 'min(9px, 2cqmin)',
                  marginTop: 'min(9px, 2cqmin)',
                }}
              >
                {missed.map((result) => (
                  <article
                    key={result.cardId}
                    className={cx(
                      'rounded-[min(18px,4cqmin)] border',
                      dark
                        ? 'border-rose-300/25 bg-rose-950/35 text-white'
                        : 'border-rose-200 bg-rose-50 text-rose-950'
                    )}
                    style={{
                      padding: 'min(14px, 3cqmin)',
                      fontSize: 'min(12px, 3.2cqmin)',
                    }}
                  >
                    <p className="font-black">{result.prompt}</p>
                    <p style={{ marginTop: 'min(5px, 1cqmin)' }}>
                      <span className="font-bold">
                        {t('flashcards.test.yourAnswer')}
                      </span>{' '}
                      {result.response}
                    </p>
                    <p>
                      <span className="font-bold">
                        {t('flashcards.test.correctAnswer')}
                      </span>{' '}
                      {result.expected}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}

          <div
            className="flex flex-wrap justify-center"
            style={{ gap: 'min(9px, 2cqmin)', marginTop: 'min(18px, 4cqmin)' }}
          >
            {missed.length > 0 && (
              <button
                type="button"
                onClick={() => startTest(true)}
                className="inline-flex items-center rounded-full bg-rose-600 font-black text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300"
                style={{
                  gap: 'min(7px, 1.5cqmin)',
                  padding: 'min(11px, 2.6cqmin) min(18px, 4cqmin)',
                  fontSize: 'min(12px, 3.2cqmin)',
                }}
              >
                <RotateCcw
                  aria-hidden="true"
                  style={{
                    width: 'min(17px, 4cqmin)',
                    height: 'min(17px, 4cqmin)',
                  }}
                />
                {t('flashcards.test.retake')}
              </button>
            )}
            <button
              type="button"
              onClick={() => startTest(false)}
              className={cx(
                'inline-flex items-center rounded-full font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300',
                dark
                  ? 'bg-white/10 text-white hover:bg-white/20'
                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
              )}
              style={{
                gap: 'min(7px, 1.5cqmin)',
                padding: 'min(11px, 2.6cqmin) min(18px, 4cqmin)',
                fontSize: 'min(12px, 3.2cqmin)',
              }}
            >
              <Sparkles
                aria-hidden="true"
                style={{
                  width: 'min(17px, 4cqmin)',
                  height: 'min(17px, 4cqmin)',
                }}
              />
              {t('flashcards.test.new')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-transparent">
      <div
        className="mx-auto w-full max-w-3xl"
        style={{ padding: 'min(10px, 2.5cqmin)' }}
      >
        <nav
          aria-label={t('flashcards.test.nav')}
          className={cx(
            'sticky top-0 flex flex-wrap items-center border backdrop-blur-md',
            dark
              ? 'border-white/15 bg-slate-950/85 text-white'
              : 'border-slate-200 bg-white/95 text-slate-800'
          )}
          style={{
            zIndex: 1,
            gap: 'min(5px, 1cqmin)',
            padding: 'min(8px, 2cqmin)',
            borderRadius: 'min(16px, 3.5cqmin)',
          }}
        >
          <span
            className="font-black"
            style={{
              paddingInline: 'min(6px, 1.5cqmin)',
              fontSize: 'min(11px, 3cqmin)',
            }}
          >
            {t('flashcards.modes.test')}
          </span>
          {questions.map((question, index) => {
            const answered = Boolean(answers[question.id]?.trim());
            return (
              <button
                key={question.id}
                type="button"
                aria-label={t('flashcards.test.goTo', { number: index + 1 })}
                onClick={() =>
                  document
                    .getElementById(`flashcard-test-${question.id}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
                className={cx(
                  'rounded-full font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300',
                  answered
                    ? 'bg-rose-600 text-white'
                    : dark
                      ? 'bg-white/10 text-white'
                      : 'bg-slate-100 text-slate-700'
                )}
                style={{
                  width: 'min(28px, 6.5cqmin)',
                  height: 'min(28px, 6.5cqmin)',
                  fontSize: 'min(10px, 2.7cqmin)',
                }}
              >
                {index + 1}
              </button>
            );
          })}
        </nav>

        <div
          className="grid"
          style={{ gap: 'min(13px, 3cqmin)', marginTop: 'min(13px, 3cqmin)' }}
        >
          {questions.map((question, index) => {
            const sides = getFlashcardSides(question.card, showFirst);
            return (
              <section
                id={`flashcard-test-${question.id}`}
                key={question.id}
                className={cx(
                  'rounded-[min(22px,5cqmin)] border shadow-sm',
                  dark
                    ? 'border-white/15 bg-slate-950/55 text-white'
                    : 'border-slate-200 bg-white text-slate-900'
                )}
                style={{ padding: 'min(20px, 4.5cqmin)' }}
              >
                <p
                  className={cx(
                    'font-black',
                    dark ? 'text-cyan-200' : 'text-rose-700'
                  )}
                  style={{ fontSize: 'min(11px, 3cqmin)' }}
                >
                  {t('flashcards.test.numberType', {
                    number: index + 1,
                    type: t(
                      question.type === 'mc'
                        ? 'flashcards.settings.multipleChoice'
                        : 'flashcards.settings.fillBlank'
                    ),
                  })}
                </p>
                <h2
                  className="font-black leading-tight [text-wrap:balance]"
                  style={{
                    marginTop: 'min(7px, 1.5cqmin)',
                    marginBottom: 'min(14px, 3cqmin)',
                    fontSize: 'min(23px, 5.5cqmin)',
                  }}
                >
                  {sides.prompt}
                </h2>
                {question.type === 'mc' ? (
                  <div className="grid" style={{ gap: 'min(7px, 1.5cqmin)' }}>
                    {question.options.map((option) => {
                      const selected = answers[question.id] === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() =>
                            setAnswers((current) => ({
                              ...current,
                              [question.id]: option,
                            }))
                          }
                          aria-pressed={selected}
                          className={cx(
                            'rounded-xl border-2 text-left font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200',
                            selected
                              ? 'border-rose-500 bg-rose-600 text-white'
                              : dark
                                ? 'border-white/15 bg-white/10 text-white hover:bg-white/20'
                                : 'border-slate-200 bg-slate-50 text-rose-950 hover:border-rose-300 hover:bg-rose-50'
                          )}
                          style={{
                            padding: 'min(11px, 2.5cqmin) min(14px, 3cqmin)',
                            fontSize: 'min(13px, 3.4cqmin)',
                          }}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <FibAnswer
                    question={question}
                    value={answers[question.id] ?? ''}
                    characters={characters}
                    dark={dark}
                    disabled={false}
                    onChange={(value) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: value,
                      }))
                    }
                  />
                )}
              </section>
            );
          })}
        </div>

        {check?.error && (
          <p
            role="alert"
            className={cx(
              'text-center font-bold',
              dark ? 'text-rose-100' : 'text-rose-800'
            )}
            style={{
              marginTop: 'min(14px, 3cqmin)',
              fontSize: 'min(12px, 3.2cqmin)',
            }}
          >
            {check.error}
          </p>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!allAnswered || check?.submitting}
          className="mx-auto flex items-center rounded-full bg-rose-600 font-black text-white shadow-lg shadow-rose-600/20 transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-45"
          style={{
            gap: 'min(7px, 1.5cqmin)',
            marginTop: 'min(16px, 3.5cqmin)',
            marginBottom: 'min(10px, 2cqmin)',
            padding: 'min(12px, 3cqmin) min(22px, 5cqmin)',
            fontSize: 'min(13px, 3.4cqmin)',
          }}
        >
          {check?.submitting ? (
            <Loader2
              aria-hidden="true"
              className="animate-spin"
              style={{
                width: 'min(18px, 4cqmin)',
                height: 'min(18px, 4cqmin)',
              }}
            />
          ) : allAnswered ? (
            <CheckCircle2
              aria-hidden="true"
              style={{
                width: 'min(18px, 4cqmin)',
                height: 'min(18px, 4cqmin)',
              }}
            />
          ) : (
            <XCircle
              aria-hidden="true"
              style={{
                width: 'min(18px, 4cqmin)',
                height: 'min(18px, 4cqmin)',
              }}
            />
          )}
          {t('flashcards.test.submit')}
        </button>
      </div>
    </div>
  );
};
