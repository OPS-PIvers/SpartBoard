import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Printer, X } from 'lucide-react';
import type {
  PaperBatch,
  QuizData,
  QuizQuestion,
  QuizResponse,
  Rubric,
} from '@/types';
import { Modal } from '@/components/common/Modal';
import { Toggle } from '@/components/common/Toggle';
import { getResponseDocKey } from '@/hooks/useQuizSession';
import { getPaperBatch } from '@/utils/paperBatchStore';
import { logError } from '@/utils/logError';
import type { QuestionGradeFn } from '@/utils/quizQuestionStats';
import {
  applyPreset,
  loadResultsPrintChoice,
  RESULTS_PRINT_PRESETS,
  saveResultsPrintChoice,
  type ResultsPrintPresetId,
  type SavedResultsPrintChoice,
} from '@/utils/quizResultsPrintPresets';
import { computeStudentDrilldown } from '@/utils/quizStudentDrilldown';
import {
  buildResultsPreviewDocument,
  buildResultsPrintHtml,
  printQuizResults,
  sortResultsPrintStudents,
  type QuizResultsPrintOptions,
  type ResultsKeyMode,
  type ResultsPrintJob,
  type ResultsPrintStudent,
  type StudentReportTarget,
} from '@/utils/quizStudentReportPrint';

export interface ResultsPrintModalProps {
  quiz: QuizData;
  /** Every student the Results list shows in the current period filter. */
  responses: QuizResponse[];
  /** Response keys ticked on open; null ticks everyone. */
  initialSelection: readonly string[] | null;
  /** Real name, or the PIN / "Student" fallback when none resolves. */
  resolveName: (response: QuizResponse) => string;
  /** What the board shows: a "Student n" label while names are hidden. */
  resolveShownName: (response: QuizResponse) => string;
  /** Family name first, for the print order. */
  sortNameFor: (response: QuizResponse) => string;
  targetsFor: (response: QuizResponse) => StudentReportTarget[];
  gradeFn: QuestionGradeFn;
  rubricFor: (
    response: QuizResponse,
    question: QuizQuestion
  ) => Rubric | undefined;
  periodOrder: readonly string[];
  /** The assignment is still taking answers. */
  sessionLive: boolean;
  teacherUid: string | null;
  onClose: () => void;
  onError: (message: string) => void;
}

const plural = (n: number, word = 'student') =>
  `${n} ${word}${n === 1 ? '' : 's'}`;

const hasRealName = (response: QuizResponse, name: string) =>
  name !== 'Student' && !(response.pin && name === `PIN ${response.pin}`);

type BooleanOption = Exclude<
  keyof QuizResultsPrintOptions,
  'keyMode' | 'layout'
>;

const TOGGLES: { key: BooleanOption; label: string }[] = [
  { key: 'includeQuestions', label: 'Include the questions' },
  { key: 'markAnswers', label: 'Mark right and wrong' },
  { key: 'showScore', label: 'Show the score' },
  { key: 'showClassDate', label: 'Class period and date' },
  { key: 'showTargets', label: 'Learning target mastery' },
  { key: 'showCommentBox', label: 'Teacher comment box' },
  {
    key: 'showWrittenFeedback',
    label: 'Written-answer feedback (score, comment, rubric, highlights)',
  },
  { key: 'includeStimuli', label: 'Passages and pictures' },
  { key: 'duplexPadding', label: 'Keep double-sided copies aligned' },
];

const KEY_MODES: { id: ResultsKeyMode; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'missed', label: 'Missed only' },
  { id: 'all', label: 'Every question' },
];

/** Print quiz results to hand back, for one student or the whole list (docs/plans/QUIZ_RESULTS_PRINT.md). */
export const ResultsPrintModal: React.FC<ResultsPrintModalProps> = ({
  quiz,
  responses,
  initialSelection,
  resolveName,
  resolveShownName,
  sortNameFor,
  targetsFor,
  gradeFn,
  rubricFor,
  periodOrder,
  sessionLive,
  teacherUid,
  onClose,
  onError,
}) => {
  const [choice, setChoice] = useState<SavedResultsPrintChoice>(() => {
    const saved = loadResultsPrintChoice();
    // The sheet layouts arrive with the reprint; until then every copy is a report.
    return saved.preset === 'bubble-sheet' || saved.options.layout !== 'report'
      ? { preset: 'student-copy', options: applyPreset('student-copy') }
      : saved;
  });
  const options = choice.options;
  const update = (next: SavedResultsPrintChoice) => {
    setChoice(next);
    saveResultsPrintChoice(next);
  };
  const pickPreset = (id: ResultsPrintPresetId) =>
    update({ preset: id, options: applyPreset(id) });
  const setOption = <K extends keyof QuizResultsPrintOptions>(
    key: K,
    value: QuizResultsPrintOptions[K]
  ) => update({ preset: null, options: { ...options, [key]: value } });

  const keyOf = (r: QuizResponse) => getResponseDocKey(r) as string;
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelection ?? responses.map(keyOf))
  );

  // Paper students' options print in their batch's lettered order (D14).
  const batchIds = useMemo(
    () =>
      Array.from(
        new Set(
          responses.flatMap((r) => (r.paperBatchId ? [r.paperBatchId] : []))
        )
      ).sort(),
    [responses]
  );
  const batchIdsKey = batchIds.join('|');
  const [batches, setBatches] = useState<{
    key: string;
    byId: Map<string, PaperBatch>;
  } | null>(null);
  useEffect(() => {
    // Keyed on the joined ids, since `batchIds` is rebuilt on every snapshot.
    const ids = batchIdsKey ? batchIdsKey.split('|') : [];
    if (ids.length === 0 || !teacherUid) return undefined;
    let cancelled = false;
    void Promise.all(
      ids.map((id) =>
        getPaperBatch(teacherUid, id).catch((err: unknown) => {
          logError('ResultsPrintModal.getPaperBatch', err);
          return null;
        })
      )
    ).then((found) => {
      if (cancelled) return;
      const byId = new Map<string, PaperBatch>();
      found.forEach((b, i) => {
        if (b) byId.set(ids[i], b);
      });
      setBatches({ key: batchIdsKey, byId });
    });
    return () => {
      cancelled = true;
    };
  }, [batchIdsKey, teacherUid]);
  const batchesReady =
    batchIds.length === 0 || !teacherUid || batches?.key === batchIdsKey;

  const students = useMemo(() => {
    const rows = responses.map((r) => {
      const batch = r.paperBatchId
        ? batches?.byId.get(r.paperBatchId)
        : undefined;
      const name = resolveName(r);
      const student: ResultsPrintStudent = {
        key: keyOf(r),
        name: hasRealName(r, name) ? name : null,
        sortName: sortNameFor(r),
        pin: r.pin,
        period: r.classPeriod ?? null,
        status: r.status,
        drilldown: computeStudentDrilldown(quiz.questions, r, gradeFn, {
          choiceOrder: batch?.choiceOrder,
          rubricFor: (q) => rubricFor(r, q),
        }),
        targets: targetsFor(r),
        lettered: !!batch?.choiceOrder,
      };
      return { student, response: r };
    });
    const order = sortResultsPrintStudents(
      rows.map((row) => row.student),
      periodOrder
    );
    const byKey = new Map(rows.map((row) => [row.student.key, row]));
    return order.flatMap((s) => {
      const row = byKey.get(s.key);
      return row ? [row] : [];
    });
  }, [
    responses,
    batches,
    resolveName,
    sortNameFor,
    quiz.questions,
    gradeFn,
    rubricFor,
    targetsFor,
    periodOrder,
  ]);

  const chosen = students.filter((s) => selected.has(s.student.key));
  const ungraded = chosen.filter((s) => s.student.drilldown.provisional).length;
  const unfinished = chosen.filter(
    (s) => s.student.status !== 'completed'
  ).length;
  const noName = chosen.filter((s) => s.student.name === null).length;
  const warnKey = options.keyMode !== 'off' && (sessionLive || unfinished > 0);

  const job = (rows: typeof chosen): ResultsPrintJob => ({
    quizTitle: quiz.title,
    stimuli: quiz.stimuli ?? [],
    periodOrder,
    students: rows.map((s) => s.student),
  });

  // The board may be projected, so the preview wears the on-screen name (D10).
  const first = chosen[0];
  let previewDoc: string | null = null;
  if (first) {
    const shown = resolveShownName(first.response);
    previewDoc = buildResultsPreviewDocument(
      buildResultsPrintHtml(
        {
          ...job([first]),
          students: [
            {
              ...first.student,
              name: hasRealName(first.response, shown)
                ? shown
                : first.student.name,
            },
          ],
        },
        options
      )
    );
  }

  const allTicked =
    students.length > 0 && students.every((s) => selected.has(s.student.key));
  const toggleStudent = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handlePrint = () => {
    try {
      printQuizResults(job(chosen), options);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not print.');
    }
  };

  const presets = RESULTS_PRINT_PRESETS.filter((p) => p.id !== 'bubble-sheet');

  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel="Print results"
      maxWidth="max-w-5xl"
      contentClassName=""
      customHeader={
        <div className="flex items-start justify-between border-b border-slate-100 px-5 pb-3 pt-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Print results
              </h2>
              <p className="mt-0.5 max-w-[28rem] truncate text-xs text-slate-500">
                {quiz.title}
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
            {chosen.length === 0
              ? 'Pick at least one student.'
              : `${plural(chosen.length)}, each starting on a new page`}
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
              onClick={handlePrint}
              disabled={chosen.length === 0 || !batchesReady}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              {batchesReady ? 'Print' : 'Loading paper sheets…'}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 px-5 pb-5 pt-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <fieldset>
            <legend className="text-xs font-bold uppercase tracking-wider text-slate-500">
              What to print
            </legend>
            <div
              className="mt-2 flex flex-wrap gap-1.5"
              role="radiogroup"
              aria-label="Preset"
            >
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={choice.preset === p.id}
                  onClick={() => pickPreset(p.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    choice.preset === p.id
                      ? 'border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-dark'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-brand-blue-light'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            {TOGGLES.map((t) => (
              <div
                key={t.key}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-sm text-slate-700">{t.label}</span>
                <Toggle
                  checked={options[t.key]}
                  onChange={(v) => setOption(t.key, v)}
                  label={t.label}
                  size="sm"
                />
              </div>
            ))}
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-700">Show the key</span>
              <div
                className="flex overflow-hidden rounded-lg border border-slate-200"
                role="radiogroup"
                aria-label="Show the key"
              >
                {KEY_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={options.keyMode === m.id}
                    onClick={() => setOption('keyMode', m.id)}
                    className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                      options.keyMode === m.id
                        ? 'bg-brand-blue-primary text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {(ungraded > 0 || warnKey || noName > 0) && (
            <div className="space-y-2">
              {warnKey && (
                <Banner>
                  {unfinished > 0
                    ? `${plural(unfinished)} ${unfinished === 1 ? "hasn't" : "haven't"} finished — printed keys may circulate.`
                    : 'This quiz is still open — printed keys may circulate.'}
                </Banner>
              )}
              {ungraded > 0 && (
                <Banner>
                  {`${plural(ungraded)} ${ungraded === 1 ? 'has' : 'have'} written answers not graded yet. They print as "Not yet graded" and the score reads "so far".`}
                </Banner>
              )}
              {noName > 0 && (
                <Banner>
                  {`${plural(noName)} ${noName === 1 ? 'has' : 'have'} no roster name. Their copies print a blank name line with the PIN under it.`}
                </Banner>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Students
              </span>
              <button
                type="button"
                onClick={() =>
                  setSelected(
                    allTicked
                      ? new Set()
                      : new Set(students.map((s) => s.student.key))
                  )
                }
                className="text-xs font-semibold text-brand-blue-primary hover:underline"
              >
                {allTicked ? 'Select none' : 'Select all'}
              </button>
            </div>
            <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {students.map(({ student, response }) => {
                const shown = resolveShownName(response);
                return (
                  <li key={student.key}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-slate-700 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={selected.has(student.key)}
                        onChange={() => toggleStudent(student.key)}
                        className="accent-brand-blue-primary"
                      />
                      <span className="min-w-0 flex-1 truncate">{shown}</span>
                      {student.period && (
                        <span className="shrink-0 text-xs text-slate-500">
                          {student.period}
                        </span>
                      )}
                      {student.status !== 'completed' && (
                        <span className="shrink-0 text-xs text-slate-500">
                          {student.status === 'joined'
                            ? 'Not started'
                            : 'In progress'}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="flex min-h-[24rem] flex-col">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Preview
          </span>
          {previewDoc ? (
            <iframe
              title="Print preview"
              srcDoc={previewDoc}
              sandbox=""
              className="mt-2 w-full flex-1 rounded-lg border border-slate-200 bg-white"
            />
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              Pick a student to see their copy.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
};

const Banner: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
    <p className="text-xs text-amber-900">{children}</p>
  </div>
);
