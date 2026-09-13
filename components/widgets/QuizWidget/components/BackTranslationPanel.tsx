/**
 * BackTranslationPanel — explicit teacher-side back-translation of one
 * free-response answer (docs/plans/QUIZ_TRANSLATION.md §6). The student's own
 * words stay the primary record; the English rendering is machine-generated
 * and clearly labelled as such.
 */

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Languages, Loader2 } from 'lucide-react';
import type { QuizResponseBackTranslation } from '@/types';
import { backTranslationCacheKey } from '@/utils/backTranslationHash';
import { requestBackTranslation } from '@/utils/backTranslationService';
import { logError } from '@/utils/logError';

export interface BackTranslationPanelProps {
  /** The student's answer, exactly as written. */
  text: string;
  /** Non-English BCP-47 tag the student was reading when they answered. */
  locale: string;
  /** Already-cached back-translations on this response doc, keyed by hash. */
  cache?: Record<string, QuizResponseBackTranslation>;
  /** Persists one hash through the teacher-owner response write path. */
  onSave: (hash: string, entry: QuizResponseBackTranslation) => Promise<void>;
  /** Renders the note that the student read a translated rubric. */
  translatedRubric?: boolean;
}

const errorCodeOf = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';

export const BackTranslationPanel: React.FC<BackTranslationPanelProps> = ({
  text,
  locale,
  cache,
  onSave,
  translatedRubric,
}) => {
  const { t } = useTranslation();
  const tb = useCallback(
    (key: string) => t(`quizTranslation.grading.${key}`),
    [t]
  );

  const [result, setResult] = useState<QuizResponseBackTranslation | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const translate = useCallback(async () => {
    setBusy(true);
    setErrorKey(null);
    try {
      const hash = await backTranslationCacheKey(text, locale);
      const cached = cache?.[hash];
      if (cached) {
        setResult(cached);
        return;
      }
      const { text: translated, model } = await requestBackTranslation(
        text,
        locale
      );
      const entry: QuizResponseBackTranslation = {
        text: translated,
        locale,
        model,
        at: Date.now(),
      };
      setResult(entry);
      await onSave(hash, entry);
    } catch (error) {
      logError('BackTranslationPanel', error);
      setErrorKey(
        errorCodeOf(error).endsWith('resource-exhausted')
          ? 'errors.capReached'
          : 'errors.failed'
      );
    } finally {
      setBusy(false);
    }
  }, [cache, locale, onSave, text]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {tb('sectionLabel')}
        </h4>
        <button
          type="button"
          onClick={() => void translate()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Languages aria-hidden className="h-3.5 w-3.5" />
          )}
          {tb(busy ? 'backTranslating' : 'backTranslate')}
        </button>
      </div>

      {errorKey && (
        <p
          role="alert"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-red-lighter/40 px-3 py-2 text-xs font-bold text-brand-red-dark"
        >
          <AlertCircle aria-hidden className="h-3.5 w-3.5" />
          {tb(errorKey)}
        </p>
      )}

      {result && (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {tb('nativeLabel')}
            </h5>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
              {text}
            </p>
          </div>
          <div className="md:border-l md:border-slate-200 md:pl-4">
            <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {tb('backTranslationLabel')}
            </h5>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
              {result.text}
            </p>
            <p className="mt-2 text-xs italic text-slate-500">
              {tb('machineGenerated')}
            </p>
          </div>
        </div>
      )}

      {translatedRubric && (
        <p className="mt-3 text-xs leading-snug text-slate-500">
          {tb('translatedRubricNote')}
        </p>
      )}
    </div>
  );
};
