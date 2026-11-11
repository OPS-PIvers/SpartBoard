import React, { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import type { QuizQuestion } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import { tourTypeAttr } from '@/config/tourAnchors';
import { DOK_LEVELS } from '@/utils/quizDok';
import { inputClass, labelClass } from './quizEditorFieldStyles';

interface BankDokFilterProps {
  questions: readonly Pick<QuizQuestion, 'dok'>[];
  value: number[];
  onChange: (next: number[]) => void;
}

/** Draw only questions at one DOK level; absent unless the bank has levels. */
export const BankDokFilter: React.FC<BankDokFilterProps> = ({
  questions,
  value,
  onChange,
}) => {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const hasDok = questions.some((q) => q.dok != null);
  if (
    auth?.canAccessFeature?.('quiz-dok') !== true ||
    (!hasDok && value.length === 0)
  )
    return null;
  return (
    <div>
      <label className={labelClass}>{t('quizDok.level', 'DOK level')}</label>
      <select
        value={value[0] ?? ''}
        aria-label={t('quizDok.level', 'DOK level')}
        onChange={(e) => {
          const level = Number(e.target.value);
          onChange(level > 0 ? [level] : []);
        }}
        className={inputClass}
        {...tourTypeAttr('quiz-bank-draw.dok', 'quiz')}
      >
        <option value="">{t('quizDok.any', 'Any DOK')}</option>
        {DOK_LEVELS.map((level) => (
          <option key={level} value={level}>
            {t('quizDok.levelOption', {
              level,
              defaultValue: 'DOK {{level}}',
            })}
          </option>
        ))}
      </select>
    </div>
  );
};
