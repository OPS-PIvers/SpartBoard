// Read-aloud language picker for the quiz editor's Settings tab (docs/plans/shipped/QUIZ_READ_ALOUD.md §6.1).
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_QUIZ_LANGUAGE,
  QUIZ_READ_ALOUD_LANGUAGES,
} from '@/config/quizReadAloud';
import { inputClass, labelClass } from './quizEditorFieldStyles';
import { ReadAloudPreviewButton } from '@/components/quiz/readAloud/ReadAloudPreviewButton';

const OTHER = '__other__';

const isPreset = (tag: string) =>
  QUIZ_READ_ALOUD_LANGUAGES.some((l) => l.tag === tag);

export const QuizLanguageField: React.FC<{
  /** BCP-47 tag; '' means unset (read as en-US). */
  value: string;
  onChange: (next: string) => void;
}> = ({ value, onChange }) => {
  const { t } = useTranslation();
  // A saved custom tag opens in "Other"; picking Other with no tag yet keeps the free input visible.
  const [otherOpen, setOtherOpen] = useState(
    () => value !== '' && !isPreset(value)
  );
  const selectValue = otherOpen ? OTHER : value || DEFAULT_QUIZ_LANGUAGE;

  return (
    <div className="space-y-2">
      <p className="text-xxs font-bold text-brand-blue-primary/60 uppercase tracking-widest">
        {t('quizReadAloud.sectionLabel', 'Read aloud')}
      </p>
      <label className="block">
        <span className={labelClass}>
          {t('quizReadAloud.languageLabel', 'Language')}
        </span>
        <select
          className={inputClass}
          value={selectValue}
          onChange={(e) => {
            if (e.target.value === OTHER) {
              setOtherOpen(true);
              return;
            }
            setOtherOpen(false);
            onChange(
              e.target.value === DEFAULT_QUIZ_LANGUAGE ? '' : e.target.value
            );
          }}
        >
          {QUIZ_READ_ALOUD_LANGUAGES.map((l) => (
            <option key={l.tag} value={l.tag}>
              {l.label}
            </option>
          ))}
          <option value={OTHER}>
            {t('quizReadAloud.languageOther', 'Other…')}
          </option>
        </select>
      </label>
      {otherOpen && (
        <label className="block">
          <span className={labelClass}>
            {t('quizReadAloud.languageTagLabel', 'Language tag')}
          </span>
          <input
            type="text"
            className={inputClass}
            value={isPreset(value) ? '' : value}
            placeholder="pt-BR"
            spellCheck={false}
            onChange={(e) => onChange(e.target.value.trim())}
          />
        </label>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ReadAloudPreviewButton language={value || DEFAULT_QUIZ_LANGUAGE} />
      </div>
    </div>
  );
};
