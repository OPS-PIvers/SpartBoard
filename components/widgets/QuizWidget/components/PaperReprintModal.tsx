// Print response sheets again for a Paper assignment: the same seats, so a lost sheet still imports as its student.

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Printer } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { useAuth } from '@/context/useAuth';
import { usePaperSheetStimulusImages } from '@/hooks/usePaperSheetStimulusImages';
import type { ClassRoster, PaperBatch, QuizData } from '@/types';
import { analyzePaperQuiz } from '@/utils/paperSheetPlan';
import { paperGridOf } from '@/utils/paperSheetLayout';
import { printPaperSheets } from '@/utils/paperSheetPrint';
import { stimulusLoadErrorMessage } from '@/utils/paperSheetStimulusImages';
import {
  promptAnalysis,
  promptPagesFor,
  promptQuestionIds,
} from '@/utils/paperSheetVersions';
import { PAPER_HANDWRITTEN_FEATURE } from '@/utils/paperWritten';
import { writtenOnlyAnalysis } from '@/utils/paperWrittenHybrid';
import {
  reprintBlocker,
  reprintClasses,
  reprintSheets,
} from '@/utils/paperReprint';

export interface PaperReprintModalProps {
  quiz: QuizData;
  batch: PaperBatch;
  rosters: ClassRoster[];
  onClose: () => void;
  onError: (message: string) => void;
  /** Written answers on paper: the stack holds only written boxes, with no prompt pages or sheet stimuli. */
  writtenOnly?: boolean;
  print?: typeof printPaperSheets;
}

const BLOCKED_MESSAGE = {
  versions: 'Sheets printed in versions can’t be printed again yet.',
  changed:
    'This quiz changed after these sheets printed, so they can’t be printed again.',
} as const;

export const PaperReprintModal: React.FC<PaperReprintModalProps> = ({
  quiz,
  batch,
  rosters,
  onClose,
  onError,
  writtenOnly = false,
  print = printPaperSheets,
}) => {
  const { canAccessFeature } = useAuth();
  const writtenOn = canAccessFeature(PAPER_HANDWRITTEN_FEATURE);
  const analysis = useMemo(
    () =>
      writtenOnly
        ? writtenOnlyAnalysis(quiz)
        : promptAnalysis(quiz, analyzePaperQuiz(quiz, { written: writtenOn })),
    [quiz, writtenOn, writtenOnly]
  );
  const blocker = reprintBlocker(batch, analysis);
  const classes = useMemo(
    () => reprintClasses(batch, rosters),
    [batch, rosters]
  );
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const questionsById = useMemo(
    () => new Map((quiz.questions ?? []).map((q) => [q.id, q])),
    [quiz.questions]
  );
  const quizStimuli = useMemo(() => quiz.stimuli ?? [], [quiz.stimuli]);
  const promptIds = useMemo(
    () =>
      writtenOnly
        ? new Set<string>()
        : promptQuestionIds(analysis, questionsById, quizStimuli),
    [writtenOnly, analysis, questionsById, quizStimuli]
  );
  const promptPages = useMemo(
    () => promptPagesFor(promptIds, questionsById, quizStimuli),
    [promptIds, questionsById, quizStimuli]
  );
  const sheetStimuli = useMemo(
    () => (writtenOnly ? [] : (quiz.paperSheetStimuli ?? [])),
    [writtenOnly, quiz.paperSheetStimuli]
  );
  const imageStimuli = useMemo(() => {
    const seen = new Set(sheetStimuli.map((s) => s.id));
    const prompts = Object.values(promptPages).flatMap((p) => p.stimuli);
    return [
      ...sheetStimuli,
      ...prompts.filter((s) => !seen.has(s.id) && !!seen.add(s.id)),
    ];
  }, [sheetStimuli, promptPages]);
  const sheetImages = usePaperSheetStimulusImages(imageStimuli);

  const toggle = (seat: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(seat)) next.delete(seat);
      else next.add(seat);
      return next;
    });

  const canPrint = !blocker && picked.size > 0 && !sheetImages.loading;

  const handlePrint = () => {
    if (sheetImages.failed.length > 0) {
      onError(stimulusLoadErrorMessage(sheetImages.failed));
      return;
    }
    const sheetQuestions = analysis.rows.flatMap((r) => {
      const q = questionsById.get(r.questionId);
      return q ? [q] : [];
    });
    const writtenTexts = Object.fromEntries(
      analysis.written.flatMap((w) => {
        const text = questionsById.get(w.questionId)?.text;
        return text && !promptIds.has(w.questionId)
          ? [[w.questionId, text]]
          : [];
      })
    );
    try {
      print({
        batchId: batch.id,
        quizTitle: quiz.title,
        questionCount: batch.questionCount,
        choiceCount: batch.choiceCount,
        ...(batch.columnsPerPage || batch.sheetLayout
          ? { columnsPerPage: paperGridOf(batch) }
          : {}),
        ...(batch.sheetLayout === 'questions'
          ? {
              questionTexts: sheetQuestions.map((q) => ({
                text: q.text,
                choices: batch.choiceOrder?.[q.id] ?? [],
              })),
            }
          : {}),
        ...(analysis.rows.some((r) => r.sourceLabel)
          ? { rowLabels: analysis.rows.map((r) => r.sourceLabel) }
          : {}),
        ...(batch.pageMaps
          ? {
              pageMaps: batch.pageMaps,
              writtenTexts,
              ...(promptIds.size > 0 ? { prompts: promptPages } : {}),
            }
          : {}),
        ...(imageStimuli.length > 0
          ? {
              ...(sheetStimuli.length > 0 ? { sheetStimuli } : {}),
              stimulusImageSrc: sheetImages.src,
              // Closing revokes the image URLs, so wait until the print window has them.
              onImagesReady: onClose,
            }
          : {}),
        sheets: reprintSheets(classes, picked),
      });
      if (imageStimuli.length === 0) onClose();
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Could not print response sheets.'
      );
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        writtenOnly ? 'Print written answer sheets' : 'Print response sheets'
      }
      maxWidth="max-w-md"
      footer={
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={onClose}
            {...tourTypeAttr('quiz-reprint.cancel', 'quiz')}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!canPrint}
            {...tourTypeAttr('quiz-reprint.print', 'quiz')}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      }
    >
      <div className="space-y-3 pb-2">
        {blocker ? (
          <p className="flex items-start gap-2 text-sm text-slate-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            {BLOCKED_MESSAGE[blocker]}
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-700">
              Pick the students who need a new sheet.
            </p>
            <div className="max-h-72 divide-y divide-slate-200 overflow-y-auto border-y border-slate-200 pb-2">
              {classes.map(({ roster, seats }) => (
                <div key={roster.id} className="py-2">
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {roster.name}
                  </p>
                  {seats.map(({ seat, student }) => (
                    <label
                      key={seat}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-slate-800 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={picked.has(seat)}
                        onChange={() => toggle(seat)}
                        {...tourFieldAttr(
                          'quiz-reprint.student',
                          'quiz',
                          String(seat)
                        )}
                        className="h-4 w-4 rounded-sm border-slate-300"
                      />
                      <span className="truncate">
                        {[student.lastName, student.firstName]
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
