import React from 'react';
import { Split, X } from 'lucide-react';
import { tourFieldAttr } from '@/config/tourAnchors';
import {
  ANSWER_FIELD_CLASS,
  answerFieldStyle,
  type AnswerRows,
} from './useAnswerRows';

const ICON = { width: 'min(15px, 4cqmin)', height: 'min(15px, 4cqmin)' };

interface MainFieldProps {
  answers: AnswerRows;
  cardId: string;
  side: 'term' | 'definition';
  label: string;
  placeholder: string;
  maxLength: number;
  fieldKey: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaAnchor: Record<string, string>;
  /** Another button inside the field, left of the fork (the image picker). */
  extraButton?: React.ReactNode;
}

/** The side's first answer, with a button that adds another accepted answer under it. */
export const AnswerMainField: React.FC<MainFieldProps> = ({
  answers,
  cardId,
  side,
  label,
  placeholder,
  maxLength,
  fieldKey,
  onKeyDown,
  textareaAnchor,
  extraButton,
}) => (
  <div className="group/answer relative min-w-0">
    <label>
      <span className="sr-only">{label}</span>
      <textarea
        value={answers.valueAt(0)}
        onChange={(event) => answers.change(0, event.target.value)}
        onBlur={() => answers.commit(0)}
        onKeyDown={onKeyDown}
        maxLength={maxLength}
        rows={1}
        data-answer-row={`${cardId}-${side}-0`}
        className={ANSWER_FIELD_CLASS}
        style={answerFieldStyle(
          extraButton ? 'min(64px, 16cqmin)' : 'min(36px, 9cqmin)'
        )}
        placeholder={placeholder}
        {...textareaAnchor}
      />
    </label>
    <div
      className="absolute top-1/2 right-0 flex -translate-y-1/2 items-center"
      style={{ marginRight: 'min(6px, 1.5cqmin)' }}
    >
      {extraButton}
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={answers.fork}
        className="rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        style={{ padding: 'min(5px, 1.2cqmin)' }}
        aria-label={`Add another accepted answer to ${label}`}
        title="Add another accepted answer"
        {...(side === 'term'
          ? tourFieldAttr(
              'flashcards.card-term-alternate',
              'flashcards',
              fieldKey
            )
          : tourFieldAttr(
              'flashcards.card-definition-alternate',
              'flashcards',
              fieldKey
            ))}
      >
        <Split style={{ ...ICON, transform: 'rotate(90deg)' }} aria-hidden />
      </button>
    </div>
  </div>
);

interface AltFieldsProps {
  answers: AnswerRows;
  cardId: string;
  side: 'term' | 'definition';
  label: string;
  maxLength: number;
  className: string;
  onLastKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

const rowLetter = (row: number): string => String.fromCharCode(65 + (row % 26));

/** The side's other accepted answers, lettered B, C, D under the first. */
export const AnswerAltFields: React.FC<AltFieldsProps> = ({
  answers,
  cardId,
  side,
  label,
  maxLength,
  className,
  onLastKeyDown,
}) => (
  <div
    className={`flex min-w-0 flex-col ${className}`}
    style={{ gap: 'min(6px, 1.5cqmin)' }}
  >
    {answers.rows.slice(1).map((_, offset) => {
      const row = offset + 1;
      const last = row === answers.rows.length - 1;
      return (
        <div
          key={row}
          className="flex min-w-0 items-center"
          style={{ gap: 'min(6px, 1.5cqmin)' }}
        >
          <span
            aria-hidden
            className="w-[2ch] shrink-0 text-right font-black text-slate-300"
            style={{ fontSize: 'min(11px, 3.4cqmin)' }}
          >
            {rowLetter(row)}
          </span>
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{`${label}, accepted answer ${rowLetter(row)}`}</span>
            {/* no-tour-anchor: per-answer rows come and go; tours point at the add button */}
            <textarea
              value={answers.valueAt(row)}
              onChange={(event) => answers.change(row, event.target.value)}
              onBlur={() => answers.commit(row)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  answers.addAfter(row);
                  return;
                }
                if (
                  event.key === 'Backspace' &&
                  event.currentTarget.value === ''
                ) {
                  event.preventDefault();
                  answers.remove(row);
                  return;
                }
                if (last) onLastKeyDown?.(event);
              }}
              maxLength={maxLength}
              rows={1}
              data-answer-row={`${cardId}-${side}-${row}`}
              className={ANSWER_FIELD_CLASS}
              style={answerFieldStyle('min(36px, 9cqmin)')}
            />
            {/* no-tour-anchor: per-answer rows come and go; tours point at the add button */}
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                answers.remove(row);
              }}
              className="absolute top-1/2 right-0 -translate-y-1/2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              style={{
                padding: 'min(5px, 1.2cqmin)',
                marginRight: 'min(6px, 1.5cqmin)',
              }}
              aria-label={`Remove accepted answer ${rowLetter(row)} from ${label}`}
              title="Remove"
            >
              <X style={ICON} aria-hidden />
            </button>
          </label>
        </div>
      );
    })}
  </div>
);
