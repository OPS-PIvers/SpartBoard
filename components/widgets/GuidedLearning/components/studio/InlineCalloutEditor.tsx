import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { GuidedLearningStep } from '@/types';
import { SOFT_WORD_LIMIT, countWords } from './inlineText';

interface InlineCalloutEditorProps {
  step: GuidedLearningStep;
  onChange: (step: GuidedLearningStep) => void;
  /** Leaves inline editing; edits are already applied. */
  onDone: () => void;
  /** Keeps editing open while focus is away on purpose (the link prompt). */
  holdOpen?: boolean;
  /** `gl-callout-editing`: Enter in the title moves to the body, Ctrl/⌘+Enter finishes. */
  editKeys?: boolean;
}

// Grows with its content where supported; `rows` covers the rest.
const AUTO_SIZE = {
  fieldSizing: 'content',
  font: 'inherit',
} as React.CSSProperties;

const fieldClass =
  'w-full min-w-[14ch] resize-none rounded-md bg-white/10 px-1.5 py-0.5 text-inherit placeholder:text-white/50 outline-none ring-1 ring-white/40 focus:ring-2 focus:ring-sky-300';

/** Plain-text label and body fields drawn inside the callout itself. */
export const InlineCalloutEditor: React.FC<InlineCalloutEditorProps> = ({
  step,
  onChange,
  onDone,
  holdOpen = false,
  editKeys = false,
}) => {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!editKeys || e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onDone();
      return;
    }
    if (e.target instanceof HTMLInputElement && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      textRef.current?.focus();
    }
  };

  const text = step.text ?? '';
  const words = countWords(text);

  return (
    <div
      ref={rootRef}
      data-testid="gl-inline-editor"
      className="pointer-events-auto flex flex-col gap-1 text-left"
      style={{ font: 'inherit' }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        if (holdOpen) return;
        const next = e.relatedTarget;
        if (next instanceof Node && rootRef.current?.contains(next)) return;
        onDone();
      }}
    >
      <input
        data-gl-inline="label"
        aria-label={t('glStudio.inlineLabel')}
        placeholder={t('glStudio.inlineLabelPlaceholder')}
        value={step.label ?? ''}
        onChange={(e) => onChange({ ...step, label: e.target.value })}
        className={fieldClass}
        style={{ ...AUTO_SIZE, fontWeight: 700 }}
      />
      <textarea
        ref={textRef}
        data-gl-inline="text"
        aria-label={t('glStudio.inlineText')}
        placeholder={t('glStudio.inlineTextPlaceholder')}
        value={text}
        rows={Math.max(1, text.split('\n').length)}
        onChange={(e) => onChange({ ...step, text: e.target.value })}
        className={fieldClass}
        style={AUTO_SIZE}
      />
      {words > SOFT_WORD_LIMIT && (
        <span
          data-testid="gl-inline-word-count"
          className="text-xs font-normal opacity-80"
        >
          {t('glStudio.wordCount', { count: words, limit: SOFT_WORD_LIMIT })}
        </span>
      )}
    </div>
  );
};
