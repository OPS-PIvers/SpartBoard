import React, { useState } from 'react';
import {
  FLASHCARD_LANGUAGES,
  describeLanguageTag,
  isFlashcardLanguagePreset,
} from './utils/flashcardLanguages';

const OTHER = '__other__';

const FIELD_STYLE = {
  padding: 'min(8px, 2cqmin)',
  fontSize: 'min(13px, 4cqmin)',
} as const;

const FIELD_CLASS =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20';

interface FlashcardLanguageFieldProps {
  label: string;
  value: string;
  onChange: (tag: string) => void;
}

export const FlashcardLanguageField: React.FC<FlashcardLanguageFieldProps> = ({
  label,
  value,
  onChange,
}) => {
  const [otherOpen, setOtherOpen] = useState(
    () => value.trim() !== '' && !isFlashcardLanguagePreset(value)
  );
  const selectId = `flashcard-language-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const customName = describeLanguageTag(value);

  return (
    <div>
      <label
        htmlFor={selectId}
        className="font-black uppercase tracking-widest text-slate-500"
        style={{ fontSize: 'min(10px, 3.2cqmin)' }}
      >
        {label}
      </label>
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
        className={FIELD_CLASS}
        style={FIELD_STYLE}
      >
        {FLASHCARD_LANGUAGES.map((language) => (
          <option key={language.tag} value={language.tag}>
            {language.label}
          </option>
        ))}
        <option value={OTHER}>Other language…</option>
      </select>
      {otherOpen && (
        <>
          <input
            aria-label={`${label} code`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
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
