import React from 'react';
import type { WebTourBinding, WebTourCondition } from '@/types';
import {
  cardInput,
  cardLabel,
} from '@/components/tours/editor/shell/stepCardParts';
import { isHandoffPattern, openablePage, pageUrlOf } from './handoff';

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

/** A web step's set page: Go and a start on this step open it instead of the guessed address. */
export const WebStepPageField: React.FC<{
  web: WebTourBinding;
  onChange: (web: WebTourBinding) => void;
}> = ({ web, onChange }) => {
  const value = web.openUrl ?? '';
  const guessed = pageUrlOf(
    [{ id: 'step', web: { ...web, openUrl: undefined } }],
    0
  );
  return (
    <PageField
      label="Step page"
      title="Go opens this page. Leave blank to use the recorded page."
      value={value}
      placeholder={guessed ?? 'https://'}
      onChange={(next) => {
        const rest = { ...web };
        delete rest.openUrl;
        onChange(next ? { ...rest, openUrl: next } : rest);
      }}
      testId="web-step-page"
    />
  );
};

/** An https page an admin types: Start page on the tour, Step page on a step. */
export const PageField: React.FC<{
  label: string;
  title: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  testId: string;
  anchor?: Record<string, string>;
}> = ({ label, title, value, placeholder, onChange, testId, anchor }) => {
  const bad = value.trim() !== '' && !openablePage(value);
  return (
    <label className={cardLabel}>
      {label}
      {/* no-tour-anchor: the caller passes the anchor when one applies */}
      <input
        className={cardInput}
        type="url"
        inputMode="url"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        title={title}
        aria-invalid={bad || undefined}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value.trim())}
        {...anchor}
      />
      {bad && (
        <span className="text-xs font-normal text-red-700">
          Start the address with https://.
        </span>
      )}
    </label>
  );
};
