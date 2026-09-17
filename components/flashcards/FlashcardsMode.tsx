import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Star,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import type { FlashcardCard, FlashcardSide } from '@/types';
import { RoundSummary } from './PlayerPrimitives';
import { cx, getFlashcardSides } from './playerUtils';

interface FlashcardsModeProps {
  cards: FlashcardCard[];
  round: number;
  showFirst: FlashcardSide;
  starred: string[];
  showMarks: boolean;
  dark: boolean;
  onRecord: (cardId: string, correct: boolean) => void;
  onStar: (cardId: string) => void;
  onNextRound: () => void;
  onRestart?: () => void;
}

export const FlashcardsMode: React.FC<FlashcardsModeProps> = ({
  cards,
  round,
  showFirst,
  starred,
  showMarks,
  dark,
  onRecord,
  onStar,
  onNextRound,
  onRestart,
}) => {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState<-1 | 1>(1);
  const [flipped, setFlipped] = useState(false);
  const [summary, setSummary] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const card = cards[index];

  const move = useCallback(
    (direction: -1 | 1): void => {
      if (cards.length === 0) return;
      setSlideDirection(direction);
      setIndex(
        (current) => (current + direction + cards.length) % cards.length
      );
      setFlipped(false);
    },
    [cards.length]
  );

  const record = useCallback(
    (isCorrect: boolean): void => {
      if (!card) return;
      onRecord(card.id, isCorrect);
      if (isCorrect) setCorrect((count) => count + 1);
      else setWrong((count) => count + 1);
      if (index >= cards.length - 1) setSummary(true);
      else {
        setSlideDirection(1);
        setIndex((current) => current + 1);
        setFlipped(false);
      }
    },
    [card, cards.length, index, onRecord]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest('input, textarea, select, [contenteditable="true"]') ||
          (target.closest('button') && !rootRef.current?.contains(target)))
      ) {
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        setFlipped((current) => !current);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        move(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        move(1);
      } else if (showMarks && event.key === 'ArrowUp') {
        event.preventDefault();
        record(true);
      } else if (showMarks && event.key === 'ArrowDown') {
        event.preventDefault();
        record(false);
      } else if (showMarks && event.key.toLocaleLowerCase() === 's' && card) {
        event.preventDefault();
        onStar(card.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [card, move, onStar, record, showMarks]);

  if (summary) {
    return (
      <RoundSummary
        round={round}
        correct={correct}
        wrong={wrong}
        dark={dark}
        onNextRound={onNextRound}
        onRestart={onRestart}
      />
    );
  }

  if (!card) return null;
  const sides = getFlashcardSides(card, showFirst);
  const isStarred = starred.includes(card.id);
  const iconSize = {
    width: 'min(20px, 4.5cqmin)',
    height: 'min(20px, 4.5cqmin)',
  };

  const answerSide = showFirst === 'term' ? 'definition' : 'term';

  return (
    <div
      ref={rootRef}
      className="flex h-full min-h-0 w-full flex-col items-center justify-center bg-transparent"
      style={{ gap: 'min(14px, 3cqmin)' }}
    >
      <div
        key={`${card.id}:${index}`}
        className={cx(
          'relative min-h-0 w-full max-w-3xl flex-1 perspective-1000 animate-in fade-in duration-200',
          slideDirection === 1
            ? 'motion-safe:slide-in-from-right-8'
            : 'motion-safe:slide-in-from-left-8'
        )}
      >
        <span className="sr-only" aria-live="polite">
          {flipped
            ? `${t(`flashcards.cards.${answerSide}`)}: ${sides.answer}`
            : ''}
        </span>
        <button
          type="button"
          aria-pressed={flipped}
          aria-label={`${t(`flashcards.cards.${flipped ? answerSide : showFirst}`)}: ${flipped ? sides.answer : sides.prompt}. ${t(flipped ? 'flashcards.cards.flipToPrompt' : 'flashcards.cards.flipToAnswer')}`}
          onClick={() => setFlipped((current) => !current)}
          className={cx(
            'relative h-full w-full rounded-[min(30px,6cqmin)] text-left shadow-2xl transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none motion-reduce:[transform:none] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-400',
            flipped && 'motion-safe:[transform:rotateY(180deg)]'
          )}
        >
          <div
            aria-hidden="true"
            className={cx(
              'absolute inset-0 flex flex-col items-center justify-center overflow-hidden rounded-[min(30px,6cqmin)] border text-center [backface-visibility:hidden] motion-reduce:transition-opacity motion-reduce:duration-200',
              flipped && 'motion-reduce:opacity-0',
              dark
                ? 'border-white/15 bg-slate-950/65 text-white'
                : 'border-slate-200 bg-white text-slate-900'
            )}
            style={{ padding: 'min(38px, 8cqmin)' }}
          >
            <span
              className={cx(
                'absolute font-black uppercase tracking-widest',
                dark ? 'text-cyan-200' : 'text-rose-700'
              )}
              style={{
                top: 'min(18px, 4cqmin)',
                left: 'min(22px, 5cqmin)',
                fontSize: 'min(11px, 2.8cqmin)',
              }}
            >
              {t(`flashcards.cards.${showFirst}`)}
            </span>
            <span
              className="max-w-[22ch] text-center font-black leading-tight [text-wrap:balance]"
              style={{ fontSize: 'clamp(22px, 10cqmin, 58px)' }}
            >
              {sides.prompt}
            </span>
            <span
              className={cx(
                'absolute font-bold',
                dark ? 'text-white/65' : 'text-slate-500'
              )}
              style={{
                bottom: 'min(18px, 4cqmin)',
                fontSize: 'min(11px, 3cqmin)',
              }}
            >
              {t('flashcards.cards.flipHint')}
            </span>
          </div>
          <div
            aria-hidden="true"
            className={cx(
              'absolute inset-0 flex flex-col items-center justify-center overflow-hidden rounded-[min(30px,6cqmin)] border text-center [backface-visibility:hidden] [transform:rotateY(180deg)] motion-reduce:[transform:none] motion-reduce:transition-opacity motion-reduce:duration-200',
              !flipped && 'motion-reduce:opacity-0',
              dark
                ? 'border-cyan-200/20 bg-cyan-950/65 text-white'
                : 'border-rose-200 bg-rose-50 text-rose-950'
            )}
            style={{ padding: 'min(38px, 8cqmin)' }}
          >
            <span
              className={cx(
                'absolute font-black uppercase tracking-widest',
                dark ? 'text-cyan-200' : 'text-rose-700'
              )}
              style={{
                top: 'min(18px, 4cqmin)',
                left: 'min(22px, 5cqmin)',
                fontSize: 'min(11px, 2.8cqmin)',
              }}
            >
              {t(
                showFirst === 'term'
                  ? 'flashcards.cards.definition'
                  : 'flashcards.cards.term'
              )}
            </span>
            <span
              className="max-w-[26ch] text-center font-black leading-tight [text-wrap:balance]"
              style={{ fontSize: 'clamp(20px, 8cqmin, 48px)' }}
            >
              {sides.answer}
            </span>
          </div>
        </button>
        {showMarks && (
          <button
            type="button"
            onClick={() => onStar(card.id)}
            aria-label={t(
              isStarred
                ? 'flashcards.cards.favoriteRemove'
                : 'flashcards.cards.favoriteAdd'
            )}
            aria-pressed={isStarred}
            className={cx(
              'absolute rounded-full transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300',
              isStarred
                ? 'bg-amber-400 text-amber-950'
                : dark
                  ? 'bg-white/10 text-white hover:bg-white/20'
                  : 'bg-slate-100 text-amber-900 hover:bg-amber-100'
            )}
            style={{
              right: 'min(18px, 4cqmin)',
              top: 'min(18px, 4cqmin)',
              padding: 'min(9px, 2cqmin)',
            }}
          >
            <Star
              aria-hidden="true"
              fill={isStarred ? 'currentColor' : 'none'}
              style={iconSize}
            />
          </button>
        )}
      </div>

      <div
        className="flex shrink-0 items-center justify-center"
        style={{ gap: 'min(10px, 2.2cqmin)' }}
      >
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label={t('flashcards.cards.previous')}
          className={cx(
            'rounded-full transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300',
            dark
              ? 'bg-white/10 text-white hover:bg-white/20'
              : 'bg-white text-slate-700 shadow hover:bg-slate-50'
          )}
          style={{ padding: 'min(11px, 2.5cqmin)' }}
        >
          <ArrowLeft aria-hidden="true" style={iconSize} />
        </button>

        {showMarks && (
          <button
            type="button"
            onClick={() => record(false)}
            aria-label={t('flashcards.cards.learning')}
            className={cx(
              'inline-flex items-center rounded-full font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300',
              dark
                ? 'bg-amber-300/15 text-amber-100 hover:bg-amber-300/25'
                : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
            )}
            style={{
              gap: 'min(5px, 1.2cqmin)',
              padding: 'min(10px, 2.3cqmin) min(14px, 3.5cqmin)',
              fontSize: 'min(12px, 3.2cqmin)',
            }}
          >
            <ThumbsDown aria-hidden="true" style={iconSize} />
            <ArrowDown aria-hidden="true" className="sr-only" />
            {t('flashcards.cards.learning')}
          </button>
        )}

        <div
          className={cx(
            'min-w-[5.5em] text-center font-black tabular-nums',
            dark ? 'text-white' : 'text-slate-700'
          )}
          style={{ fontSize: 'min(13px, 3.5cqmin)' }}
        >
          {index + 1}/{cards.length}
        </div>

        {showMarks && (
          <button
            type="button"
            onClick={() => record(true)}
            aria-label={t('flashcards.cards.correct')}
            className={cx(
              'inline-flex items-center rounded-full font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300',
              dark
                ? 'bg-emerald-300/15 text-emerald-100 hover:bg-emerald-300/25'
                : 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
            )}
            style={{
              gap: 'min(5px, 1.2cqmin)',
              padding: 'min(10px, 2.3cqmin) min(14px, 3.5cqmin)',
              fontSize: 'min(12px, 3.2cqmin)',
            }}
          >
            <ThumbsUp aria-hidden="true" style={iconSize} />
            <ArrowUp aria-hidden="true" className="sr-only" />
            {t('flashcards.cards.correct')}
          </button>
        )}

        <button
          type="button"
          onClick={() => move(1)}
          aria-label={t('flashcards.cards.next')}
          className={cx(
            'rounded-full transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300',
            dark
              ? 'bg-white/10 text-white hover:bg-white/20'
              : 'bg-white text-slate-700 shadow hover:bg-slate-50'
          )}
          style={{ padding: 'min(11px, 2.5cqmin)' }}
        >
          <ArrowRight aria-hidden="true" style={iconSize} />
        </button>
      </div>
    </div>
  );
};
