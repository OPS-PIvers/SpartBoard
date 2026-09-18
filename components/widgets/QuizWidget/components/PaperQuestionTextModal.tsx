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
import type { QuizData } from '@/types';
import {
  applyQuestionText,
  isPlaceholderQuestion,
  parseNumberedQuestions,
} from '@/utils/paperQuestionOcr';
import { rasterizeScan, type RasterizedPage } from '@/utils/paperScanRaster';
import type { RasterPage } from '@/utils/paperSheetReader';

interface PaperQuestionTextModalProps {
  quiz: QuizData;
  onSave: (quiz: QuizData) => Promise<void>;
  onPickFromDrive?: () => Promise<File | null>;
  onClose: () => void;
  onError: (message: string) => void;
  /** Test seams. */
  rasterize?: (file: Blob) => AsyncGenerator<RasterizedPage>;
  recognize?: (page: RasterPage) => Promise<string>;
}

type Step = 'setup' | 'reading' | 'review' | 'saving';

/** Paint the page onto a canvas and hand tesseract a PNG; loaded on demand. */
async function recognizeWithTesseract(page: RasterPage): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser.');
  const image = ctx.createImageData(page.width, page.height);
  image.data.set(page.data);
  ctx.putImageData(image, 0, 0);
  const { default: Tesseract } = await import('tesseract.js');
  const result = await Tesseract.recognize(
    canvas.toDataURL('image/png'),
    'eng'
  );
  canvas.width = 0;
  canvas.height = 0;
  return result.data.text;
}

export const PaperQuestionTextModal: React.FC<PaperQuestionTextModalProps> = ({
  quiz,
  onSave,
  onPickFromDrive,
  onClose,
  onError,
  rasterize = rasterizeScan,
  recognize = recognizeWithTesseract,
}) => {
  const [step, setStep] = useState<Step>('setup');
  const [progress, setProgress] = useState('');
  const [picking, setPicking] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [apply, setApply] = useState<Record<number, boolean>>({});
  const [missing, setMissing] = useState<number[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(
    () =>
      quiz.questions.map((q, i) => ({ row: i + 1, id: q.id, text: q.text })),
    [quiz]
  );

  const readFile = async (file: File) => {
    setStep('reading');
    try {
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
        nextApply[row] = isPlaceholderQuestion(existing) || !existing.trim();
      }
      setDrafts(nextDrafts);
      setApply(nextApply);
      setMissing(parsed.missing);
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

  const applyCount = Object.entries(apply).filter(
    ([row, on]) => on && drafts[Number(row)]?.trim()
  ).length;

  const handleSave = async () => {
    setStep('saving');
    try {
      const chosen: Record<number, string> = {};
      for (const [row, on] of Object.entries(apply)) {
        if (on && drafts[Number(row)])
          chosen[Number(row)] = drafts[Number(row)];
      }
      const next = applyQuestionText(quiz, chosen, Date.now());
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
            Read questions from the test paper
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

  const renderSetup = () => (
    <div className="space-y-4 px-5 pb-5 pt-4">
      <p className="text-sm text-slate-700">
        Scan or save the test paper as a PDF and the numbered questions will be
        read into this quiz. Results then show the question a student missed,
        not just its number. Scores are never affected.
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
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-6 text-sm font-semibold text-slate-600 transition-colors hover:border-brand-blue-primary hover:text-brand-blue-primary"
      >
        <FileUp className="h-5 w-5" />
        Choose the test paper PDF or image
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
      <p className="text-xs text-slate-500">
        Questions are matched by the number printed before them. The file is
        read on this computer and never uploaded.
      </p>
    </div>
  );

  const renderReview = () => (
    <div className="space-y-3 px-5 pb-5 pt-4">
      <p className="text-sm text-slate-700">
        Check each question before applying. Rows already holding real text are
        left alone unless you tick them.
      </p>
      {missing.length > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Not found in the scan: question{missing.length === 1 ? '' : 's'}{' '}
          {missing.join(', ')}.
        </p>
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
    step === 'review' ? (
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
      ariaLabel="Read questions from the test paper"
      maxWidth="max-w-2xl"
      contentClassName=""
      customHeader={header}
      footer={footer}
    >
      {step === 'setup' && renderSetup()}
      {(step === 'reading' || step === 'saving') && (
        <div className="flex items-center gap-3 px-5 py-8 text-sm text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          {step === 'reading' ? progress || 'Reading…' : 'Saving…'}
        </div>
      )}
      {step === 'review' && renderReview()}
    </Modal>
  );
};
