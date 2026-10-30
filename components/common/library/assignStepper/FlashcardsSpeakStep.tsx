// Speak step for a Flashcards study assignment (docs/multilingual-pronunciation-engine.md §4.3, S10).
import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Toggle } from '@/components/common/Toggle';
import { tourAttr } from '@/config/tourAnchors';
import type { FlashcardsSpeakValue } from './flashcardsSpeakValue';

export interface FlashcardsSpeakStepProps {
  value: FlashcardsSpeakValue;
  onChange: (value: FlashcardsSpeakValue) => void;
}

const ROW_CLASS = 'flex min-h-8 items-center justify-between gap-3';
const LABEL_CLASS = 'text-sm font-bold text-brand-blue-dark';

export const FlashcardsSpeakStep: React.FC<FlashcardsSpeakStepProps> = ({
  value,
  onChange,
}) => {
  const { t } = useTranslation();
  const lockHelpId = useId();
  const showLabel = t(
    'flashcards.speak.assign.show',
    'Let students practice aloud'
  );
  const lockLabel = t('flashcards.speak.assign.lock', 'Lock Speak settings');

  return (
    <div className="space-y-3">
      <div className={ROW_CLASS}>
        <span className={LABEL_CLASS}>{showLabel}</span>
        <Toggle
          size="sm"
          label={showLabel}
          anchor={tourAttr('flashcards-speak.show')}
          checked={value.show}
          onChange={(show) => onChange({ ...value, show })}
        />
      </div>
      {value.show && (
        <div>
          <div className={ROW_CLASS}>
            <span className={LABEL_CLASS}>{lockLabel}</span>
            <Toggle
              size="sm"
              label={lockLabel}
              anchor={tourAttr('flashcards-speak.lock')}
              describedBy={lockHelpId}
              checked={value.lock}
              onChange={(lock) => onChange({ ...value, lock })}
            />
          </div>
          <p id={lockHelpId} className="text-xs text-slate-500">
            {t(
              'flashcards.speak.assign.lockHelp',
              "Students use your attempts and Hear it settings and can't change them."
            )}
          </p>
        </div>
      )}
    </div>
  );
};
