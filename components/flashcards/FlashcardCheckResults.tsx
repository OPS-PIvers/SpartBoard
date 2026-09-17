import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FlashcardProgress, FlashcardSession } from '@/types';
import { getFlashcardSides } from './playerUtils';

interface FlashcardCheckResultsProps {
  session: FlashcardSession;
  progress: FlashcardProgress;
}

export const FlashcardCheckResults: React.FC<FlashcardCheckResultsProps> = ({
  session,
  progress,
}) => {
  const { t } = useTranslation();
  const visibility = session.scoreVisibility ?? 'none';
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

        {visibility === 'score-and-answers' &&
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
                          <p>
                            <span className="font-bold">
                              {t('flashcards.assignment.correctAnswer')}
                            </span>{' '}
                            {sides.answer}
                          </p>
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
