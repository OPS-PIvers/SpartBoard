import React, { useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import type { QuizQuestion } from '@/types';
import {
  ChoiceRow,
  MAX_MULTI_PER_LIST,
  MAX_SINGLE_OPTIONS,
  canAddRow,
  questionFromRows,
  rowsFromQuestion,
} from '@/utils/quizChoiceRows';
import { inputClass, labelClass } from './quizEditorFieldStyles';

type ChoiceUpdates = Partial<
  Pick<
    QuizQuestion,
    | 'type'
    | 'correctAnswer'
    | 'incorrectAnswers'
    | 'optionOrder'
    | 'allowPartialCredit'
  >
>;

interface ChoiceOptionsEditorProps {
  question: QuizQuestion;
  /** Shows the "Multiple correct answers" setting. */
  allowMulti: boolean;
  onChange: (updates: ChoiceUpdates) => void;
}

const LETTERS = 'ABCDEFGHIJKL';

const signature = (q: QuizQuestion) =>
  JSON.stringify([
    q.type,
    q.correctAnswer,
    q.incorrectAnswers,
    q.optionOrder ?? null,
  ]);

// A brand-new blank question opens with four empty options.
function initialRows(q: QuizQuestion): ChoiceRow[] {
  const rows = rowsFromQuestion(q);
  const pristine =
    q.type === 'MC' && rows.every((r) => !r.correct && r.text === '');
  if (!pristine || rows.length >= 4) return rows;
  return [
    ...rows,
    ...Array.from({ length: 4 - rows.length }, () => ({
      text: '',
      correct: false,
    })),
  ];
}

/** MC and choose-all as one option list; mount with `key={question.id}`. */
export const ChoiceOptionsEditor: React.FC<ChoiceOptionsEditorProps> = ({
  question,
  allowMulti,
  onChange,
}) => {
  const multi = question.type === 'MA';
  const [rows, setRows] = useState<ChoiceRow[]>(() => initialRows(question));
  const [lastSig, setLastSig] = useState(() => signature(question));

  // Re-read the question when something other than this editor changed it.
  const sig = signature(question);
  if (sig !== lastSig) {
    setLastSig(sig);
    const mine = questionFromRows(rows, multi);
    if (signature({ ...question, ...mine }) !== sig) {
      setRows(rowsFromQuestion(question));
    }
  }

  const commit = (next: ChoiceRow[], nextMulti = multi) => {
    setRows(next);
    const fields = questionFromRows(next, nextMulti);
    setLastSig(signature({ ...question, ...fields }));
    onChange(fields);
  };

  const markedCount = rows.filter((r) => r.correct).length;
  const toggleCorrect = (idx: number) => {
    if (multi) {
      const turningOn = !rows[idx].correct;
      if (turningOn && markedCount >= MAX_MULTI_PER_LIST) return;
      commit(
        rows.map((r, i) => (i === idx ? { ...r, correct: !r.correct } : r))
      );
    } else {
      commit(rows.map((r, i) => ({ ...r, correct: i === idx })));
    }
  };

  const setMulti = (on: boolean) => {
    if (on) {
      commit(rows, true);
      return;
    }
    const first = rows.findIndex((r) => r.correct);
    commit(
      rows.map((r, i) => ({ ...r, correct: i === first })),
      false
    );
  };

  const canTurnOffMulti = rows.length <= MAX_SINGLE_OPTIONS;
  const Marker = multi ? 'rounded-md' : 'rounded-full';

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <span className={labelClass}>Answer options</span>
        <div className="grid gap-2" role={multi ? 'group' : 'radiogroup'}>
          {rows.map((row, idx) => {
            const letter = LETTERS[idx] ?? String(idx + 1);
            return (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-3 text-xs font-bold text-slate-500 text-center shrink-0">
                  {letter}
                </span>
                <button
                  type="button"
                  role={multi ? 'checkbox' : 'radio'}
                  aria-checked={row.correct}
                  aria-label={`Option ${letter} is correct`}
                  onClick={() => toggleCorrect(idx)}
                  className={`shrink-0 w-7 h-7 flex items-center justify-center border-2 ${Marker} transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${
                    row.correct
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-white border-slate-300 text-transparent hover:border-emerald-500'
                  }`}
                >
                  <Check className="w-4 h-4" strokeWidth={3} aria-hidden />
                </button>
                <input
                  type="text"
                  value={row.text}
                  aria-label={`Option ${letter}`}
                  onChange={(e) =>
                    commit(
                      rows.map((r, i) =>
                        i === idx ? { ...r, text: e.target.value } : r
                      )
                    )
                  }
                  className={`${inputClass} ${
                    row.correct
                      ? 'border-emerald-400 bg-emerald-50 font-bold text-emerald-900'
                      : ''
                  }`}
                />
                {rows.length > 2 && (
                  <button
                    type="button"
                    onClick={() => commit(rows.filter((_, i) => i !== idx))}
                    className="px-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    aria-label={`Remove option ${letter}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
          {canAddRow(rows, multi) && (
            <button
              type="button"
              onClick={() => commit([...rows, { text: '', correct: false }])}
              className="flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-slate-300 hover:border-brand-blue-primary/40 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-brand-blue-primary font-bold transition-all text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Add option
            </button>
          )}
        </div>
      </div>

      {(allowMulti || multi) && (
        <div className="flex flex-wrap gap-2">
          <label
            className={`flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg select-none ${
              multi && !canTurnOffMulti
                ? 'opacity-50 cursor-not-allowed'
                : 'cursor-pointer'
            }`}
            title={
              multi && !canTurnOffMulti
                ? `Single-answer questions hold up to ${MAX_SINGLE_OPTIONS} options.`
                : undefined
            }
          >
            <input
              type="checkbox"
              checked={multi}
              disabled={multi && !canTurnOffMulti}
              onChange={(e) => setMulti(e.target.checked)}
              className="w-4 h-4 accent-brand-blue-primary"
            />
            <span className="font-bold text-xs text-slate-700 whitespace-nowrap">
              Multiple correct answers
            </span>
          </label>
          {multi && (
            <label
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg cursor-pointer select-none"
              title="Each correct pick earns points and each wrong pick takes points away, so choosing everything earns nothing."
            >
              <input
                type="checkbox"
                checked={question.allowPartialCredit === true}
                onChange={(e) =>
                  onChange({ allowPartialCredit: e.target.checked })
                }
                className="w-4 h-4 accent-brand-blue-primary"
              />
              <span className="font-bold text-xs text-slate-700 whitespace-nowrap">
                Partial credit
              </span>
            </label>
          )}
        </div>
      )}
    </div>
  );
};
