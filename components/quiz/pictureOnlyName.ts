import type { useTranslation } from 'react-i18next';
import type { QuizPublicQuestion } from '@/types';
import { studentImageOnly } from '@/utils/quizAnswerImages';

type Translate = ReturnType<typeof useTranslation>['t'];

/** Spoken name ("Picture 2", or "Picture 2: a red triangle") for a picture-only answer; `n` counts from 1. */
export function pictureOnlyName(
  t: Translate,
  question: Pick<QuizPublicQuestion, 'imageOnlyAnswers'>,
  text: string,
  image: string | undefined,
  n: number
): string | undefined {
  const only = studentImageOnly(question, text, image);
  if (!only) return undefined;
  return only.alt
    ? t('quizAnswerPicture.nameWithAlt', {
        defaultValue: 'Picture {{n}}: {{alt}}',
        n,
        alt: only.alt,
      })
    : t('quizAnswerPicture.name', { defaultValue: 'Picture {{n}}', n });
}
