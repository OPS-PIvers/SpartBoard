import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Trophy,
  X as XIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  FlashcardAnswerLogEntry,
  FlashcardCard,
  FlashcardProgress,
  FlashcardSession,
} from '@/types';
import {
  isFlashcardV2Check,
  resolveFlashcardResultsVisibility,
} from '@/utils/flashcardResultsVisibility';
import { ResultsProtectionGate } from '@/components/student/ResultsProtectionGate';
import { getFlashcardSides } from './playerUtils';

interface FlashcardCheckResultsProps {
  session: FlashcardSession;
  progress: FlashcardProgress;
  /** The student's own progress doc, for the results tab-away count. */
  progressDocPath?: string | null;
  /** Starts another attempt; absent when none is left. */
  onTryAgain?: () => Promise<void>;
}

const answered = (entry: FlashcardAnswerLogEntry): boolean =>
  entry.type === 'speak' || entry.response.trim().length > 0;

export const FlashcardCheckResults: React.FC<FlashcardCheckResultsProps> = (
  props
) =>
  isFlashcardV2Check(props.session) ? (
    <QuizStyleResults {...props} />
  ) : (
    <LegacyResults {...props} />
  );

/** Why the Check was submitted for the student, and Try again while attempts remain. */
const AttemptActions: React.FC<{
  forced: FlashcardProgress['forcedSubmit'];
  onTryAgain?: () => Promise<void>;
}> = ({ forced, onTryAgain }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!forced && !onTryAgain) return null;
  const tryAgain = async () => {
    if (!onTryAgain) return;
    setBusy(true);
    setFailed(false);
    try {
      await onTryAgain();
    } catch (err) {
      console.error('[FlashcardCheckResults] Try again failed:', err);
      setFailed(true);
      setBusy(false);
    }
  };
  return (
    <div className="mt-5 flex flex-col items-center gap-3 text-center">
      {forced && (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"
        >
          {forced === 'time'
            ? t('quizTimeLimit.submitted')
            : t('flashcards.assignment.forcedTab')}
        </p>
      )}
      {onTryAgain && (
        // no-tour-anchor: student page; live tours run in the teacher app
        <button
          type="button"
          onClick={() => void tryAgain()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
          )}
          {t('flashcards.assignment.tryAgain')}
        </button>
      )}
      {failed && (
        <p role="alert" className="text-sm font-semibold text-rose-700">
          {t('flashcards.assignment.tryAgainError')}
        </p>
      )}
    </div>
  );
};

/** Quiz's submitted screen and full review, behind its results protection. */
const QuizStyleResults: React.FC<FlashcardCheckResultsProps> = ({
  session,
  progress,
  progressDocPath = null,
  onTryAgain,
}) => {
  const { t } = useTranslation();
  const { visibility, protection, publishedAt } =
    resolveFlashcardResultsVisibility(session, progress);
  const showFirst = session.lockedSettings?.showFirst ?? 'term';
  const cardsById = new Map(session.cards.map((card) => [card.id, card]));
  const log = progress.answerLog ?? [];
  const total = progress.total ?? session.cards.length;
  const minutes = Math.max(1, Math.round((progress.studyMs ?? 0) / 60000));

  if (visibility === 'none') {
    return (
      <div className="h-full overflow-y-auto bg-slate-100 px-4 py-6 sm:px-6">
        <section className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-xl sm:p-8">
          <CheckCircle2
            aria-hidden="true"
            className="mx-auto h-10 w-10 text-emerald-600"
          />
          <h2 className="mt-3 text-2xl font-black text-slate-900">
            {t('flashcards.assignment.submittedTitle')}
          </h2>
          {typeof progress.submittedAt === 'number' && (
            <p className="mt-1 text-sm text-slate-600">
              {t('flashcards.assignment.submittedAt', {
                date: new Date(progress.submittedAt).toLocaleString(),
              })}
            </p>
          )}
          {session.checkMode !== 'flashcards' && log.length > 0 && (
            <div className="mx-auto mt-5 max-w-xs rounded-2xl bg-slate-50 p-4">
              <p className="text-4xl font-black text-slate-900">
                {log.filter(answered).length}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {t('flashcards.assignment.answeredOf', { total })}
              </p>
            </div>
          )}
          <p className="mt-5 text-sm font-bold text-slate-700">
            {t('flashcards.assignment.resultsHidden')}
          </p>
          <AttemptActions
            forced={progress.forcedSubmit}
            onTryAgain={onTryAgain}
          />
        </section>
      </div>
    );
  }

  const showResponses =
    visibility !== 'score-only' && session.checkMode !== 'flashcards';
  const showAnswers = visibility === 'score-responses-and-answers';
  const score = progress.score ?? 0;
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;

  const gate = (
    <ResultsProtectionGate
      protection={protection}
      publishedAt={publishedAt}
      responseDocPath={progressDocPath}
      tabWarnings={progress.resultsTabWarnings ?? 0}
      lockedOut={progress.resultsLockedOut === true}
      light
    >
      <div className="h-full overflow-y-auto bg-slate-100 px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <header className="mb-5 flex flex-col items-center text-center">
            <Trophy aria-hidden="true" className="h-10 w-10 text-amber-500" />
            <h2 className="mt-3 text-2xl font-black text-slate-900">
              {t('flashcards.assignment.resultsTitle')}
            </h2>
            {typeof progress.submittedAt === 'number' && (
              <p className="mt-1 text-sm text-slate-600">
                {t('flashcards.assignment.submittedAt', {
                  date: new Date(progress.submittedAt).toLocaleString(),
                })}
              </p>
            )}
          </header>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
            {session.checkMode === 'flashcards' && !progress.forcedSubmit ? (
              <div className="text-sm font-bold text-slate-700">
                <p>{t('flashcards.assignment.mastered')}</p>
                <p className="mt-1 font-normal text-slate-600">
                  {t('flashcards.assignment.rounds', { count: progress.round })}
                  {' · '}
                  {t('flashcards.assignment.studyTime', { minutes })}
                </p>
              </div>
            ) : (
              <>
                <p className="text-5xl font-black text-slate-900">
                  <span className="sr-only">
                    {t('flashcards.assignment.score')}:{' '}
                  </span>
                  {percent}%
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {t('flashcards.assignment.correctOf', {
                    correct: score,
                    total,
                  })}
                </p>
              </>
            )}
            <AttemptActions
              forced={progress.forcedSubmit}
              onTryAgain={onTryAgain}
            />
          </section>

          {showResponses && log.length > 0 && (
            <section className="mt-6">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                {t('flashcards.assignment.answersTitle')}
              </h3>
              <ol className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
                {log.map((entry, index) => {
                  const card = cardsById.get(entry.cardId);
                  if (!card) return null;
                  return (
                    <ReviewItem
                      key={`${entry.cardId}:${entry.type ?? 'write'}`}
                      index={index}
                      entry={entry}
                      card={card}
                      showFirst={showFirst}
                      showAnswers={showAnswers}
                    />
                  );
                })}
              </ol>
            </section>
          )}
        </div>
      </div>
    </ResultsProtectionGate>
  );
  // The lock screen hides the page, so Try again sits below it.
  if (progress.resultsLockedOut !== true || !onTryAgain) return gate;
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">{gate}</div>
      <div className="shrink-0 border-t border-slate-200 bg-white px-4 pb-4">
        <AttemptActions
          forced={progress.forcedSubmit}
          onTryAgain={onTryAgain}
        />
      </div>
    </div>
  );
};

const ReviewItem: React.FC<{
  index: number;
  entry: FlashcardAnswerLogEntry;
  card: FlashcardCard;
  showFirst: 'term' | 'definition';
  showAnswers: boolean;
}> = ({ index, entry, card, showFirst, showAnswers }) => {
  const { t } = useTranslation();
  const correct = entry.correct === true;
  const speak = entry.type === 'speak';
  // A Speak card is the term said aloud, so the term is the prompt and the definition the answer.
  const sides = speak
    ? { prompt: card.term, answer: card.definition }
    : getFlashcardSides(card, showFirst);
  return (
    <li className="p-4">
      <div className="mb-2 flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-[11px] font-bold text-slate-600">
          {index + 1}
        </span>
        <p className="min-w-0 flex-1 wrap-break-word whitespace-pre-line text-sm font-semibold text-slate-900">
          {sides.prompt}
        </p>
        {correct ? (
          <Check
            aria-label="Correct"
            className="h-5 w-5 shrink-0 text-emerald-600"
          />
        ) : (
          <XIcon
            aria-label="Incorrect"
            className="h-5 w-5 shrink-0 text-rose-600"
          />
        )}
      </div>
      <div className="ml-7 space-y-1.5 text-xs text-slate-600">
        {!speak && (
          <p>
            {t('flashcards.assignment.yourAnswer')}{' '}
            <span
              className={`font-mono ${correct ? 'text-emerald-700' : 'text-rose-700'}`}
            >
              {entry.response.trim()
                ? entry.response
                : t('flashcards.assignment.noResponse')}
            </span>
          </p>
        )}
        {showAnswers && (!correct || speak) && (
          <p>
            {t('flashcards.assignment.correctAnswer')}{' '}
            <span className="font-mono text-emerald-700">{sides.answer}</span>
          </p>
        )}
      </div>
    </li>
  );
};

/** Checks from before Quiz-style rules keep their score and missed-cards list. */
const LegacyResults: React.FC<FlashcardCheckResultsProps> = ({
  session,
  progress,
}) => {
  const { t } = useTranslation();
  const { visibility } = resolveFlashcardResultsVisibility(session, progress);
  const showAnswers = visibility === 'score-responses-and-answers';
  const showFirst = session.lockedSettings?.showFirst ?? 'term';
  const cardsById = new Map(session.cards.map((card) => [card.id, card]));
  const missed = (progress.answerLog ?? []).filter((entry) => !entry.correct);
  const minutes = Math.max(1, Math.round((progress.studyMs ?? 0) / 60000));

  return (
    <div className="h-full overflow-y-auto bg-slate-100 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-xl sm:p-8">
          <CheckCircle2
            aria-hidden="true"
            className="mx-auto h-10 w-10 text-emerald-600"
          />
          <h2 className="mt-3 text-2xl font-black text-slate-900">
            {t('flashcards.assignment.submittedTitle')}
          </h2>
          {typeof progress.submittedAt === 'number' && (
            <p className="mt-1 text-sm text-slate-600">
              {t('flashcards.assignment.submittedAt', {
                date: new Date(progress.submittedAt).toLocaleString(),
              })}
            </p>
          )}
          {visibility === 'none' ? (
            <p className="mt-4 text-sm font-bold text-slate-700">
              {t('flashcards.assignment.resultsHidden')}
            </p>
          ) : session.checkMode === 'flashcards' ? (
            <div className="mt-4 text-sm font-bold text-slate-700">
              <p>{t('flashcards.assignment.mastered')}</p>
              <p className="mt-1 font-normal text-slate-600">
                {t('flashcards.assignment.rounds', { count: progress.round })}
                {' · '}
                {t('flashcards.assignment.studyTime', { minutes })}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-5xl font-black text-slate-900">
              <span className="sr-only">
                {t('flashcards.assignment.score')}:{' '}
              </span>
              {progress.score ?? 0}/{progress.total ?? session.cards.length}
            </p>
          )}
        </section>

        {(visibility === 'score-and-responses' || showAnswers) &&
          session.checkMode !== 'flashcards' && (
            <section className="mt-5">
              {missed.length === 0 ? (
                <p className="text-center text-sm font-bold text-slate-700">
                  {t('flashcards.assignment.allCorrect')}
                </p>
              ) : (
                <>
                  <h3 className="text-lg font-black text-slate-900">
                    {t('flashcards.assignment.missedTitle')}
                  </h3>
                  <ul className="mt-3 grid gap-3">
                    {missed.map((entry) => {
                      const card = cardsById.get(entry.cardId);
                      if (!card) return null;
                      const sides = getFlashcardSides(card, showFirst);
                      // A Speak miss has no typed answer; the term is what to practice.
                      if (entry.type === 'speak') {
                        return (
                          <li
                            key={`${entry.cardId}:speak`}
                            className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"
                          >
                            <p className="font-black">{card.term}</p>
                            {showAnswers && (
                              <p className="mt-1">{card.definition}</p>
                            )}
                          </li>
                        );
                      }
                      return (
                        <li
                          key={`${entry.cardId}:${entry.type ?? 'write'}`}
                          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"
                        >
                          <p className="font-black">{sides.prompt}</p>
                          <p className="mt-1">
                            <span className="font-bold">
                              {t('flashcards.assignment.yourAnswer')}
                            </span>{' '}
                            {entry.response}
                          </p>
                          {showAnswers && (
                            <p>
                              <span className="font-bold">
                                {t('flashcards.assignment.correctAnswer')}
                              </span>{' '}
                              {sides.answer}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>
          )}
      </div>
    </div>
  );
};
