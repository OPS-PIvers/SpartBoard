/**
 * PaperPrintModal — pick who gets a sheet, then print the stack.
 *
 * Writes the `PaperBatch` that the scan import later reads seats out of, so a
 * successful print is the point of no return: the batch must be saved before
 * the paper exists. See docs/plans/QUIZ_PAPER_ANSWER_SHEETS.md §6.
 */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Printer,
  X,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Toggle } from '@/components/common/Toggle';
import type { ClassRoster, PaperBatch, QuizData, Student } from '@/types';
import {
  MAX_CHOICE_COUNT,
  MIN_CHOICE_COUNT,
  pageCountForQuestions,
} from '@/utils/paperSheetLayout';
import {
  analyzePaperQuiz,
  buildPaperStubQuiz,
  planPaperBatch,
} from '@/utils/paperSheetPlan';
import { printPaperSheets } from '@/utils/paperSheetPrint';
import { printPaperTest } from '@/utils/paperTestPrint';

const MAX_SPARES = 20;
const DEFAULT_STUB_QUESTIONS = 25;

interface PaperPrintModalProps {
  quiz: QuizData;
  rosters: ClassRoster[];
  /** Persists the batch; the caller owns the Firestore write and its errors. */
  onSaveBatch: (batch: PaperBatch) => Promise<void>;
  /**
   * Save the stub quiz behind a paper-only test. Passed only by the "Paper
   * test" door, where `quiz` is an unsaved shell the teacher is still naming.
   */
  onCreateQuiz?: (quiz: QuizData) => Promise<void>;
  onClose: () => void;
  onError: (message: string) => void;
  /** Test seam mirroring `printPaperSheets`. */
  print?: typeof printPaperSheets;
  printTest?: typeof printPaperTest;
}

const studentSort = (a: Student, b: Student): number =>
  `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);

export const PaperPrintModal: React.FC<PaperPrintModalProps> = ({
  quiz,
  rosters,
  onSaveBatch,
  onCreateQuiz,
  onClose,
  onError,
  print = printPaperSheets,
  printTest = printPaperTest,
}) => {
  const analysis = useMemo(() => analyzePaperQuiz(quiz), [quiz]);
  const isStub = analysis.rows.length === 0;
  const [stubTitle, setStubTitle] = useState(quiz.title);

  const [selectedStudentIds, setSelectedStudentIds] = useState<
    Record<string, Set<string>>
  >({});
  const [expandedRosterId, setExpandedRosterId] = useState<string | null>(null);
  const [stubQuestionCount, setStubQuestionCount] = useState(
    DEFAULT_STUB_QUESTIONS
  );
  const [stubChoiceCount, setStubChoiceCount] = useState(4);
  const [spareCount, setSpareCount] = useState(2);
  const [includeKeySheet, setIncludeKeySheet] = useState(isStub);
  const [printing, setPrinting] = useState(false);
  /** Set once an authored quiz's sheets printed; the test paper comes next. */
  const [printedBatch, setPrintedBatch] = useState<PaperBatch | null>(null);

  const questionsById = useMemo(
    () => new Map((quiz.questions ?? []).map((q) => [q.id, q])),
    [quiz.questions]
  );
  const sheetQuestions = useMemo(
    () =>
      analysis.rows.flatMap((r) => {
        const q = questionsById.get(r.questionId);
        return q ? [q] : [];
      }),
    [analysis.rows, questionsById]
  );

  const questionCount = isStub ? stubQuestionCount : analysis.rows.length;
  const choiceCount = isStub ? stubChoiceCount : analysis.sheetChoiceCount;

  const selectionsForPrint = useMemo(
    () =>
      rosters
        .map((roster) => ({
          roster,
          students: [...roster.students]
            .sort(studentSort)
            .filter((s) => selectedStudentIds[roster.id]?.has(s.id)),
        }))
        .filter((s) => s.students.length > 0),
    [rosters, selectedStudentIds]
  );

  const studentSheetCount = selectionsForPrint.reduce(
    (n, s) => n + s.students.length,
    0
  );
  const sheetCount = studentSheetCount + spareCount + (includeKeySheet ? 1 : 0);
  const pagesPerSheet = pageCountForQuestions(questionCount);
  const canPrint = sheetCount > 0 && questionCount > 0 && !printing;

  const toggleRoster = (roster: ClassRoster, checked: boolean) => {
    setSelectedStudentIds((prev) => ({
      ...prev,
      [roster.id]: checked
        ? new Set(roster.students.map((s) => s.id))
        : new Set(),
    }));
  };

  const toggleStudent = (
    rosterId: string,
    studentId: string,
    checked: boolean
  ) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev[rosterId] ?? []);
      if (checked) next.add(studentId);
      else next.delete(studentId);
      return { ...prev, [rosterId]: next };
    });
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const { batch, sheets } = planPaperBatch({
        batchId: crypto.randomUUID(),
        quizId: quiz.id,
        selections: selectionsForPrint,
        questionCount,
        choiceCount,
        spareCount,
        includeKeySheet,
        ...(isStub ? {} : { questions: sheetQuestions }),
        createdAt: Date.now(),
      });
      // Create the quiz before the batch that points at it, and both before
      // printing: a sheet whose batch or quiz was never stored can never be
      // imported, and the teacher cannot tell that by looking at the paper.
      const printedQuiz = onCreateQuiz
        ? buildPaperStubQuiz({
            quizId: quiz.id,
            title: stubTitle,
            questionCount,
            choiceCount,
            createdAt: Date.now(),
          })
        : quiz;
      if (onCreateQuiz) await onCreateQuiz(printedQuiz);
      await onSaveBatch(batch);
      print({
        batchId: batch.id,
        quizTitle: printedQuiz.title,
        questionCount: batch.questionCount,
        choiceCount: batch.choiceCount,
        sheets,
      });
      // An authored quiz needs its test paper printed from the same batch, so
      // the letters on the paper match the order the import will decode.
      if (isStub) onClose();
      else setPrintedBatch(batch);
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Could not print response sheets.'
      );
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintTest = () => {
    if (!printedBatch) return;
    try {
      printTest({
        quizTitle: quiz.title,
        questions: analysis.rows.flatMap((r) => {
          const q = questionsById.get(r.questionId);
          if (!q) return [];
          const choices = printedBatch.choiceOrder?.[q.id] ?? [
            q.correctAnswer,
            ...(q.incorrectAnswers ?? []),
          ];
          return [{ row: r.row, text: q.text, choices }];
        }),
      });
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Could not print the test paper.'
      );
    }
  };

  if (printedBatch) {
    return (
      <Modal
        isOpen
        onClose={onClose}
        ariaLabel="Response sheets printed"
        maxWidth="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
            >
              Done
            </button>
            <button
              type="button"
              onClick={handlePrintTest}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark"
            >
              <FileText className="h-4 w-4" />
              Print test paper
            </button>
          </div>
        }
      >
        <div className="space-y-3 px-5 pb-2 pt-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Response sheets sent to print
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Now print the test paper. Its choices are lettered to match
                these sheets, so hand out this copy rather than one written by
                hand — the import reads each bubble through that order.
              </p>
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel="Print response sheets"
      maxWidth="max-w-2xl"
      contentClassName=""
      customHeader={
        <div className="flex items-start justify-between border-b border-slate-100 px-5 pb-3 pt-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Print response sheets
              </h2>
              <p className="mt-0.5 max-w-[24rem] truncate text-xs text-slate-500">
                {onCreateQuiz
                  ? 'New paper test'
                  : quiz.title || 'Untitled paper test'}
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
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-600">
            {sheetCount === 0
              ? 'Pick at least one student or spare sheet.'
              : `${sheetCount} sheet${sheetCount === 1 ? '' : 's'} · ${
                  sheetCount * pagesPerSheet
                } page${sheetCount * pagesPerSheet === 1 ? '' : 's'}`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handlePrint()}
              disabled={!canPrint}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              {printing ? 'Preparing…' : 'Print'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 px-5 pb-5 pt-4">
        {analysis.exclusions.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-amber-900">
                  {analysis.exclusions.length} question
                  {analysis.exclusions.length === 1 ? '' : 's'} will not be on
                  the sheet
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  Only multiple-choice and true/false questions can be bubbled.
                  These stay unscored unless students answer them in SpartBoard.
                </p>
                <ul className="mt-2 space-y-0.5 text-xs text-amber-800">
                  {analysis.exclusions.slice(0, 5).map((ex, i) => (
                    <li key={i} className="truncate">
                      • {ex.label}
                    </li>
                  ))}
                  {analysis.exclusions.length > 5 && (
                    <li>• and {analysis.exclusions.length - 5} more</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {onCreateQuiz && (
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Title
            </span>
            <input
              type="text"
              value={stubTitle}
              onChange={(e) => setStubTitle(e.target.value)}
              placeholder="Unit 3 Test"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Questions
            </span>
            {isStub ? (
              <input
                type="number"
                min={1}
                max={500}
                value={stubQuestionCount}
                onChange={(e) =>
                  setStubQuestionCount(
                    Math.max(1, Math.min(500, Number(e.target.value) || 1))
                  )
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            ) : (
              <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {questionCount} from this quiz
              </p>
            )}
          </label>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Choices per question
            </span>
            {isStub ? (
              <select
                value={stubChoiceCount}
                onChange={(e) => setStubChoiceCount(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {Array.from(
                  { length: MAX_CHOICE_COUNT - MIN_CHOICE_COUNT + 1 },
                  (_, i) => MIN_CHOICE_COUNT + i
                ).map((n) => (
                  <option key={n} value={n}>
                    {n}{' '}
                    {n === 2 ? '(A–B, true/false)' : `(A–${'ABCDE'[n - 1]})`}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {choiceCount} (A–{'ABCDE'[choiceCount - 1]})
              </p>
            )}
          </label>
        </div>

        {analysis.shortRows.length > 0 && (
          <p className="text-xs text-slate-500">
            Every row prints {choiceCount} bubbles. Question
            {analysis.shortRows.length === 1 ? ' ' : 's '}
            {analysis.shortRows.join(', ')}{' '}
            {analysis.shortRows.length === 1 ? 'has' : 'have'} fewer choices —
            tell students to leave the extra bubbles blank.
          </p>
        )}

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Who gets a sheet
          </p>
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {rosters.length === 0 && (
              <p className="px-2 py-3 text-xs text-slate-500">
                No classes yet — add a roster to print personalized sheets, or
                print spares below.
              </p>
            )}
            {rosters.map((roster) => {
              const selected =
                selectedStudentIds[roster.id] ?? new Set<string>();
              const expanded = expandedRosterId === roster.id;
              const sorted = [...roster.students].sort(studentSort);
              return (
                <div key={roster.id} className="rounded-lg">
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <input
                      type="checkbox"
                      id={`paper-roster-${roster.id}`}
                      checked={
                        selected.size > 0 && selected.size === sorted.length
                      }
                      ref={(el) => {
                        if (el) {
                          el.indeterminate =
                            selected.size > 0 && selected.size < sorted.length;
                        }
                      }}
                      onChange={(e) => toggleRoster(roster, e.target.checked)}
                      disabled={sorted.length === 0}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <label
                      htmlFor={`paper-roster-${roster.id}`}
                      className="flex-1 cursor-pointer truncate text-sm font-semibold text-slate-800"
                    >
                      {roster.name}
                    </label>
                    <span className="text-xs text-slate-500">
                      {roster.loadError
                        ? 'could not load'
                        : `${selected.size}/${sorted.length}`}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedRosterId(expanded ? null : roster.id)
                      }
                      aria-label={expanded ? 'Hide students' : 'Show students'}
                      aria-expanded={expanded}
                      disabled={sorted.length === 0}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-40"
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {expanded && (
                    <ul className="ml-6 space-y-0.5 pb-2">
                      {sorted.map((student) => (
                        <li
                          key={student.id}
                          className="flex items-center gap-2 px-2"
                        >
                          <input
                            type="checkbox"
                            id={`paper-student-${roster.id}-${student.id}`}
                            checked={selected.has(student.id)}
                            onChange={(e) =>
                              toggleStudent(
                                roster.id,
                                student.id,
                                e.target.checked
                              )
                            }
                            className="h-3.5 w-3.5 rounded border-slate-300"
                          />
                          <label
                            htmlFor={`paper-student-${roster.id}-${student.id}`}
                            className="cursor-pointer truncate text-xs text-slate-700"
                          >
                            {student.lastName}, {student.firstName}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label htmlFor="paper-spares" className="text-sm text-slate-700">
            Blank spare sheets
            <span className="ml-1 text-xs text-slate-500">
              for walk-ins and make-ups
            </span>
          </label>
          <input
            id="paper-spares"
            type="number"
            min={0}
            max={MAX_SPARES}
            value={spareCount}
            onChange={(e) =>
              setSpareCount(
                Math.max(0, Math.min(MAX_SPARES, Number(e.target.value) || 0))
              )
            }
            className="w-20 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-700">
              Include an answer key sheet
            </p>
            <p className="text-xs text-slate-500">
              {isStub
                ? 'Bubble the correct answers on it — that sheet sets the key when you import the scan.'
                : 'This quiz already has an answer key, so a key sheet is optional.'}
            </p>
          </div>
          <Toggle
            checked={includeKeySheet}
            onChange={setIncludeKeySheet}
            label="Include an answer key sheet"
            size="sm"
          />
        </div>
      </div>
    </Modal>
  );
};
