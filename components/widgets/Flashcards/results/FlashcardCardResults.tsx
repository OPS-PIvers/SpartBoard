import React, { useMemo } from 'react';
import type { FlashcardSession } from '@/types';
import { tourFieldAttr } from '@/config/tourAnchors';
import {
  ItemDetailView,
  ItemResultsList,
} from '@/components/widgets/QuizWidget/components/monitor/QuestionResults';
import {
  checkCardAnswers,
  flashcardPrompt,
  type FlashcardResultRecord,
} from '@/utils/flashcardResults';
import { cardLabel } from './flashcardRoster';

/** A Check's cards in order with how many students answered each, as Quiz's Question results. */
export const FlashcardCardList: React.FC<{
  session: FlashcardSession;
  results: readonly FlashcardResultRecord[];
  ended: boolean;
  onOpen: (index: number) => void;
}> = ({ session, results, ended, onOpen }) => {
  const items = useMemo(
    () =>
      session.cards.map((card, i) => ({
        id: card.id,
        label: cardLabel(i),
        text: flashcardPrompt(session, card),
        answered: checkCardAnswers(results, card.id, ended).totalAnswered,
      })),
    [ended, results, session]
  );
  if (items.length === 0)
    return (
      <p
        className="text-center font-sans text-brand-gray-primary"
        style={{ fontSize: 'min(12px, 4cqmin)', padding: 'min(8px, 2cqmin)' }}
      >
        No answers yet.
      </p>
    );
  return (
    <ItemResultsList
      items={items}
      onOpen={onOpen}
      anchor={(id) => tourFieldAttr('flashcards.card-result', 'flashcards', id)}
    />
  );
};

/** What students answered on one card; correct answers are marked once the assignment ends. */
export const FlashcardCardDetail: React.FC<{
  session: FlashcardSession;
  results: readonly FlashcardResultRecord[];
  index: number;
  ended: boolean;
}> = ({ session, results, index, ended }) => {
  const card = session.cards[index];
  const answers = useMemo(
    () => (card ? checkCardAnswers(results, card.id, ended) : null),
    [card, ended, results]
  );
  if (!card || !answers) return null;
  return (
    <ItemDetailView
      heading={cardLabel(index)}
      text={flashcardPrompt(session, card)}
      totalAnswered={answers.totalAnswered}
      rows={answers.rows}
      live={!ended}
    />
  );
};
