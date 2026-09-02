/**
 * Word-limit authoring row for written quiz questions: an optional Min/Max
 * pair plus an "Enforce limit" switch.
 *
 * The inputs are held in local state so a half-typed or backwards range
 * (min > max) can be shown with an inline error WITHOUT writing it to the
 * question — the student client would otherwise briefly see an impossible
 * requirement. Valid edits write through immediately.
 */

import React, { useState } from 'react';
import type { QuizQuestion } from '@/types';
import { Toggle } from '@/components/common/Toggle';
import { labelClass, inputClass } from './quizEditorFieldStyles';

const MAX_WORD_BOUND = 5000;

interface Props {
  question: QuizQuestion;
  onChange: (updates: Partial<QuizQuestion>) => void;
}

const toField = (n: number | undefined): string =>
  n && n > 0 ? String(n) : '';

/** Parsed input value: `undefined` = cleared, `null` = present but unusable. */
const parseBound = (raw: string): number | undefined | null => {
  if (!raw.trim()) return undefined;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(MAX_WORD_BOUND, n);
};

export const WordLimitFields: React.FC<Props> = ({ question, onChange }) => {
  const [minRaw, setMinRaw] = useState(() => toField(question.minWords));
  const [maxRaw, setMaxRaw] = useState(() => toField(question.maxWords));

  // Adjusting state while rendering: reseed the inputs when the selection moves.
  const [lastId, setLastId] = useState(question.id);
  if (lastId !== question.id) {
    setLastId(question.id);
    setMinRaw(toField(question.minWords));
    setMaxRaw(toField(question.maxWords));
  }

  const min = parseBound(minRaw);
  const max = parseBound(maxRaw);
  const backwards =
    typeof min === 'number' && typeof max === 'number' && min > max;
  const hasBound = typeof min === 'number' || typeof max === 'number';

  const commit = (nextMinRaw: string, nextMaxRaw: string) => {
    const nextMin = parseBound(nextMinRaw);
    const nextMax = parseBound(nextMaxRaw);
    if (nextMin === null || nextMax === null) return;
    if (
      typeof nextMin === 'number' &&
      typeof nextMax === 'number' &&
      nextMin > nextMax
    ) {
      return;
    }
    const stillBounded = nextMin !== undefined || nextMax !== undefined;
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
