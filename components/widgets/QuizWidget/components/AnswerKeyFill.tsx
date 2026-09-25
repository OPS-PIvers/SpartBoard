/**
 * "Add answer key": read a key file on its own and fill the questions that
 * still need an answer (docs/plans/QUIZ_IMPORT_RELIABILITY.md R17, R26, R31).
 * Nothing is written until the teacher has seen what will and won't go in.
 */

import React, { useState } from 'react';
import { KeyRound, Loader2, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { TestAndKeyUploader } from '@/components/common/library/importer/TestAndKeyUploader';
import type { QuizData, QuizQuestion } from '@/types';
import type { SavedKeyFill } from '@/utils/quizDocumentImport';
import { readKeyDocument } from '@/utils/quizDocumentImport/readTestAndKey';
import type { UploadedDocument } from '@/utils/quizDocumentImport/uploadIntake';
import { keyFillLabel, readKeyFill, type ReadKeyFile } from './keyFillRead';
import { multiAnswerCorrectOptions } from '@/utils/quizMultiAnswer';
import { countQuestionsNeedingKey } from '@/utils/quizNeedsKey';

/** The answer as the teacher will recognise it: its letter on the paper, then its text. */
function answerShown(before: QuizQuestion, after: QuizQuestion): string {
  const picked =
    after.type === 'MA'
      ? multiAnswerCorrectOptions(after.correctAnswer)
      : [after.correctAnswer];
  return picked
    .map((text) => {
      // A stub's choices are the letters themselves, so only imported rows get one added.
      const at = before.needsKey ? before.incorrectAnswers.indexOf(text) : -1;
      const letter = at === -1 ? '' : String.fromCharCode(65 + at);
      return letter && letter !== text ? `${letter} (${text})` : text;
    })
    .join(', ');
}

interface KeyFillReviewProps {
  before: readonly QuizQuestion[];
  result: SavedKeyFill;
}

/** What the key will fill, and every entry that won't go in with its reason. */
export const KeyFillReview: React.FC<KeyFillReviewProps> = ({
  before,
  result,
}) => {
  const filled = new Set(result.filled);
  const rowOf = new Map(before.map((q, i) => [q.id, i]));
  const stillNeeded = countQuestionsNeedingKey(result.questions);
  return (
    <div className="space-y-3">
      {result.filled.length === 0 && result.skipped.length === 0 ? (
        <p className="text-sm text-slate-700">
          No numbered answers were found in this file.
        </p>
      ) : (
        <p className="text-sm text-slate-700">
          {result.filled.length === 1
            ? '1 answer will be filled in.'
            : `${result.filled.length} answers will be filled in.`}{' '}
          {stillNeeded === 0
            ? 'Every question will then have an answer.'
            : stillNeeded === 1
              ? '1 question will still need an answer.'
              : `${stillNeeded} questions will still need an answer.`}
        </p>
      )}
      {result.filled.length > 0 && (
        <ol aria-label="Answers to fill in" className="space-y-1">
          {result.questions.map((q, i) => {
            if (!filled.has(q.id)) return null;
            const printed = q.sourceLabel ?? String(i + 1);
            return (
              <li
                key={q.id}
                className="flex gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm"
              >
                <span className="w-14 shrink-0 font-semibold text-slate-700">
                  {printed}.
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-800">
                  {answerShown(before[i], q)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {result.skipped.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-700">Not filled in</p>
          <ul aria-label="Not filled in" className="mt-1 space-y-1">
            {result.skipped.map((skip, i) => {
              const row =
                skip.questionId !== undefined
                  ? rowOf.get(skip.questionId)
                  : undefined;
              return (
                <li key={i} className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">
                    Key {skip.label}
                  </span>
                  {row !== undefined && row + 1 !== Number(skip.label)
                    ? ` (question ${row + 1})`
                    : ''}
                  : {skip.reason}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

interface AnswerKeyFillModalProps {
  quiz: QuizData;
  /** Writes the fill; the caller decides whether that is a save or an editor change. */
  onApply: (result: SavedKeyFill) => Promise<void> | void;
  onPickFromDrive?: () => Promise<File | null>;
  onClose: () => void;
  onError: (message: string) => void;
  /** Test seam. */
  readKey?: ReadKeyFile;
}

type Step = 'setup' | 'reading' | 'review' | 'saving';

export const AnswerKeyFillModal: React.FC<AnswerKeyFillModalProps> = ({
  quiz,
  onApply,
  onPickFromDrive,
  onClose,
  onError,
  readKey = readKeyDocument,
}) => {
  const [step, setStep] = useState<Step>('setup');
  const [result, setResult] = useState<SavedKeyFill | null>(null);

  const read = async (key: UploadedDocument | null) => {
    if (!key) return;
    setStep('reading');
    try {
      setResult(await readKeyFill(quiz.questions, key, readKey));
      setStep('review');
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Could not read the answer key.'
      );
      setStep('setup');
    }
  };

  const apply = async () => {
    if (!result) return;
    setStep('saving');
    try {
      await onApply(result);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save the quiz.');
      setStep('review');
    }
  };

  const header = (
    <div className="flex items-start justify-between border-b border-slate-100 px-5 pb-3 pt-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary">
          <KeyRound className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">Add answer key</h2>
          <p className="mt-0.5 max-w-[24rem] truncate text-xs text-slate-500">
            {quiz.title || 'Untitled quiz'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  const footer =
    step === 'review' && result ? (
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setStep('setup')}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => void apply()}
          disabled={result.filled.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {keyFillLabel(result.filled.length)}
        </button>
      </div>
    ) : undefined;

  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel="Add answer key"
      maxWidth="max-w-xl"
      contentClassName=""
      customHeader={header}
      footer={footer}
    >
      {step === 'setup' && (
        <div className="space-y-4 px-5 pb-5 pt-4">
          <p className="text-sm text-slate-700">
            Only questions without an answer are filled in.
          </p>
          <TestAndKeyUploader
            zones="key"
            pickFromDrive={
              onPickFromDrive
                ? async () => {
                    const file = await onPickFromDrive();
                    return file ? { file, fileName: file.name } : null;
                  }
                : undefined
            }
            submitLabel="Read the answer key"
            onSubmit={({ key }) => void read(key)}
          />
        </div>
      )}
      {(step === 'reading' || step === 'saving') && (
        <div className="flex items-center gap-3 px-5 py-8 text-sm text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          {step === 'reading' ? 'Reading the answer key…' : 'Saving…'}
        </div>
      )}
      {step === 'review' && result && (
        <div className="px-5 pb-5 pt-4">
          <KeyFillReview before={quiz.questions} result={result} />
        </div>
      )}
    </Modal>
  );
};
