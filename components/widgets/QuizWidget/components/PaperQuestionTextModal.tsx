/**
 * PaperQuestionTextModal — read a printed test paper and fill in the
 * placeholder question text of a paper stub (plan §8.3, Increment 3).
 *
 * OCR runs in the browser; nothing is uploaded. Grading never depends on
 * this: the key comes from the bubbled key sheet, scores from bubbles, so a
 * misread can only mislabel a question, and every row is editable first.
 */

import React, { useMemo, useRef, useState } from 'react';
import { CloudDownload, FileUp, Loader2, ScanText, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { AiReaderToggle } from '@/components/common/library/importer/AiReaderToggle';
import { useFileDrop } from '@/hooks/useFileDrop';
import type { QuizData } from '@/types';
import {
  applyQuestionFill,
  applyQuestionText,
  fillStubKey,
  isPlaceholderQuestion,
  parseNumberedQuestions,
  type QuestionFill,
} from '@/utils/paperQuestionOcr';
import { readByLabel } from '@/utils/quizDocumentImport';
import { recognizeRasterPage } from '@/utils/quizDocumentImport/imageBrowserDeps';
import type { ReadUploadedTest } from '@/utils/quizDocumentImport/readTestAndKey';
import type { UploadedDocument } from '@/utils/quizDocumentImport/uploadIntake';
import type { SavedKeyFill } from '@/utils/quizDocumentImport';
import { KeyFillReview } from './AnswerKeyFill';
import { keyFillLabel, readKeyFill, type ReadKeyFile } from './keyFillRead';
import {
  TestAndKeyUploader,
  type TestAndKeySelection,
} from '@/components/common/library/importer/TestAndKeyUploader';
import { rasterizeScan, type RasterizedPage } from '@/utils/paperScanRaster';
import type { RasterPage } from '@/utils/paperSheetReader';

interface PaperQuestionTextModalProps {
  quiz: QuizData;
  onSave: (quiz: QuizData) => Promise<void>;
  onPickFromDrive?: () => Promise<File | null>;
  onClose: () => void;
  onError: (message: string) => void;
  /**
   * Reads the paper with the import wizard's own readers (D17), which bring
   * back choices and a key rather than stem text alone. Supplied only when
   * the document-import feature is on; without it the OCR path below runs
   * exactly as it did before.
   */
  readDocument?: ReadUploadedTest;
  /** The teacher has AI access, so the reader can be switched off for a read. */
  canUseAi?: boolean;
  /** Test seams. */
  rasterize?: (file: Blob) => AsyncGenerator<RasterizedPage>;
  recognize?: (page: RasterPage) => Promise<string>;
  readKey?: ReadKeyFile;
}

type Step = 'setup' | 'reading' | 'review' | 'saving';

export const PaperQuestionTextModal: React.FC<PaperQuestionTextModalProps> = ({
  quiz,
  onSave,
  onPickFromDrive,
  onClose,
  onError,
  readDocument,
  canUseAi = false,
  rasterize = rasterizeScan,
  recognize = recognizeRasterPage,
  readKey,
}) => {
  const [step, setStep] = useState<Step>('setup');
  const [progress, setProgress] = useState('');
  const [picking, setPicking] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [apply, setApply] = useState<Record<number, boolean>>({});
  const [missing, setMissing] = useState<number[]>([]);
  // The choices and key the reader found, by row. Empty on the OCR path,
  // which only ever produced stem text.
  const [fills, setFills] = useState<Record<number, QuestionFill>>({});
  const [notes, setNotes] = useState<string[]>([]);
  const [useAi, setUseAi] = useState(false);
  const [readerNote, setReaderNote] = useState('');
  // Set when only a key was added: the review then shows the answer fill (R17).
  const [keyFill, setKeyFill] = useState<SavedKeyFill | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(
    () =>
      quiz.questions.map((q, i) => ({ row: i + 1, id: q.id, text: q.text })),
    [quiz]
  );

  /** Pre-tick a row only if it is still a placeholder (unchanged, D17). */
  const tickFor = (existing: string): boolean =>
    isPlaceholderQuestion(existing) || !existing.trim();

  /** The shared readers, which bring back choices and a key as well (D17). */
  const readWithImporter = async (
    test: UploadedDocument,
    key: UploadedDocument | null,
    read: ReadUploadedTest
  ) => {
    setProgress('Reading the test…');
    const extracted = await read(test, {
      ...(canUseAi ? { useAi } : {}),
      key,
    });
    const byNumber = new Map(extracted.questions.map((q) => [q.number, q]));
    const nextDrafts: Record<number, string> = {};
    const nextApply: Record<number, boolean> = {};
    const nextFills: Record<number, QuestionFill> = {};
    const nextMissing: number[] = [];

    for (const { row, text: existing } of rows) {
      const found = byNumber.get(row);
      if (!found || !found.text.trim()) {
        nextMissing.push(row);
        continue;
      }
      nextDrafts[row] = found.text;
      nextApply[row] = tickFor(existing);
      nextFills[row] = {
        text: found.text,
        options: found.options.map((o) => o.text),
        correctAnswer: found.correctAnswer,
      };
    }

    setReaderNote(readByLabel(extracted.readBy));
    setDrafts(nextDrafts);
    setApply(nextApply);
    setFills(nextFills);
    setMissing(nextMissing);
    // Row notes are numbered by the reader, so they line up with these rows.
    setNotes([
      ...extracted.warnings,
      ...extracted.questions.flatMap((q) =>
        q.warnings.map((w) => `Question ${q.number}: ${w}`)
      ),
    ]);
  };

  const readWithOcr = async (file: File) => {
    let text = '';
    for await (const page of rasterize(file)) {
      setProgress(`Reading page ${page.pageNumber}…`);
      text += `${await recognize(page.page)}\n`;
    }
    const parsed = parseNumberedQuestions(text, rows.length);
    const nextDrafts: Record<number, string> = {};
    const nextApply: Record<number, boolean> = {};
    for (const { row, text: existing } of rows) {
      const found = parsed.byNumber[row];
      if (!found) continue;
      nextDrafts[row] = found;
      // Real text a teacher typed is never replaced without a tick.
      nextApply[row] = tickFor(existing);
    }
    setDrafts(nextDrafts);
    setApply(nextApply);
    setFills({});
    setNotes([]);
    setMissing(parsed.missing);
  };

  const readFile = async (file: File) => {
    setStep('reading');
    try {
      await readWithOcr(file);
      setStep('review');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not read the scan.');
      setStep('setup');
    }
  };

  const pickFromDrive = async () => {
    if (!onPickFromDrive) return;
    setPicking(true);
    try {
      const file = await onPickFromDrive();
      if (file) await readFile(file);
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Could not open the Drive file.'
      );
    } finally {
      setPicking(false);
    }
  };

  const { dragging, dropProps } = useFileDrop((file) => void readFile(file));

  /** The shared uploader's test, and optionally its key file (R14). */
  const readSelection = async ({ test, key }: TestAndKeySelection) => {
    if (!readDocument || (!test && !key)) return;
    setStep('reading');
    try {
      if (test) {
        setKeyFill(null);
        await readWithImporter(test, key, readDocument);
      } else if (key) {
        setProgress('Reading the answer key…');
        setKeyFill(
          await readKeyFill(quiz.questions, key, readKey, fillStubKey)
        );
      }
      setStep('review');
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : test
            ? 'Could not read the test.'
            : 'Could not read the answer key.'
      );
      setStep('setup');
    }
  };

  const saveKeyFill = async (fill: SavedKeyFill) => {
    setStep('saving');
    try {
      await onSave({
        ...quiz,
        questions: fill.questions,
        updatedAt: Date.now(),
      });
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save the quiz.');
      setStep('review');
    }
  };

  const applyCount = Object.entries(apply).filter(
    ([row, on]) => on && drafts[Number(row)]?.trim()
  ).length;

  const handleSave = async () => {
    setStep('saving');
    try {
      const chosenText: Record<number, string> = {};
      const chosenFills: Record<number, QuestionFill> = {};
      for (const [key, on] of Object.entries(apply)) {
        const row = Number(key);
        if (!on || !drafts[row]) continue;
        chosenText[row] = drafts[row];
        const fill = fills[row];
        // The teacher may have corrected the stem in the box; their wording
        // wins over the reader's, and the choices ride along with it.
        if (fill) chosenFills[row] = { ...fill, text: drafts[row] };
      }
      const next =
        Object.keys(chosenFills).length > 0
          ? applyQuestionFill(quiz, chosenFills, Date.now())
          : applyQuestionText(quiz, chosenText, Date.now());
      if (next !== quiz) await onSave(next);
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
          <ScanText className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Import questions
          </h2>
          <p className="mt-0.5 max-w-[24rem] truncate text-xs text-slate-500">
            {quiz.title || 'Untitled paper test'}
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

  const renderUploaderSetup = () => (
    <div className="space-y-4 px-5 pb-5 pt-4">
      <p className="text-sm text-slate-700">
        Add the test paper, the answer key, or both.
      </p>
      <TestAndKeyUploader
        allowKeyAlone
        keyAloneLabel="Read the answer key"
        pickFromDrive={
          onPickFromDrive
            ? async () => {
                const file = await onPickFromDrive();
                return file ? { file, fileName: file.name } : null;
              }
            : undefined
        }
        submitLabel="Read the test"
        onSubmit={(selection) => void readSelection(selection)}
      >
        {canUseAi && <AiReaderToggle checked={useAi} onChange={setUseAi} />}
      </TestAndKeyUploader>
    </div>
  );

  const renderSetup = () => (
    <div className="space-y-4 px-5 pb-5 pt-4">
      <p className="text-sm text-slate-700">
        Numbered questions on the test paper are read into this quiz, and scores
        stay the same.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/*"
        aria-label="Test paper file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void readFile(file);
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        {...dropProps}
        className={`flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-sm font-semibold transition-colors ${
          dragging
            ? 'border-brand-blue-primary bg-brand-blue-lighter/30 text-brand-blue-primary'
            : 'border-slate-300 text-slate-600 hover:border-brand-blue-primary hover:text-brand-blue-primary'
        }`}
      >
        <FileUp className="h-5 w-5" />
        {dragging
          ? 'Drop the test paper here'
          : 'Drop the test paper here, or choose a PDF or image'}
      </button>
      {onPickFromDrive && (
        <button
          type="button"
          onClick={() => void pickFromDrive()}
          disabled={picking}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:border-brand-blue-primary hover:text-brand-blue-primary disabled:opacity-50"
        >
          {picking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CloudDownload className="h-4 w-4" />
          )}
          Pick the test paper from Google Drive
        </button>
      )}
    </div>
  );

  const renderReview = () => (
    <div className="space-y-3 px-5 pb-5 pt-4">
      <p className="text-sm text-slate-700">
        Rows that already have text stay as they are unless you tick them.
      </p>
      {readerNote && <p className="text-xs text-slate-500">{readerNote}</p>}
      {missing.length > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Not found in the scan: question{missing.length === 1 ? '' : 's'}{' '}
          {missing.join(', ')}.
        </p>
      )}
      {notes.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}
      <ol className="space-y-2">
        {rows.map(({ row, text }) => {
          const draft = drafts[row];
          if (draft === undefined) return null;
          return (
            <li
              key={row}
              className="flex items-start gap-2 rounded-lg bg-slate-50 p-2"
            >
              <input
                type="checkbox"
                aria-label={`Apply question ${row}`}
                checked={!!apply[row]}
                onChange={(e) =>
                  setApply((prev) => ({ ...prev, [row]: e.target.checked }))
                }
                className="mt-1.5 h-4 w-4 rounded border-slate-300"
              />
              <span className="mt-1 w-6 shrink-0 text-right text-sm font-semibold text-slate-700">
                {row}.
              </span>
              <div className="min-w-0 flex-1">
                <textarea
                  aria-label={`Question ${row} text`}
                  value={draft}
                  rows={2}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [row]: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                />
                {fills[row]?.options && fills[row].options.length > 0 && (
                  <p className="mt-1 text-xs text-slate-600">
                    Choices:{' '}
                    {fills[row].options.map((choice, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && ', '}
                        <span
                          className={
                            choice === fills[row].correctAnswer
                              ? 'font-bold text-slate-800'
                              : undefined
                          }
                        >
                          {choice}
                          {choice === fills[row].correctAnswer && ' (answer)'}
                        </span>
                      </React.Fragment>
                    ))}
                  </p>
                )}
                {fills[row]?.options &&
                  fills[row].options.length > 0 &&
                  !fills[row].correctAnswer?.trim() && (
                    <p className="mt-0.5 text-xs text-amber-800">
                      No answer marked
                    </p>
                  )}
                {!isPlaceholderQuestion(text) && text.trim() && (
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Now: {text}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );

  const footer =
    step === 'review' && keyFill ? (
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
          onClick={() => void saveKeyFill(keyFill)}
          disabled={keyFill.filled.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {keyFillLabel(keyFill.filled.length)}
        </button>
      </div>
    ) : step === 'review' ? (
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
          onClick={() => void handleSave()}
          disabled={applyCount === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Apply to {applyCount} question{applyCount === 1 ? '' : 's'}
        </button>
      </div>
    ) : undefined;

  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel="Import questions"
      maxWidth="max-w-2xl"
      contentClassName=""
      customHeader={header}
      footer={footer}
    >
      {step === 'setup' &&
        (readDocument ? renderUploaderSetup() : renderSetup())}
      {(step === 'reading' || step === 'saving') && (
        <div className="flex items-center gap-3 px-5 py-8 text-sm text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          {step === 'reading' ? progress || 'Reading…' : 'Saving…'}
        </div>
      )}
      {step === 'review' &&
        (keyFill ? (
          <div className="px-5 pb-5 pt-4">
            <KeyFillReview before={quiz.questions} result={keyFill} />
          </div>
        ) : (
          renderReview()
        ))}
    </Modal>
  );
};
