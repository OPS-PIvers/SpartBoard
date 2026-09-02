// Min/Max word-limit row plus the "Enforce limit" switch for a Free Response question.

import React, { useState } from 'react';
import type { QuizQuestion } from '@/types';
import { Toggle } from '@/components/common/Toggle';
import { isInvalidWordRange, wordLimitBounds } from '@/utils/wordLimit';
import { labelClass, inputClass } from './quizEditorFieldStyles';

const MAX_WORD_BOUND = 5000;

interface Props {
  question: QuizQuestion;
  onChange: (updates: Partial<QuizQuestion>) => void;
}

const toField = (n: number | undefined): string =>
  n && n > 0 ? String(n) : '';

/** Blank, non-numeric and sub-1 input all mean "no bound on this side". */
const parseBound = (raw: string): number | undefined => {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.min(MAX_WORD_BOUND, n);
};

export const WordLimitFields: React.FC<Props> = ({ question, onChange }) => {
  const committed = wordLimitBounds(question);
  const [minRaw, setMinRaw] = useState(() => toField(committed.min));
  const [maxRaw, setMaxRaw] = useState(() => toField(committed.max));
  const [seed, setSeed] = useState({ id: question.id, ...committed });

  // Adjusting state while rendering: reseed on selection change or an external edit.
  if (
    seed.id !== question.id ||
    seed.min !== committed.min ||
    seed.max !== committed.max
  ) {
    setSeed({ id: question.id, ...committed });
    setMinRaw(toField(committed.min));
    setMaxRaw(toField(committed.max));
  }

  const backwards = isInvalidWordRange(parseBound(minRaw), parseBound(maxRaw));
  const hasBound = committed.min !== undefined || committed.max !== undefined;

  const commit = (nextMinRaw: string, nextMaxRaw: string) => {
    const nextMin = parseBound(nextMinRaw);
    const nextMax = parseBound(nextMaxRaw);
    if (isInvalidWordRange(nextMin, nextMax)) return;
    const stillBounded = nextMin !== undefined || nextMax !== undefined;
    setSeed({ id: question.id, min: nextMin, max: nextMax });
    onChange({
      minWords: nextMin,
      maxWords: nextMax,
      enforceWordLimit:
        stillBounded && question.enforceWordLimit ? true : undefined,
    });
  };

  return (
    <div>
      <label className={labelClass}>Word limit (optional)</label>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <input
            type="number"
            min={1}
            max={MAX_WORD_BOUND}
            value={minRaw}
            aria-label="Minimum words"
            placeholder="None"
            onChange={(e) => {
              setMinRaw(e.target.value);
              commit(e.target.value, maxRaw);
            }}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500">Min</p>
        </div>
        <div className="flex-1">
          <input
            type="number"
            min={1}
            max={MAX_WORD_BOUND}
            value={maxRaw}
            aria-label="Maximum words"
            placeholder="None"
            onChange={(e) => {
              setMaxRaw(e.target.value);
              commit(minRaw, e.target.value);
            }}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500">Max</p>
        </div>
      </div>
      {backwards && (
        <p
          role="alert"
          className="mt-1 text-xs font-semibold text-brand-red-primary"
        >
          Minimum can&apos;t be greater than maximum.
        </p>
      )}
      {hasBound && (
        <div className="mt-3 flex items-start gap-3">
          <Toggle
            checked={question.enforceWordLimit === true}
            onChange={(checked) =>
              onChange({ enforceWordLimit: checked ? true : undefined })
            }
            size="sm"
            showLabels={false}
            label="Enforce limit"
          />
          <div>
            <p className="text-sm font-bold text-slate-700">Enforce limit</p>
            <p className="text-xs text-slate-500">
              Students can&apos;t submit outside this range
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default WordLimitFields;
