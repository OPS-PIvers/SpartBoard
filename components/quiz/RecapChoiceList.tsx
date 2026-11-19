import React from 'react';
import { Check, X as XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { QuizPublicQuestion } from '@/types';
import type { AnswerPicture } from '@/utils/quizAnswerImages';
import { recapChoiceMarks } from '@/utils/quizRecapChoiceMarks';
import { parseMultiAnswer } from '@/utils/quizMultiAnswer';
import { normalizeAnswer } from '@/hooks/useQuizSession';
import { AnswerPictureText } from './AnswerPictureText';

/** Every option of a choice question in the results recap, with the student's picks marked. */
export const RecapChoiceList: React.FC<{
  question: QuizPublicQuestion;
  /** English choices, index-aligned with `question.choices`, matched against the stored answer. */
  canonicalChoices: readonly string[];
  /** English text of options this student's modifications hid. */
  hiddenChoices?: readonly string[];
  studentAnswer: string;
  verdict: boolean | undefined;
  /** The answer key, only when the published level reveals it. */
  correctAnswer: string | undefined;
  pictures: ReadonlyMap<string, AnswerPicture>;
  light: boolean;
}> = ({
  question,
  canonicalChoices,
  hiddenChoices,
  studentAnswer,
  verdict,
  correctAnswer,
  pictures,
  light,
}) => {
  const { t } = useTranslation();
  const hidden = new Set(hiddenChoices ?? []);
  const rows = canonicalChoices
    .map((canonical, i) => ({
      canonical,
      text: question.choices?.[i] ?? canonical,
    }))
    .filter((row) => !hidden.has(row.canonical));
  // A pick that matches no shown option (reworded or since hidden) still shows.
  const shownKeys = new Set(rows.map((row) => normalizeAnswer(row.canonical)));
  for (const pick of question.type === 'MA'
    ? parseMultiAnswer(studentAnswer)
    : studentAnswer
      ? [studentAnswer]
      : []) {
    if (!shownKeys.has(normalizeAnswer(pick))) {
      shownKeys.add(normalizeAnswer(pick));
      rows.push({ canonical: pick, text: pick });
    }
  }
  const marks = recapChoiceMarks(
    question.type,
    rows.map((row) => row.canonical),
    studentAnswer,
    verdict,
    correctAnswer
  );
  const rightText = light ? 'text-emerald-700' : 'text-emerald-300';
  const wrongText = light ? 'text-red-600' : 'text-red-300';
  const plainText = light ? 'text-slate-700' : 'text-slate-200';
  const mutedText = light ? 'text-slate-500' : 'text-slate-300';
  const lines = light
    ? 'border-slate-200 divide-slate-200'
    : 'border-slate-700 divide-slate-700';

  return (
    <>
      {!studentAnswer && (
        <p className={`text-xs ${mutedText}`}>
          {t('quizStudent.results.noResponse')}
        </p>
      )}
      <ul className={`divide-y overflow-hidden rounded-lg border ${lines}`}>
        {rows.map(({ text: choice }, i) => {
          const mark = marks[i] ?? 'none';
          const isPick =
            mark === 'right' || mark === 'wrong' || mark === 'picked';
          const tone =
            mark === 'right' || mark === 'key'
              ? rightText
              : mark === 'wrong'
                ? wrongText
                : mark === 'picked'
                  ? plainText
                  : mutedText;
          const rowBg =
            mark === 'right'
              ? light
                ? 'bg-emerald-50'
                : 'bg-emerald-500/10'
              : mark === 'wrong'
                ? light
                  ? 'bg-red-50'
                  : 'bg-red-500/10'
                : mark === 'picked'
                  ? light
                    ? 'bg-slate-100'
                    : 'bg-slate-700/40'
                  : '';
          const tag = isPick
            ? t('quizStudent.results.yourAnswerTag')
            : mark === 'key'
              ? t('quizStudent.results.correctAnswerTag')
              : null;
          return (
            <li
              key={`${i}-${choice}`}
              data-mark={mark}
              className={`flex items-center gap-2.5 px-3 py-2 text-sm ${rowBg}`}
            >
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
                {mark === 'right' || mark === 'key' ? (
                  <Check className={`h-4 w-4 ${rightText}`} aria-hidden />
                ) : mark === 'wrong' ? (
                  <XIcon className={`h-4 w-4 ${wrongText}`} aria-hidden />
                ) : (
                  <span
                    className={`h-3.5 w-3.5 border-2 ${
                      question.type === 'MA' ? 'rounded-sm' : 'rounded-full'
                    } ${
                      mark === 'picked'
                        ? light
                          ? 'border-slate-700 bg-slate-700'
                          : 'border-slate-200 bg-slate-200'
                        : light
                          ? 'border-slate-300'
                          : 'border-slate-500'
                    }`}
                    aria-hidden
                  />
                )}
              </span>
              <span
                className={`min-w-0 flex-1 wrap-break-word ${tone} ${
                  isPick ? 'font-semibold' : ''
                }`}
              >
                <AnswerPictureText text={choice} pictures={pictures} />
              </span>
              {tag && (
                <span className={`shrink-0 text-xs font-semibold ${tone}`}>
                  {tag}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
};
