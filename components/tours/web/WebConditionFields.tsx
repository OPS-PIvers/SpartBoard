import React from 'react';
import type { WebTourBinding, WebTourCondition } from '@/types';
import {
  cardInput,
  cardLabel,
} from '@/components/tours/editor/shell/stepCardParts';
import { isHandoffPattern } from './handoff';

type Key = 'showWhen' | 'doneWhen';

const CHOICES: Record<Key, { none: string; target: string; url: string }> = {
  showWhen: {
    none: 'Always',
    target: 'Its target is on the page',
    url: 'The page address matches',
  },
  doneWhen: {
    none: 'The learner does the step',
    target: 'Its target is gone from the page',
    url: 'The page address matches',
  },
};

const LABEL: Record<Key, string> = {
  showWhen: 'Show only when',
  doneWhen: 'Move on when',
};

/** The binding without the key, so Firestore never sees an undefined. */
const without = (web: WebTourBinding, key: Key): WebTourBinding => {
  const next = { ...web };
  delete next[key];
  return next;
};

const ConditionField: React.FC<{
  field: Key;
  web: WebTourBinding;
  onChange: (web: WebTourBinding) => void;
}> = ({ field, web, onChange }) => {
  const value = web[field];
  const choices = CHOICES[field];
  const set = (next: WebTourCondition | undefined) =>
    onChange(next ? { ...web, [field]: next } : without(web, field));
  const badPattern = value?.kind === 'url' && !isHandoffPattern(value.pattern);
  return (
    <div
      className="flex flex-col gap-1.5"
      data-testid={`web-condition-${field}`}
    >
      <label className={cardLabel}>
        {LABEL[field]}
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <select
          className={cardInput}
          value={value?.kind ?? ''}
          onChange={(e) => {
            const kind = e.target.value;
            set(
              kind === 'target'
                ? { kind: 'target' }
                : kind === 'url'
                  ? { kind: 'url', pattern: web.urlPattern }
                  : undefined
            );
          }}
        >
          <option value="">{choices.none}</option>
          <option value="target">{choices.target}</option>
          <option value="url">{choices.url}</option>
        </select>
      </label>
      {value?.kind === 'url' && (
        <label className={cardLabel}>
          Page address
          {/* no-tour-anchor: per-step controls repeat on every step */}
          <input
            className={cardInput}
            value={value.pattern}
            spellCheck={false}
            title="A * stands for one part of the address, like a course id."

            aria-invalid={badPattern || undefined}
            onChange={(e) => set({ kind: 'url', pattern: e.target.value })}
          />
          {badPattern && (
            <span className="text-xs font-normal text-red-700">
              Start the address with https://.
            </span>
          )}
        </label>
      )}
    </div>
  );
};

/** A web step's conditions (E6): when it plays and when it is done. */
export const WebConditionFields: React.FC<{
  web: WebTourBinding;
  onChange: (web: WebTourBinding) => void;
}> = ({ web, onChange }) => (
  <>
    <ConditionField field="showWhen" web={web} onChange={onChange} />
    <ConditionField field="doneWhen" web={web} onChange={onChange} />
  </>
);
