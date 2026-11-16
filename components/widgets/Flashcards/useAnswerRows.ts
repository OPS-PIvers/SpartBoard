import type React from 'react';
import { useState } from 'react';
import {
  expandAnswerRows,
  joinAnswerRows,
  splitAnswerRows,
} from '@/utils/flashcardAnswerRows';

export const ANSWER_FIELD_CLASS =
  'block w-full resize-none rounded-xl border border-slate-200 bg-white leading-snug [field-sizing:content] text-slate-800 outline-hidden focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20';

export const answerFieldStyle = (
  paddingRight?: string
): React.CSSProperties => ({
  padding: `min(10px, 2.5cqmin) ${paddingRight ?? 'min(14px, 3.5cqmin)'} min(10px, 2.5cqmin) min(14px, 3.5cqmin)`,
  fontSize: 'min(13px, 4cqmin)',
});

export interface AnswerRows {
  rows: string[];
  valueAt: (row: number) => string;
  change: (row: number, text: string) => void;
  commit: (row: number) => void;
  addAfter: (row: number) => void;
  remove: (row: number) => void;
}

const fieldSelector = (cardId: string, side: string, row: number): string =>
  `[data-answer-row="${cardId}-${side}-${row}"]`;

const focusRow = (cardId: string, side: string, row: number): void => {
  requestAnimationFrame(() => {
    document
      .querySelector<HTMLTextAreaElement>(fieldSelector(cardId, side, row))
      ?.focus();
  });
};

/** One card side as rows of accepted answers, stored as the "a / b" text grading already reads. */
export const useAnswerRows = (
  cardId: string,
  side: 'term' | 'definition',
  text: string,
  language: string,
  onText: (text: string) => void
): AnswerRows => {
  const rows = splitAnswerRows(text);
  // Typing "/" or ";" stays in the field until it loses focus, then spells out into rows.
  const [draft, setDraft] = useState<{ row: number; text: string } | null>(
    null
  );

  const write = (next: string[]): void => onText(joinAnswerRows(next));

  return {
    rows,
    valueAt: (row) => (draft?.row === row ? draft.text : (rows[row] ?? '')),
    change: (row, value) => {
      if (/[/;]/u.test(value)) {
        setDraft({ row, text: value });
        return;
      }
      setDraft(null);
      write(rows.map((current, i) => (i === row ? value : current)));
    },
    commit: (row) => {
      const value = draft?.row === row ? draft.text : rows[row];
      setDraft(null);
      if (value === undefined) return;
      const expanded = expandAnswerRows(value, language);
      write([...rows.slice(0, row), ...expanded, ...rows.slice(row + 1)]);
    },
    addAfter: (row) => {
      write([...rows.slice(0, row + 1), '', ...rows.slice(row + 1)]);
      focusRow(cardId, side, row + 1);
    },
    remove: (row) => {
      setDraft(null);
      write(rows.filter((_, i) => i !== row));
      focusRow(cardId, side, Math.max(0, row - 1));
    },
  };
};
