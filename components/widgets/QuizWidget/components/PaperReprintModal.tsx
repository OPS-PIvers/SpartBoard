// Print response sheets again for a Paper assignment: the same seats, so a lost sheet still imports as its student.

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Printer } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import {
  tourFieldAttr,
  tourTypeAttr,
  type TourAnchorAttrs,
} from '@/config/tourAnchors';
import { useAuth } from '@/context/useAuth';
import { usePaperSheetStimulusImages } from '@/hooks/usePaperSheetStimulusImages';
import type { ClassRoster, PaperBatch, QuizData, Student } from '@/types';
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
import type { PrintedTranslation } from '@/utils/paperPrintedVersions';
import { writtenOnlyAnalysis } from '@/utils/paperWrittenHybrid';
import {
  reprintBlocker,
  reprintClasses,
  reprintSheets,
} from '@/utils/paperReprint';

/** One saved stack and the quiz version it printed from. */
export interface ReprintStack {
  quiz: QuizData;
  batch: PaperBatch;
  /** A printed group's language, for the question text on its sheets. */
  translation?: PrintedTranslation;
}

/** What a header above the student list can read and change. */
export interface ReprintPicks {
  picked: ReadonlySet<string>;
  setPicked: (next: ReadonlySet<string>) => void;
  keysOf: (stackIndex: number) => string[];
}

interface ReprintDialogProps {
  stacks: readonly ReprintStack[];
  rosters: ClassRoster[];
  onClose: () => void;
  onError: (message: string) => void;
  /** Written answers on paper: the stack holds only written boxes, with no prompt pages or sheet stimuli. */
  writtenOnly?: boolean;
  /** Shown above the student list, e.g. the printed group checkboxes. */
  header?: (picks: ReprintPicks) => React.ReactNode;
  print?: typeof printPaperSheets;
}

export interface PaperReprintModalProps extends Omit<
  ReprintDialogProps,
  'stacks' | 'header'
> {
  quiz: QuizData;
  batch: PaperBatch;
}

const BLOCKED_MESSAGE = {
  versions: 'Sheets printed in versions can’t be printed again yet.',
  changed:
    'This quiz changed after these sheets printed, so they can’t be printed again.',
} as const;

const pickKey = (stackIndex: number, seat: number) => `${stackIndex}:${seat}`;

const studentName = (s: Student) =>
  [s.lastName, s.firstName].filter(Boolean).join(', ');

export const PaperReprintModal: React.FC<PaperReprintModalProps> = ({
  quiz,
  batch,
  ...rest
}) => {
  const stacks = useMemo(() => [{ quiz, batch }], [quiz, batch]);
  return <PaperStacksReprintDialog stacks={stacks} {...rest} />;
};

/** One checkable row in the reprint list. */
export const ReprintCheckRow: React.FC<{
  label: string;
  detail?: string;
  checked: boolean;
  onToggle: () => void;
  anchor: TourAnchorAttrs;
  strong?: boolean;
}> = ({ label, detail, checked, onToggle, anchor, strong }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={checked}
    aria-label={label}
    onClick={onToggle}
    {...anchor}
    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors [-webkit-tap-highlight-color:transparent] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 touch:py-2.5 ${
      checked
        ? 'bg-brand-blue-lighter/50 text-brand-blue-dark'
        : 'text-slate-800 hover:bg-slate-50'
    } ${strong ? 'font-semibold' : ''}`}
  >
    <span
      aria-hidden
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
        checked
          ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
          : 'border-slate-300 bg-white'
      }`}
    >
      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {detail && (
      <span className="shrink-0 text-xs font-normal text-slate-500">
        {detail}
      </span>
    )}
  </button>
);

/** Reprint one or more stacks: students from every stack in one list, each printing on its own stack's version. */
export const PaperStacksReprintDialog: React.FC<ReprintDialogProps> = ({
  stacks,
  rosters,
  onClose,
  onError,
  writtenOnly = false,
  header,
  print = printPaperSheets,
}) => {
  const { canAccessFeature } = useAuth();
  const writtenOn = canAccessFeature(PAPER_HANDWRITTEN_FEATURE);
  const analyses = useMemo(
    () =>
      stacks.map(({ quiz }) =>
        writtenOnly
          ? writtenOnlyAnalysis(quiz)
          : promptAnalysis(
              quiz,
              analyzePaperQuiz(quiz, { written: writtenOn, fib: true })
            )
      ),
    [stacks, writtenOn, writtenOnly]
  );
  const blockers = stacks.map((s, i) => reprintBlocker(s.batch, analyses[i]));
  const open = blockers.flatMap((b, i) => (b ? [] : [i]));
  const blocker = open.length === 0 ? blockers[0] : null;
  const classes = useMemo(() => {
    const byRoster = new Map<
      string,
      {
        roster: ClassRoster;
        rows: { key: string; stack: number; seat: number; student: Student }[];
      }
    >();
    stacks.forEach(({ batch }, stack) => {
      if (reprintBlocker(batch, analyses[stack])) return;
      for (const { roster, seats } of reprintClasses(batch, rosters)) {
        const entry = byRoster.get(roster.id) ?? { roster, rows: [] };
        for (const { seat, student } of seats)
          entry.rows.push({ key: pickKey(stack, seat), stack, seat, student });
        byRoster.set(roster.id, entry);
      }
    });
    const out = [...byRoster.values()];
    if (stacks.length > 1)
      for (const c of out)
        c.rows.sort((a, b) =>
          studentName(a.student).localeCompare(studentName(b.student))
        );
    return out;
  }, [stacks, analyses, rosters]);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());

  // Each version keeps its own prompt pages, since a group's wording or questions can differ.
  const prompts = useMemo(
    () =>
      stacks.map(({ quiz }, i) => {
        const byId = new Map(quiz.questions.map((q) => [q.id, q]));
        const stimuli = quiz.stimuli ?? [];
        const ids =
          writtenOnly || !analyses[i]
            ? new Set<string>()
            : promptQuestionIds(analyses[i], byId, stimuli);
        return { ids, pages: promptPagesFor(ids, byId, stimuli) };
      }),
    [stacks, analyses, writtenOnly]
  );
  const sheetStimuli = useMemo(
    () => (writtenOnly ? [] : (stacks[0]?.quiz.paperSheetStimuli ?? [])),
    [writtenOnly, stacks]
  );
  const imageStimuli = useMemo(() => {
    const seen = new Set(sheetStimuli.map((s) => s.id));
    const promptStimuli = prompts.flatMap((p) =>
      Object.values(p.pages).flatMap((page) => page.stimuli)
    );
    return [
      ...sheetStimuli,
      ...promptStimuli.filter((s) => !seen.has(s.id) && !!seen.add(s.id)),
    ];
  }, [sheetStimuli, prompts]);
  const sheetImages = usePaperSheetStimulusImages(imageStimuli);

  const toggle = (key: string) => {
    const next = new Set(picked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPicked(next);
  };
  const keysOf = (stack: number) =>
    classes.flatMap((c) =>
      c.rows.filter((r) => r.stack === stack).map((r) => r.key)
    );
  const pickedStacks = [
    ...new Set(
      classes.flatMap((c) =>
        c.rows.filter((r) => picked.has(r.key)).map((r) => r.stack)
      )
    ),
  ].sort((a, b) => a - b);

  const canPrint = !blocker && picked.size > 0 && !sheetImages.loading;

  const handlePrint = () => {
    if (sheetImages.failed.length > 0) {
      onError(stimulusLoadErrorMessage(sheetImages.failed));
      return;
    }
    const stackIndex = pickedStacks[0];
    if (stackIndex === undefined) return;
    const { quiz, batch, translation } = stacks[stackIndex];
    const analysis = analyses[stackIndex];
    const { ids: promptIds, pages: promptPages } = prompts[stackIndex];
    const versionQuestions = new Map(quiz.questions.map((q) => [q.id, q]));
    const sheetQuestions = analysis.rows.flatMap((r) => {
      const q = versionQuestions.get(r.questionId);
      return q ? [q] : [];
    });
    const writtenTexts = Object.fromEntries(
      analysis.written.flatMap((w) => {
        const text = versionQuestions.get(w.questionId)?.text;
        return text && !promptIds.has(w.questionId)
          ? [[w.questionId, text]]
          : [];
      })
    );
    const seats = new Set(
      [...picked].flatMap((k) => {
        const [s, seat] = k.split(':').map(Number);
        return s === stackIndex ? [seat] : [];
      })
    );
    const remaining = new Set(
      [...picked].filter((k) => !k.startsWith(`${stackIndex}:`))
    );
    const done = remaining.size === 0;
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
              questionTexts: sheetQuestions.map((q) => {
                const tr = translation?.questions[q.id];
                return {
                  text: tr?.text ?? q.text,
                  choices: (batch.choiceOrder?.[q.id] ?? []).map(
                    (c) => tr?.choices?.[c] ?? c
                  ),
                };
              }),
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
              ...(done ? { onImagesReady: onClose } : {}),
            }
          : {}),
        sheets: reprintSheets(reprintClasses(batch, rosters), seats),
      });
      if (!done) setPicked(remaining);
      else if (imageStimuli.length === 0) onClose();
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
            {pickedStacks.length > 1
              ? `Print 1 of ${pickedStacks.length}`
              : 'Print'}
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
              {header?.({ picked, setPicked, keysOf })}
              {classes.map(({ roster, rows }) => (
                <div key={roster.id} className="py-2">
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {roster.name}
                  </p>
                  {rows.map(({ key, seat, student }) => (
                    <ReprintCheckRow
                      key={key}
                      label={studentName(student)}
                      checked={picked.has(key)}
                      onToggle={() => toggle(key)}
                      anchor={tourFieldAttr(
                        'quiz-reprint.student',
                        'quiz',
                        String(seat)
                      )}
                    />
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
