import React, { useRef, useState } from 'react';
import { Check, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FlashcardCard, FlashcardSide } from '@/types';
import {
  matchFlashcardAnswer,
  type FlashcardMatch,
} from '@/utils/flashcardMatch';
import { CharacterBar, RoundSummary } from './PlayerPrimitives';
import { cx, getFlashcardSides } from './playerUtils';

interface WriteModeProps {
  cards: FlashcardCard[];
  round: number;
  showFirst: FlashcardSide;
  termLanguage: string;
  definitionLanguage: string;
  strict: boolean;
  starred: string[];
  showMarks: boolean;
  dark: boolean;
  onRecord: (cardId: string, correct: boolean) => void;
  onStar: (cardId: string) => void;
  onNextRound: () => void;
  onRestart?: () => void;
}

interface WrongReview {
  response: string;
  match: FlashcardMatch;
}

export const WriteMode: React.FC<WriteModeProps> = ({
  cards,
  round,
  showFirst,
  termLanguage,
  definitionLanguage,
  strict,
  starred,
  showMarks,
  dark,
  onRecord,
  onStar,
  onNextRound,
  onRestart,
}) => {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState('');
  const [retype, setRetype] = useState('');
  const [wrongReview, setWrongReview] = useState<WrongReview | null>(null);
  const [acceptedReview, setAcceptedReview] = useState<WrongReview | null>(
    null
  );
  const [retypeError, setRetypeError] = useState(false);
  const [summary, setSummary] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const retypeRef = useRef<HTMLInputElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const card = cards[index];
  const answerLanguage =
    showFirst === 'term' ? definitionLanguage : termLanguage;

  const advance = (isCorrect: boolean): void => {
    if (!card) return;
    onRecord(card.id, isCorrect);
    if (isCorrect) setCorrect((count) => count + 1);
    else setWrong((count) => count + 1);
    setResponse('');
    setRetype('');
    setWrongReview(null);
    setAcceptedReview(null);
    setRetypeError(false);
    if (index >= cards.length - 1) setSummary(true);
    else {
      setIndex((current) => current + 1);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const checkResponse = (): void => {
    if (!card || !response.trim()) return;
    const { answer } = getFlashcardSides(card, showFirst);
    const match = matchFlashcardAnswer(response, answer, {
      language: answerLanguage,
      strict,
    });
    if (match.result === 'wrong') {
      setWrongReview({ response, match });
      window.requestAnimationFrame(() => retypeRef.current?.focus());
      return;
    }
    if (match.result === 'accepted') {
      setAcceptedReview({ response, match });
      window.requestAnimationFrame(() => continueRef.current?.focus());
      return;
    }
    advance(true);
  };

  const renderDiff = (review: WrongReview): React.ReactNode =>
    review.match.diff
      .filter((segment) => segment.type !== 'removed')
      .map((segment, segmentIndex) => (
        <mark
          key={`${segment.type}-${segmentIndex}`}
          className={cx(
            'bg-transparent text-inherit',
            segment.type === 'added' &&
              (dark
                ? 'rounded bg-emerald-300/20 text-emerald-100'
                : 'rounded bg-emerald-200 text-emerald-950')
          )}
        >
          {segment.text}
        </mark>
      ));

  const checkRetype = (): void => {
    if (!wrongReview || !retype.trim()) return;
    const result = matchFlashcardAnswer(retype, wrongReview.match.expected, {
      language: answerLanguage,
      strict: true,
    });
    if (result.result === 'exact') advance(false);
    else setRetypeError(true);
  };

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
  const inputClass = cx(
    'w-full rounded-[min(18px,4cqmin)] border-2 text-center font-bold outline-none transition placeholder:opacity-100 focus:ring-4',
    dark
      ? 'border-white/15 bg-slate-950/60 text-white placeholder:text-white/60 focus:border-cyan-300 focus:ring-cyan-300/20'
      : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-600 focus:border-rose-400 focus:ring-rose-200'
  );

  return (
    <div
      className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col items-center justify-center bg-transparent"
      style={{ gap: 'min(14px, 3cqmin)' }}
    >
      <section
        className={cx(
          'relative w-full rounded-[min(26px,5.5cqmin)] border text-center shadow-xl',
          dark
            ? 'border-white/15 bg-slate-950/55 text-white'
            : 'border-slate-200 bg-white text-slate-900'
        )}
        style={{ padding: 'min(26px, 6cqmin)' }}
      >
        <div
          className={cx(
            'font-black uppercase tracking-widest',
            dark ? 'text-cyan-200' : 'text-rose-700'
          )}
          style={{ fontSize: 'min(11px, 2.8cqmin)' }}
        >
          {t(`flashcards.cards.${showFirst}`)} · {index + 1}/{cards.length}
        </div>
        <h2
          className="mx-auto max-w-[26ch] font-black leading-tight [text-wrap:balance]"
          style={{
            marginTop: 'min(12px, 3cqmin)',
            fontSize: 'clamp(20px, 8cqmin, 46px)',
          }}
        >
          {sides.prompt}
        </h2>
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
              right: 'min(16px, 3.5cqmin)',
              top: 'min(16px, 3.5cqmin)',
              padding: 'min(8px, 2cqmin)',
            }}
          >
            <Star
              aria-hidden="true"
              fill={isStarred ? 'currentColor' : 'none'}
              style={{
                width: 'min(18px, 4cqmin)',
                height: 'min(18px, 4cqmin)',
              }}
            />
          </button>
        )}
      </section>

      {acceptedReview ? (
        <div
          role="status"
          className={cx(
            'w-full rounded-[min(22px,5cqmin)] border text-center',
            dark
              ? 'border-emerald-300/25 bg-emerald-950/35 text-white'
              : 'border-emerald-200 bg-emerald-50 text-emerald-950'
          )}
          style={{ padding: 'min(18px, 4cqmin)' }}
        >
          <p className="font-black" style={{ fontSize: 'min(14px, 3.6cqmin)' }}>
            {t('flashcards.write.acceptedTitle')}
          </p>
          <p
            style={{
              marginTop: 'min(8px, 2cqmin)',
              fontSize: 'min(13px, 3.4cqmin)',
            }}
          >
            <span className="font-black">
              {t('flashcards.write.acceptedHint')}
            </span>{' '}
            <span>{renderDiff(acceptedReview)}</span>
          </p>
          <button
            ref={continueRef}
            type="button"
            onClick={() => advance(true)}
            className="mx-auto flex rounded-full bg-rose-600 font-black text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300"
            style={{
              marginTop: 'min(12px, 3cqmin)',
              padding: 'min(10px, 2.4cqmin) min(18px, 4cqmin)',
              fontSize: 'min(12px, 3.2cqmin)',
            }}
          >
            {t('flashcards.write.continue')}
          </button>
        </div>
      ) : !wrongReview ? (
        <form
          className="w-full"
          onSubmit={(event) => {
            event.preventDefault();
            checkResponse();
          }}
        >
          <label className="sr-only" htmlFor={`flashcard-write-${card.id}`}>
            {t('flashcards.write.inputLabel', {
              side: t(
                showFirst === 'term'
                  ? 'flashcards.cards.definition'
                  : 'flashcards.cards.term'
              ).toLocaleLowerCase(),
            })}
          </label>
          <input
            ref={inputRef}
            id={`flashcard-write-${card.id}`}
            value={response}
            onChange={(event) => setResponse(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            className={inputClass}
            placeholder={t('flashcards.write.placeholder')}
            style={{
              padding: 'min(14px, 3.5cqmin) min(18px, 4cqmin)',
              fontSize: 'min(18px, 4.5cqmin)',
            }}
          />
          <div style={{ marginTop: 'min(9px, 2cqmin)' }}>
            <CharacterBar
              language={answerLanguage}
              inputRef={inputRef}
              value={response}
              onChange={setResponse}
              dark={dark}
            />
          </div>
          <button
            type="submit"
            disabled={!response.trim()}
            className="mx-auto flex items-center rounded-full bg-rose-600 font-black text-white shadow-lg shadow-rose-600/20 transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-45"
            style={{
              gap: 'min(7px, 1.5cqmin)',
              marginTop: 'min(12px, 3cqmin)',
              padding: 'min(11px, 2.6cqmin) min(20px, 5cqmin)',
              fontSize: 'min(13px, 3.4cqmin)',
            }}
          >
            <Check
              aria-hidden="true"
              style={{
                width: 'min(18px, 4cqmin)',
                height: 'min(18px, 4cqmin)',
              }}
            />
            {t('flashcards.write.check')}
          </button>
        </form>
      ) : (
        <div
          className={cx(
            'w-full rounded-[min(22px,5cqmin)] border',
            dark
              ? 'border-rose-300/25 bg-rose-950/35 text-white'
              : 'border-rose-200 bg-rose-50 text-rose-950'
          )}
          style={{ padding: 'min(18px, 4cqmin)' }}
        >
          <div
            className="grid"
            style={{ gap: 'min(8px, 2cqmin)', fontSize: 'min(13px, 3.4cqmin)' }}
          >
            <div>
              <span className="font-black">{t('flashcards.write.yours')} </span>
              <span className={dark ? 'text-rose-100' : 'text-rose-800'}>
                {wrongReview.response}
              </span>
            </div>
            <div>
              <span className="font-black">
                {t('flashcards.write.correct')}{' '}
              </span>
              <span>{renderDiff(wrongReview)}</span>
            </div>
          </div>
          <p
            className="font-bold"
            style={{
              marginTop: 'min(13px, 3cqmin)',
              fontSize: 'min(12px, 3.2cqmin)',
            }}
          >
            {t('flashcards.write.retypeHint')}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              checkRetype();
            }}
            style={{ marginTop: 'min(8px, 2cqmin)' }}
          >
            <input
              ref={retypeRef}
              value={retype}
              onChange={(event) => {
                setRetype(event.target.value);
                setRetypeError(false);
              }}
              aria-label={t('flashcards.write.retypeLabel')}
              aria-invalid={retypeError}
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
              style={{
                padding: 'min(11px, 2.7cqmin) min(15px, 3.5cqmin)',
                fontSize: 'min(16px, 4cqmin)',
              }}
            />
            {retypeError && (
              <p
                role="alert"
                className={cx(
                  'font-bold',
                  dark ? 'text-rose-100' : 'text-rose-800'
                )}
                style={{
                  marginTop: 'min(6px, 1.5cqmin)',
                  fontSize: 'min(11px, 3cqmin)',
                }}
              >
                {t('flashcards.write.retypeError')}
              </p>
            )}
            <div
              className="flex flex-wrap items-center justify-center"
              style={{
                gap: 'min(9px, 2cqmin)',
                marginTop: 'min(10px, 2.5cqmin)',
              }}
            >
              <button
                type="submit"
                disabled={!retype.trim()}
                className="rounded-full bg-rose-600 font-black text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300 disabled:opacity-45"
                style={{
                  padding: 'min(10px, 2.4cqmin) min(18px, 4cqmin)',
                  fontSize: 'min(12px, 3.2cqmin)',
                }}
              >
                {t('flashcards.write.continue')}
              </button>
              <button
                type="button"
                onClick={() => advance(true)}
                className={cx(
                  'rounded-full font-bold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300',
                  dark ? 'text-white' : 'text-rose-800'
                )}
                style={{
                  padding: 'min(8px, 2cqmin)',
                  fontSize: 'min(11px, 3cqmin)',
                }}
              >
                {t('flashcards.write.override')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
