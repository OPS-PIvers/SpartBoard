import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import type {
  GuidedLearningQuestion,
  GuidedLearningQuestionType,
  GuidedLearningStep,
} from '@/types';
import {
  ChoiceGroup,
  Field,
  fieldLabelClass,
  inputClass,
  quietButtonClass,
} from './panelControls';

type StepChange = (next: GuidedLearningStep, field?: string | false) => void;

const QUESTION_TYPES: readonly GuidedLearningQuestionType[] = [
  'multiple-choice',
  'matching',
  'sorting',
];
const MAX_CHOICES = 6;
const MAX_PAIRS = 8;
const MAX_ITEMS = 10;

const rowInputClass =
  'min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40';
const removeButtonClass =
  'shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40';

const emptyQuestion = (): GuidedLearningQuestion => ({
  type: 'multiple-choice',
  text: '',
  choices: ['', '', '', ''],
  correctAnswer: '',
});

/** Question type, prompt and answer key for a question step. */
export const StudioQuestionFields: React.FC<{
  step: GuidedLearningStep;
  onChange: StepChange;
}> = ({ step, onChange }) => {
  const { t } = useTranslation();
  const q = step.question ?? emptyQuestion();
  const update = (
    patch: Partial<GuidedLearningQuestion>,
    field?: string | false
  ) => onChange({ ...step, question: { ...q, ...patch } }, field);

  return (
    <div className="flex flex-col gap-4" data-testid="gl-studio-question">
      <ChoiceGroup
        legend={t('glStudio.questionType')}
        value={q.type}
        options={QUESTION_TYPES.map((value) => ({
          value,
          label: t(`glStudio.question_${value}`),
        }))}
        onChange={(type) => update({ type }, false)}
      />
      <Field label={t('glStudio.questionText')}>
        <textarea
          value={q.text}
          onChange={(e) => update({ text: e.target.value }, 'question-text')}
          rows={2}
          placeholder={t('glStudio.questionTextPlaceholder')}
          className={`${inputClass} resize-none`}
        />
      </Field>
      {q.type === 'multiple-choice' && (
        <ChoicesEditor q={q} update={update} stepId={step.id} />
      )}
      {q.type === 'matching' && <PairsEditor q={q} update={update} />}
      {q.type === 'sorting' && <SortingEditor q={q} update={update} />}
    </div>
  );
};

type Update = (
  patch: Partial<GuidedLearningQuestion>,
  field?: string | false
) => void;

const ChoicesEditor: React.FC<{
  q: GuidedLearningQuestion;
  update: Update;
  stepId: string;
}> = ({ q, update, stepId }) => {
  const { t } = useTranslation();
  const choices = q.choices ?? ['', '', '', ''];
  const hasKey = !!q.correctAnswer && choices.includes(q.correctAnswer);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={`${fieldLabelClass} mb-1.5`}>
        {t('glStudio.answerChoices')}
      </legend>
      {choices.map((choice, idx) => {
        const n = idx + 1;
        const correct = choice !== '' && q.correctAnswer === choice;
        return (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="radio"
              name={`gl-correct-${stepId}`}
              checked={correct}
              disabled={choice === ''}
              onChange={() => update({ correctAnswer: choice }, false)}
              aria-label={t('glStudio.markCorrect', { n })}
              className="h-4 w-4 shrink-0 accent-emerald-700"
            />
            <input
              type="text"
              value={choice}
              aria-label={t('glStudio.choiceN', { n })}
              placeholder={t('glStudio.choiceN', { n })}
              onChange={(e) => {
                const next = choices.map((c, i) =>
                  i === idx ? e.target.value : c
                );
                update(
                  correct
                    ? { choices: next, correctAnswer: e.target.value }
                    : { choices: next },
                  `choice-${idx}`
                );
              }}
              className={rowInputClass}
            />
            {correct && (
              <span className="shrink-0 text-xxs font-bold text-emerald-800">
                {t('glStudio.correct')}
              </span>
            )}
            {choices.length > 2 && (
              <button
                type="button"
                onClick={() =>
                  update(
                    {
                      choices: choices.filter((_, i) => i !== idx),
                      ...(correct ? { correctAnswer: '' } : {}),
                    },
                    false
                  )
                }
                aria-label={t('glStudio.removeChoice', { n })}
                className={removeButtonClass}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
      {choices.length < MAX_CHOICES && (
        <button
          type="button"
          onClick={() => update({ choices: [...choices, ''] }, false)}
          className={quietButtonClass}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t('glStudio.addChoice')}
        </button>
      )}
      {!hasKey && (
        <p className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t('glStudio.noCorrectAnswer')}
        </p>
      )}
    </fieldset>
  );
};

const PairsEditor: React.FC<{
  q: GuidedLearningQuestion;
  update: Update;
}> = ({ q, update }) => {
  const { t } = useTranslation();
  const pairs = q.matchingPairs ?? [
    { left: '', right: '' },
    { left: '', right: '' },
  ];
  const setPair = (idx: number, side: 'left' | 'right', value: string) =>
    update(
      {
        matchingPairs: pairs.map((p, i) =>
          i === idx ? { ...p, [side]: value } : p
        ),
      },
      `pair-${idx}-${side}`
    );
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={`${fieldLabelClass} mb-1.5`}>
        {t('glStudio.matchingPairs')}
      </legend>
      {pairs.map((pair, idx) => {
        const n = idx + 1;
        return (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="text"
              value={pair.left}
              onChange={(e) => setPair(idx, 'left', e.target.value)}
              aria-label={t('glStudio.termN', { n })}
              placeholder={t('glStudio.term')}
              className={rowInputClass}
            />
            <span className="text-slate-400" aria-hidden="true">
              →
            </span>
            <input
              type="text"
              value={pair.right}
              onChange={(e) => setPair(idx, 'right', e.target.value)}
              aria-label={t('glStudio.matchN', { n })}
              placeholder={t('glStudio.match')}
              className={rowInputClass}
            />
            {pairs.length > 2 && (
              <button
                type="button"
                onClick={() =>
                  update(
                    { matchingPairs: pairs.filter((_, i) => i !== idx) },
                    false
                  )
                }
                aria-label={t('glStudio.removePair', { n })}
                className={removeButtonClass}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
      {pairs.length < MAX_PAIRS && (
        <button
          type="button"
          onClick={() =>
            update(
              { matchingPairs: [...pairs, { left: '', right: '' }] },
              false
            )
          }
          className={quietButtonClass}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t('glStudio.addPair')}
        </button>
      )}
    </fieldset>
  );
};

const SortingEditor: React.FC<{
  q: GuidedLearningQuestion;
  update: Update;
}> = ({ q, update }) => {
  const { t } = useTranslation();
  const items = q.sortingItems ?? ['', ''];
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={`${fieldLabelClass} mb-1.5`}>
        {t('glStudio.sortingItems')}
      </legend>
      {items.map((item, idx) => {
        const n = idx + 1;
        return (
          <div key={idx} className="flex items-center gap-2">
            <span
              className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-slate-500"
              aria-hidden="true"
            >
              {n}.
            </span>
            <input
              type="text"
              value={item}
              onChange={(e) =>
                update(
                  {
                    sortingItems: items.map((it, i) =>
                      i === idx ? e.target.value : it
                    ),
                  },
                  `item-${idx}`
                )
              }
              aria-label={t('glStudio.itemN', { n })}
              placeholder={t('glStudio.itemN', { n })}
              className={rowInputClass}
            />
            {items.length > 2 && (
              <button
                type="button"
                onClick={() =>
                  update(
                    { sortingItems: items.filter((_, i) => i !== idx) },
                    false
                  )
                }
                aria-label={t('glStudio.removeItem', { n })}
                className={removeButtonClass}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
      {items.length < MAX_ITEMS && (
        <button
          type="button"
          onClick={() => update({ sortingItems: [...items, ''] }, false)}
          className={quietButtonClass}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t('glStudio.addItem')}
        </button>
      )}
    </fieldset>
  );
};
