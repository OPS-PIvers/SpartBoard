import React, { useState } from 'react';
import {
  ArrowRight,
  ArrowUp,
  Flag,
  Loader2,
  RotateCcw,
  Send,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getFlashcardCharBar,
  uppercaseFlashcardCharacter,
} from '@/config/flashcardCharBars';
import { cx } from './playerUtils';

interface RoundSummaryProps {
  round: number;
  correct: number;
  wrong: number;
  dark: boolean;
  onNextRound: () => void;
  onRestart?: () => void;
}

export const RoundSummary: React.FC<RoundSummaryProps> = ({
  round,
  correct,
  wrong,
  dark,
  onNextRound,
  onRestart,
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full items-center justify-center bg-transparent">
      <section
        className={cx(
          'w-full max-w-xl rounded-[min(28px,6cqmin)] border text-center shadow-2xl backdrop-blur-xl',
          dark
            ? 'border-white/15 bg-slate-950/55 text-white'
            : 'border-slate-200 bg-white/90 text-slate-900'
        )}
        style={{ padding: 'min(34px, 7cqmin)' }}
      >
        <p
          className={cx(
            'font-black uppercase tracking-[0.2em]',
            dark ? 'text-cyan-200' : 'text-rose-600'
          )}
          style={{ fontSize: 'min(12px, 3.2cqmin)' }}
        >
          {t('flashcards.summary.complete', { round })}
        </p>
        <h2
          className="font-black"
          style={{
            marginTop: 'min(10px, 2cqmin)',
            fontSize: 'min(36px, 9cqmin)',
          }}
        >
          {t('flashcards.summary.heading')}
        </h2>
        <div
          className="grid grid-cols-2"
          style={{ gap: 'min(12px, 3cqmin)', marginTop: 'min(24px, 5cqmin)' }}
        >
          <div
            className={cx(
              'rounded-[min(20px,4cqmin)]',
              dark ? 'bg-emerald-400/15' : 'bg-emerald-50'
            )}
            style={{ padding: 'min(18px, 4cqmin)' }}
          >
            <div
              className="font-black text-emerald-500"
              style={{ fontSize: 'min(32px, 8cqmin)' }}
            >
              {correct}
            </div>
            <div
              className={cx(
                'font-bold',
                dark ? 'text-emerald-100' : 'text-emerald-800'
              )}
              style={{ fontSize: 'min(12px, 3.2cqmin)' }}
            >
              {t('flashcards.summary.correct')}
            </div>
          </div>
          <div
            className={cx(
              'rounded-[min(20px,4cqmin)]',
              dark ? 'bg-amber-300/15' : 'bg-amber-50'
            )}
            style={{ padding: 'min(18px, 4cqmin)' }}
          >
            <div
              className="font-black text-amber-500"
              style={{ fontSize: 'min(32px, 8cqmin)' }}
            >
              {wrong}
            </div>
            <div
              className={cx(
                'font-bold',
                dark ? 'text-amber-100' : 'text-amber-800'
              )}
              style={{ fontSize: 'min(12px, 3.2cqmin)' }}
            >
              {t('flashcards.summary.learning')}
            </div>
          </div>
        </div>
        <div
          className="flex flex-wrap justify-center"
          style={{ gap: 'min(10px, 2.5cqmin)', marginTop: 'min(24px, 5cqmin)' }}
        >
          <button
            type="button"
            onClick={onNextRound}
            className="inline-flex items-center rounded-full bg-rose-600 font-black text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300"
            style={{
              gap: 'min(8px, 2cqmin)',
              padding: 'min(12px, 3cqmin) min(20px, 5cqmin)',
              fontSize: 'min(13px, 3.5cqmin)',
            }}
          >
            {t('flashcards.summary.next')}
            <ArrowRight
              aria-hidden="true"
              style={{
                width: 'min(18px, 4cqmin)',
                height: 'min(18px, 4cqmin)',
              }}
            />
          </button>
          {onRestart && (
            <button
              type="button"
              onClick={onRestart}
              className={cx(
                'inline-flex items-center rounded-full font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300',
                dark
                  ? 'bg-white/10 text-white hover:bg-white/20'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              )}
              style={{
                gap: 'min(8px, 2cqmin)',
                padding: 'min(12px, 3cqmin) min(20px, 5cqmin)',
                fontSize: 'min(13px, 3.5cqmin)',
              }}
            >
              <RotateCcw
                aria-hidden="true"
                style={{
                  width: 'min(17px, 4cqmin)',
                  height: 'min(17px, 4cqmin)',
                }}
              />
              {t('flashcards.summary.restart')}
            </button>
          )}
        </div>
      </section>
    </div>
  );
};

interface CheckSubmitPanelProps {
  mode: 'flashcards' | 'write';
  dark: boolean;
  submitting: boolean;
  error?: string | null;
  flaggedCount: number;
  onSubmit: () => void;
}

export const CheckSubmitPanel: React.FC<CheckSubmitPanelProps> = ({
  mode,
  dark,
  submitting,
  error,
  flaggedCount,
  onSubmit,
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full items-center justify-center bg-transparent">
      <section
        className={cx(
          'w-full max-w-xl rounded-[min(28px,6cqmin)] border text-center shadow-2xl',
          dark
            ? 'border-white/15 bg-slate-950/55 text-white'
            : 'border-slate-200 bg-white text-slate-900'
        )}
        style={{ padding: 'min(34px, 7cqmin)' }}
      >
        <h2 className="font-black" style={{ fontSize: 'min(30px, 8cqmin)' }}>
          {t('flashcards.check.readyTitle')}
        </h2>
        <p
          className={dark ? 'text-white/75' : 'text-slate-600'}
          style={{
            marginTop: 'min(10px, 2.4cqmin)',
            fontSize: 'min(14px, 3.6cqmin)',
          }}
        >
          {t(
            mode === 'flashcards'
              ? 'flashcards.check.readyFlashcards'
              : 'flashcards.check.readyWrite'
          )}
        </p>
        {flaggedCount > 0 && (
          <p
            className={cx(
              'inline-flex items-center font-bold',
              dark ? 'text-amber-100' : 'text-amber-800'
            )}
            style={{
              gap: 'min(6px, 1.4cqmin)',
              marginTop: 'min(10px, 2.4cqmin)',
              fontSize: 'min(12px, 3.2cqmin)',
            }}
          >
            <Flag
              aria-hidden="true"
              style={{
                width: 'min(14px, 3.4cqmin)',
                height: 'min(14px, 3.4cqmin)',
              }}
            />
            {t('flashcards.check.flagged', { count: flaggedCount })}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className={cx(
              'font-bold',
              dark ? 'text-rose-100' : 'text-rose-800'
            )}
            style={{
              marginTop: 'min(12px, 3cqmin)',
              fontSize: 'min(12px, 3.2cqmin)',
            }}
          >
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="mx-auto inline-flex items-center rounded-full bg-rose-600 font-black text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            gap: 'min(8px, 2cqmin)',
            marginTop: 'min(22px, 5cqmin)',
            padding: 'min(12px, 3cqmin) min(22px, 5cqmin)',
            fontSize: 'min(14px, 3.6cqmin)',
          }}
        >
          {submitting ? (
            <Loader2
              aria-hidden="true"
              className="animate-spin"
              style={{
                width: 'min(18px, 4cqmin)',
                height: 'min(18px, 4cqmin)',
              }}
            />
          ) : (
            <Send
              aria-hidden="true"
              style={{
                width: 'min(18px, 4cqmin)',
                height: 'min(18px, 4cqmin)',
              }}
            />
          )}
          {t(
            submitting
              ? 'flashcards.check.submitting'
              : 'flashcards.check.submit'
          )}
        </button>
      </section>
    </div>
  );
};

interface CharacterBarProps {
  language: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  dark: boolean;
}

export const CharacterBar: React.FC<CharacterBarProps> = ({
  language,
  inputRef,
  value,
  onChange,
  dark,
}) => {
  const { t } = useTranslation();
  const characters = getFlashcardCharBar(language);
  const [uppercase, setUppercase] = useState(false);
  if (characters.length === 0) return null;

  const insertCharacter = (character: string, shiftKey: boolean): void => {
    const input = inputRef.current;
    const nextCharacter =
      uppercase !== shiftKey
        ? uppercaseFlashcardCharacter(character)
        : character;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? start;
    const nextValue = `${value.slice(0, start)}${nextCharacter}${value.slice(end)}`;
    onChange(nextValue);
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(
        start + nextCharacter.length,
        start + nextCharacter.length
      );
    });
  };

  return (
    <div
      className="flex flex-wrap items-center justify-center"
      style={{ gap: 'min(5px, 1.2cqmin)' }}
    >
      <button
        type="button"
        aria-label={t(
          uppercase
            ? 'flashcards.characters.lowercase'
            : 'flashcards.characters.uppercase'
        )}
        aria-pressed={uppercase}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setUppercase((current) => !current)}
        className={cx(
          'rounded-lg border font-black transition',
          uppercase
            ? 'border-rose-500 bg-rose-500 text-white'
            : dark
              ? 'border-white/15 bg-white/10 text-white hover:bg-white/20'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
        )}
        style={{ padding: 'min(6px, 1.5cqmin)' }}
      >
        <ArrowUp
          aria-hidden="true"
          style={{
            width: 'min(15px, 3.5cqmin)',
            height: 'min(15px, 3.5cqmin)',
          }}
        />
      </button>
      {characters.map((character) => (
        <button
          key={character}
          type="button"
          aria-label={t('flashcards.characters.insert', {
            character: uppercase
              ? uppercaseFlashcardCharacter(character)
              : character,
          })}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => insertCharacter(character, event.shiftKey)}
          className={cx(
            'rounded-lg border font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400',
            dark
              ? 'border-white/15 bg-white/10 text-white hover:bg-white/20'
              : 'border-slate-200 bg-white text-rose-950 hover:border-rose-300 hover:bg-rose-50'
          )}
          style={{
            minWidth: 'min(30px, 7cqmin)',
            padding: 'min(6px, 1.5cqmin)',
            fontSize: 'min(14px, 3.6cqmin)',
          }}
        >
          {uppercase ? uppercaseFlashcardCharacter(character) : character}
        </button>
      ))}
    </div>
  );
};
