// Speak's Level, Attempts per card, Strict and Hear it, picked when assigning (flashcards-assign-v2).
import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  FlashcardSpeakSettings,
  SpeakLanguage,
  SpeakPreset,
} from '@/types';
import { Toggle } from '@/components/common/Toggle';
import { SPEAK_PRESET_IDS } from '@/config/pronunciationGroups';
import {
  SPEAK_ATTEMPTS_MAX,
  SPEAK_ATTEMPTS_MIN,
} from '@/config/flashcardsSpeakAdmin';
import { tourAttr } from '@/config/tourAnchors';
import {
  applySpeakPreset,
  setSpeakStrict,
} from '@/components/widgets/Flashcards/speak/speakEditorState';

export interface FlashcardsSpeakRulesProps {
  language: SpeakLanguage;
  value: FlashcardSpeakSettings;
  onChange: (value: FlashcardSpeakSettings) => void;
}

const ROW_CLASS = 'flex min-h-8 items-center justify-between gap-3';
const LABEL_CLASS = 'text-sm font-bold text-brand-blue-dark';
const SELECT_CLASS =
  'h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-hidden';

const ATTEMPTS = Array.from(
  { length: SPEAK_ATTEMPTS_MAX - SPEAK_ATTEMPTS_MIN + 1 },
  (_, i) => SPEAK_ATTEMPTS_MIN + i
);

export const FlashcardsSpeakRules: React.FC<FlashcardsSpeakRulesProps> = ({
  language,
  value,
  onChange,
}) => {
  const { t } = useTranslation();
  const levelId = useId();
  const levelHelpId = useId();
  const attemptsId = useId();
  const presets: SpeakPreset[] =
    value.preset === 'custom'
      ? [...SPEAK_PRESET_IDS, 'custom']
      : [...SPEAK_PRESET_IDS];
  const strictLabel = t('flashcards.speak.editor.strict', 'Strict');
  const exampleLabel = t('flashcards.speak.editor.example', 'Hear it button');

  return (
    <div className="space-y-2">
      <div>
        <div className={ROW_CLASS}>
          <label htmlFor={levelId} className={LABEL_CLASS}>
            {t('flashcards.speak.editor.level', 'Level')}
          </label>
          <select
            id={levelId}
            value={value.preset}
            aria-describedby={
              value.preset === 'custom' ? undefined : levelHelpId
            }
            onChange={(event) =>
              onChange(
                applySpeakPreset(
                  value,
                  language,
                  event.target.value as SpeakPreset
                )
              )
            }
            className={SELECT_CLASS}
            {...tourAttr('flashcards-speak.level')}
          >
            {presets.map((preset) => (
              <option key={preset} value={preset}>
                {t(`flashcards.speak.editor.presets.${preset}`)}
              </option>
            ))}
          </select>
        </div>
        {value.preset !== 'custom' && (
          <p id={levelHelpId} className="text-xs text-slate-500">
            {t(`flashcards.speak.editor.presets.${value.preset}Help`)}
          </p>
        )}
      </div>
      <div className={ROW_CLASS}>
        <label htmlFor={attemptsId} className={LABEL_CLASS}>
          {t('flashcards.speak.editor.attempts', 'Attempts per card')}
        </label>
        <select
          id={attemptsId}
          value={value.attempts}
          onChange={(event) =>
            onChange({ ...value, attempts: Number(event.target.value) })
          }
          className={SELECT_CLASS}
          {...tourAttr('flashcards-speak.attempts')}
        >
          {ATTEMPTS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className={ROW_CLASS}>
        <span className={LABEL_CLASS}>{strictLabel}</span>
        <Toggle
          size="sm"
          label={strictLabel}
          anchor={tourAttr('flashcards-speak.strict')}
          checked={value.strict}
          onChange={(strict) => onChange(setSpeakStrict(value, strict))}
        />
      </div>
      <div className={ROW_CLASS}>
        <span className={LABEL_CLASS}>{exampleLabel}</span>
        <Toggle
          size="sm"
          label={exampleLabel}
          anchor={tourAttr('flashcards-speak.example')}
          checked={value.example}
          onChange={(example) => onChange({ ...value, example })}
        />
      </div>
    </div>
  );
};
