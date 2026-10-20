// Flagged cards listed once above the cards (docs/multilingual-pronunciation-engine.md F11).
import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import type { FlashcardCard } from '@/types';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { cardNeedsCheck } from './speakEditorState';

interface SpeakReviewListProps {
  cards: readonly FlashcardCard[];
  onJump: (cardId: string) => void;
  onConfirm: (cardId: string) => void;
}

const TEXT_STYLE = { fontSize: 'min(12px, 3.8cqmin)' };

export const SpeakReviewList: React.FC<SpeakReviewListProps> = ({
  cards,
  onJump,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const flagged = cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => cardNeedsCheck(card));
  if (flagged.length === 0) return null;
  return (
    <section
      className="rounded-2xl border border-amber-200 bg-white"
      style={{ padding: 'min(12px, 3cqmin) min(14px, 3.5cqmin)' }}
      {...tourTypeAttr('flashcards-speak-editor.review', 'flashcards')}
    >
      <h3
        className="flex items-center font-black text-amber-800"
        style={{ gap: 'min(6px, 1.5cqmin)', fontSize: 'min(13px, 4cqmin)' }}
      >
        <AlertTriangle
          aria-hidden="true"
          style={{
            width: 'min(15px, 4.2cqmin)',
            height: 'min(15px, 4.2cqmin)',
          }}
        />
        {t('flashcards.speak.editor.reviewTitle', { count: flagged.length })}
      </h3>
      <ul
        className="mt-1 max-h-48 divide-y divide-slate-100 overflow-y-auto"
        style={TEXT_STYLE}
      >
        {flagged.map(({ card, index }) => {
          const reason = card.speak?.reasons?.[0];
          return (
            <li
              key={card.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center"
              style={{
                gap: 'min(10px, 2.5cqmin)',
                padding: 'min(6px, 1.5cqmin) 0',
              }}
            >
              <button
                type="button"
                onClick={() => onJump(card.id)}
                className="min-w-0 rounded text-left hover:underline"
                {...tourFieldAttr(
                  'flashcards-speak-editor.review-card',
                  'flashcards',
                  `row-${index + 1}`
                )}
              >
                <span className="font-bold tabular-nums text-slate-400">
                  {index + 1}
                </span>{' '}
                <span className="font-bold text-slate-900">{card.term}</span>
                {reason && (
                  <span className="block truncate text-slate-600">
                    {t(`flashcards.speak.editor.reasons.${reason}`)}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onConfirm(card.id)}
                className="rounded-lg font-bold text-rose-700 hover:bg-rose-50"
                style={{ padding: 'min(4px, 1cqmin) min(8px, 2cqmin)' }}
                {...tourFieldAttr(
                  'flashcards-speak-editor.review-confirm',
                  'flashcards',
                  `row-${index + 1}`
                )}
              >
                {t('flashcards.speak.editor.confirm')}
                <span className="sr-only"> {card.term}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
