import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  FLASHCARD_LANGUAGES,
  describeLanguageTag,
  isFlashcardLanguagePreset,
} from './utils/flashcardLanguages';
import { tourFieldAttr } from '@/config/tourAnchors';

const OTHER = '__other__';

const FIELD_STYLE = {
  padding: 'min(8px, 2cqmin)',
  fontSize: 'min(13px, 4cqmin)',
} as const;

const HEADING_SELECT_CLASS =
  'min-w-0 max-w-full cursor-pointer appearance-none truncate [field-sizing:content] rounded-lg border border-transparent bg-transparent font-semibold text-slate-600 outline-hidden hover:bg-slate-200/60 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20';

const HEADING_SELECT_STYLE = {
  padding:
    'min(3px, 1cqmin) min(24px, 6cqmin) min(3px, 1cqmin) min(6px, 1.5cqmin)',
  fontSize: 'min(13px, 4cqmin)',
} as const;

const FIELD_CLASS =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white text-slate-800 outline-hidden focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20';

interface FlashcardLanguageFieldProps {
  label: string;
  value: string;
  onChange: (tag: string) => void;
  tourField?: string;
  /** Shown as a column heading with a small text menu beside it. */
  heading?: string;
}

export const FlashcardLanguageField: React.FC<FlashcardLanguageFieldProps> = ({
  label,
  value,
  onChange,
  tourField,
  heading,
}) => {
  const [otherOpen, setOtherOpen] = useState(
    () => value.trim() !== '' && !isFlashcardLanguagePreset(value)
  );
  const selectId = `flashcard-language-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const customName = describeLanguageTag(value);

  const picker = (
    <select
      id={selectId}
      value={otherOpen ? OTHER : value || 'en-US'}
      onChange={(event) => {
        if (event.target.value === OTHER) {
          setOtherOpen(true);
          if (isFlashcardLanguagePreset(value)) onChange('');
          return;
        }
        setOtherOpen(false);
        onChange(event.target.value);
      }}
      aria-label={heading ? label : undefined}
      className={heading ? HEADING_SELECT_CLASS : FIELD_CLASS}
      style={heading ? HEADING_SELECT_STYLE : FIELD_STYLE}
      {...(tourField
        ? tourFieldAttr('flashcards.language-select', 'flashcards', tourField)
        : {})}
    >
      {FLASHCARD_LANGUAGES.map((language) => (
        <option key={language.tag} value={language.tag}>
          {language.label}
        </option>
      ))}
      <option value={OTHER}>Other language…</option>
    </select>
  );

  return (
    <div className="min-w-0">
      {heading ? (
        <div className="flex min-w-0 items-center gap-2">
          <label
            htmlFor={selectId}
            className="shrink-0 font-black uppercase tracking-widest text-slate-500"
            style={{ fontSize: 'min(11px, 3.4cqmin)' }}
          >
            {heading}
          </label>
          <span className="relative inline-flex min-w-0 items-center">
            {picker}
            <ChevronDown
              aria-hidden
              className="pointer-events-none absolute right-1.5 text-slate-400"
              style={{
                width: 'min(14px, 4cqmin)',
                height: 'min(14px, 4cqmin)',
              }}
            />
          </span>
        </div>
      ) : (
        <>
          <label
            htmlFor={selectId}
            className="font-black uppercase tracking-widest text-slate-500"
            style={{ fontSize: 'min(10px, 3.2cqmin)' }}
          >
            {label}
          </label>
          {picker}
        </>
      )}
      {otherOpen && (
        <>
          <input
            aria-label={`${label} code`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            {...(tourField
              ? tourFieldAttr(
                  'flashcards.language-code',
                  'flashcards',
                  tourField
                )
              : {})}
            className={FIELD_CLASS}
            style={FIELD_STYLE}
            placeholder="Language code, like vi or so"
          />
          <p
            className="mt-1 text-slate-500"
            style={{ fontSize: 'min(10px, 3.2cqmin)' }}
          >
            {customName ?? 'Enter a language code, like vi for Vietnamese.'}
          </p>
        </>
      )}
    </div>
  );
};
