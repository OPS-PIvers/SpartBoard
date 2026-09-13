/**
 * Languages tab (plan §8): pick a target language, generate, review question by
 * question, mark reviewed. Only reviewed + hash-fresh questions ever publish.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, Loader2 } from 'lucide-react';
import type { QuestionTranslation, QuizData, QuizMetadata } from '@/types';
import { QUIZ_TRANSLATION_LANGUAGES } from '@/config/quizTranslation';
import { isNonEnglishSource } from '@/utils/quizTranslationSource';
import type { UseQuizTranslations } from '@/hooks/useQuizTranslations';
import { QuizAuthoringAdvisory } from './QuizAuthoringAdvisory';

export interface QuizLanguagesPaneProps {
  quiz: QuizData;
  metadata?: QuizMetadata | null;
  api: UseQuizTranslations;
  selectedLocale: string | null;
  onSelectLocale: (locale: string) => void;
  selectedQuestionId: string | null;
  onSelectQuestion: (questionId: string) => void;
}

/** Empty-state card shared by both no-language and nothing-reviewed states. */
const EmptyState: React.FC<{ title: string; body: string }> = ({
  title,
  body,
}) => (
  <div className="flex h-full flex-col items-center justify-center px-8 text-center text-slate-500">
    <Languages className="mb-3 h-8 w-8 text-slate-400" aria-hidden />
    <p className="text-sm font-bold text-slate-700">{title}</p>
    <p className="mt-1 max-w-sm text-xs">{body}</p>
  </div>
);

export const QuizLanguagesContextPane: React.FC<QuizLanguagesPaneProps> = ({
  quiz,
  metadata,
  api,
  selectedLocale,
  onSelectLocale,
  selectedQuestionId,
  onSelectQuestion,
}) => {
  const { t } = useTranslation();
  const payload = selectedLocale ? api.byLocale[selectedLocale] : undefined;
  const translatableSet = useMemo(
    () => new Set(api.translatableIds),
    [api.translatableIds]
  );
  // D21: FIB rows are not translated, so they never appear in the review list.
  const rows = quiz.questions.filter((q) => translatableSet.has(q.id));
  const requested = useRef<Set<string>>(new Set());
  // Rehydrate a saved sidecar from Drive the first time its chip is selected.
  useEffect(() => {
    if (!selectedLocale) return;
    if (!metadata?.translations?.[selectedLocale]?.driveFileId) return;
    if (api.byLocale[selectedLocale]) return;
    if (requested.current.has(selectedLocale)) return;
    requested.current.add(selectedLocale);
    void api.load(selectedLocale);
  }, [api, metadata, selectedLocale]);
  const stale = selectedLocale ? api.staleIds(selectedLocale) : [];
  const staleSet = new Set(stale);
  const busy = selectedLocale ? api.loading[selectedLocale] === true : false;

  // Exactly one disabled reason, in precedence order (§8 copy table).
  const disabledReason = quiz.bankSlots?.length
    ? t('quizTranslation.editor.disabled.bankSlots')
    : isNonEnglishSource(quiz)
      ? t('quizTranslation.editor.disabled.sourceNotEnglish')
      : api.cap && api.cap.remaining <= 0
        ? t('quizTranslation.editor.disabled.capReached')
        : null;

  const servedCount = (locale: string): number => {
    const entry = api.byLocale[locale];
    if (!entry) return 0;
    const localeStale = new Set(api.staleIds(locale));
    return entry.reviewedQuestionIds.filter(
      (id) => translatableSet.has(id) && !localeStale.has(id)
    ).length;
  };

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="space-y-3 border-b border-slate-200 bg-white px-5 py-4">
        <QuizAuthoringAdvisory
          questions={quiz.questions}
          stimuli={quiz.stimuli}
          translationAvailable
          ids={['stimulus-text']}
        />
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            {t('quizTranslation.editor.pickLanguage')}
          </p>
          <div className="flex flex-wrap gap-2">
            {QUIZ_TRANSLATION_LANGUAGES.map((language) => {
              const active = selectedLocale === language.code;
              return (
                <button
                  key={language.code}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelectLocale(language.code)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                    active
                      ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-brand-blue-primary'
                  }`}
                >
                  {language.nativeLabel}
                  <span
                    className={`ml-2 font-normal ${active ? 'text-white/80' : 'text-slate-500'}`}
                  >
                    {t('quizTranslation.editor.servedCount', {
                      reviewed: servedCount(language.code),
                      total: rows.length,
                      language: language.nativeLabel,
                    })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {selectedLocale && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!!disabledReason || busy}
                onClick={() => void api.generate(selectedLocale)}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-blue-primary px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {busy && (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                )}
                {t('quizTranslation.editor.generate')}
              </button>
              {payload && stale.length > 0 && (
                <button
                  type="button"
                  disabled={!!disabledReason || busy}
                  onClick={() => void api.generate(selectedLocale, stale)}
                  className="rounded-lg border border-amber-400 px-3 py-2 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  {t('quizTranslation.editor.regenerate', {
                    count: stale.length,
                  })}
                </button>
              )}
              {payload && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void api.save(selectedLocale)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-slate-300 disabled:text-slate-400"
                >
                  {t('quizTranslation.editor.save')}
                </button>
              )}
            </div>
            {disabledReason && (
              <p role="status" className="text-xxs text-slate-500">
                {disabledReason}
              </p>
            )}
            {api.error && (
              <p role="status" className="text-xxs text-brand-red-primary">
                {api.error}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {payload && selectedLocale ? (
          <ul className="space-y-1.5">
            {rows.map((question, index) => {
              const reviewed = payload.reviewedQuestionIds.includes(
                question.id
              );
              const isStale = staleSet.has(question.id);
              const selected = selectedQuestionId === question.id;
              return (
                <li key={question.id}>
                  <div
                    className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 ${
                      selected
                        ? 'border-brand-blue-primary bg-white'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={reviewed}
                      aria-label={t('quizTranslation.editor.reviewed')}
                      onChange={(e) =>
                        api.setReviewed(
                          selectedLocale,
                          question.id,
                          e.target.checked
                        )
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 accent-brand-blue-primary"
                    />
                    <button
                      type="button"
                      onClick={() => onSelectQuestion(question.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="line-clamp-2 text-xs text-slate-700">
                        {index + 1}. {question.text}
                      </span>
                    </button>
                    {isStale && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xxs font-bold uppercase tracking-wider text-amber-700">
                        {t('quizTranslation.editor.stale')}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">
            {selectedLocale
              ? t('quizTranslation.editor.empty.noneReviewed.body')
              : t('quizTranslation.editor.empty.noLanguage.body')}
          </p>
        )}
      </div>
    </div>
  );
};

export const QuizLanguagesDetailPane: React.FC<QuizLanguagesPaneProps> = ({
  quiz,
  api,
  selectedLocale,
  selectedQuestionId,
}) => {
  const { t } = useTranslation();
  const payload = selectedLocale ? api.byLocale[selectedLocale] : undefined;
  const question = quiz.questions.find((q) => q.id === selectedQuestionId);
  const language = QUIZ_TRANSLATION_LANGUAGES.find(
    (l) => l.code === selectedLocale
  );

  if (!selectedLocale) {
    return (
      <EmptyState
        title={t('quizTranslation.editor.empty.noLanguage.title')}
        body={t('quizTranslation.editor.empty.noLanguage.body')}
      />
    );
  }
  if (!payload || Object.keys(payload.questions).length === 0) {
    return (
      <EmptyState
        title={t('quizTranslation.editor.empty.noneReviewed.title')}
        body={t('quizTranslation.editor.empty.noneReviewed.body')}
      />
    );
  }
  if (!question) {
    return (
      <EmptyState
        title={t('quizTranslation.editor.empty.pickQuestion.title')}
        body={t('quizTranslation.editor.empty.pickQuestion.body')}
      />
    );
  }

  const entry: QuestionTranslation | undefined = payload.questions[question.id];
  const edit = (patch: Partial<QuestionTranslation>) =>
    api.editQuestion(selectedLocale, question.id, patch);
  const editArray = (
    field: 'choices' | 'matchingLeft' | 'matchingRight' | 'orderingItems',
    index: number,
    value: string
  ) => {
    const next = [...(entry?.[field] ?? [])];
    next[index] = value;
    edit({ [field]: next } as Partial<QuestionTranslation>);
  };

  const englishChoices = [
    question.correctAnswer,
    ...question.incorrectAnswers.filter(Boolean),
  ];

  const row = (
    key: string,
    english: string,
    translated: string,
    onChange: (value: string) => void
  ) => (
    <div key={key} className="grid grid-cols-2 gap-3">
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {english}
      </p>
      <textarea
        value={translated}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-brand-blue-primary focus:outline-none"
      />
    </div>
  );

  return (
    <div className="custom-scrollbar h-full overflow-y-auto bg-white px-6 py-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {language?.nativeLabel ?? selectedLocale}
        </h4>
        {language && !['en', 'es', 'de', 'fr'].includes(language.code) && (
          <p className="text-xxs text-slate-500">
            {t('quizTranslation.editor.chromeNote')}
          </p>
        )}
      </div>
      <div className="space-y-3">
        {row('text', question.text, entry?.text ?? '', (value) =>
          edit({ text: value })
        )}
        {question.type === 'MC' &&
          englishChoices.map((choice, i) =>
            row(`choice-${i}`, choice, entry?.choices?.[i] ?? '', (value) =>
              editArray('choices', i, value)
            )
          )}
        {question.type === 'Ordering' &&
          question.correctAnswer
            .split('|')
            .map((item, i) =>
              row(
                `order-${i}`,
                item,
                entry?.orderingItems?.[i] ?? '',
                (value) => editArray('orderingItems', i, value)
              )
            )}
        {question.type === 'Matching' &&
          question.correctAnswer.split('|').map((pair, i) => {
            const sep = pair.indexOf(':');
            const left = sep >= 0 ? pair.slice(0, sep) : pair;
            const right = sep >= 0 ? pair.slice(sep + 1) : '';
            return (
              <React.Fragment key={`pair-${i}`}>
                {row(
                  `left-${i}`,
                  left,
                  entry?.matchingLeft?.[i] ?? '',
                  (value) => editArray('matchingLeft', i, value)
                )}
                {row(
                  `right-${i}`,
                  right,
                  entry?.matchingRight?.[i] ?? '',
                  (value) => editArray('matchingRight', i, value)
                )}
              </React.Fragment>
            );
          })}
        {question.placeholder !== undefined &&
          row(
            'placeholder',
            question.placeholder ?? '',
            entry?.placeholder ?? '',
            (value) => edit({ placeholder: value })
          )}
      </div>
    </div>
  );
};
