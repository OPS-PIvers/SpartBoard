/**
 * PaperImportModal — scan in, responses out (plan §6 `PaperImportPanel`).
 *
 * Pick the printed batch and the administration, read a scanned PDF or image
 * locally, then review: the answer key first (mandatory, plan Q19), then the
 * doubtful rows with their crops, spares to assign, and anything that could
 * not be read. Clean sheets need no attention. Nothing leaves the browser but
 * seat numbers, PINs and letters.
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Loader2,
  ScanLine,
  X,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import type {
  ClassRoster,
  PaperBatch,
  QuizAssignment,
  QuizData,
} from '@/types';
import {
  assemblePaperScan,
  type AssembledSheet,
  type AssembleResult,
  type ScannedPage,
} from '@/utils/paperImportAssemble';
import {
  applyKeyToQuiz,
  buildImportPayload,
  findStudent,
  keySheetChoices,
  sheetRowQuestionIds,
  type ImportPaperCollision,
  type ImportPaperResponsesResult,
  type ImportPaperSheetPayload,
} from '@/utils/paperImportPlan';
import { rasterizeScan, type RasterizedPage } from '@/utils/paperScanRaster';
import { CHOICE_LETTERS } from '@/utils/paperSheetLayout';
import { readPaperPage } from '@/utils/paperSheetReader';

const IMPORT_CHUNK = 200;

interface PaperImportModalProps {
  quiz: QuizData;
  batches: PaperBatch[];
  rosters: ClassRoster[];
  /** Administrations of this quiz the scan may attach to (plan Q24). */
  assignments: QuizAssignment[];
  /** Create a fresh paper administration; returns its id. */
  onCreateAssignment: () => Promise<string>;
  onImport: (
    batchId: string,
    assignmentId: string,
    sheets: ImportPaperSheetPayload[]
  ) => Promise<ImportPaperResponsesResult>;
  /** Persist the quiz after the key sheet fills in its answers. */
  onSaveQuiz: (quiz: QuizData) => Promise<void>;
  onClose: () => void;
  onError: (message: string) => void;
  /** Test seams. */
  rasterize?: (file: Blob) => AsyncGenerator<RasterizedPage>;
  readPage?: typeof readPaperPage;
}

type Step = 'setup' | 'reading' | 'review' | 'importing' | 'done';

const NEW_ADMINISTRATION = '__new__';

const cropKey = (scanIndex: number, question: number) =>
  `${scanIndex}:${question}`;

const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const sheetLabel = (
  sheet: AssembledSheet,
  rosters: readonly ClassRoster[]
): string => {
  if (sheet.kind === 'spare') return `Spare sheet (seat ${sheet.seat})`;
  const found = sheet.student ? findStudent(rosters, sheet.student) : null;
  if (!found) return `Seat ${sheet.seat}`;
  return `${found.student.lastName}, ${found.student.firstName} · ${found.roster.name}`;
};

export const PaperImportModal: React.FC<PaperImportModalProps> = ({
  quiz,
  batches,
  rosters,
  assignments,
  onCreateAssignment,
  onImport,
  onSaveQuiz,
  onClose,
  onError,
  rasterize = rasterizeScan,
  readPage = readPaperPage,
}) => {
  const [step, setStep] = useState<Step>('setup');
  const [batchId, setBatchId] = useState(batches[0]?.id ?? '');
  const [assignmentId, setAssignmentId] = useState(NEW_ADMINISTRATION);
  const [progress, setProgress] = useState('');
  const [assembled, setAssembled] = useState<AssembleResult | null>(null);
  const [crops, setCrops] = useState<Map<string, string>>(new Map());
  const [key, setKey] = useState<Record<string, number | null>>({});
  const [keyConfirmed, setKeyConfirmed] = useState(false);
  const [spareAssignments, setSpareAssignments] = useState<
    Record<number, { rosterId: string; studentId: string }>
  >({});
  const [result, setResult] = useState<ImportPaperResponsesResult | null>(null);
  const [replaceSeats, setReplaceSeats] = useState<Set<number>>(new Set());
  const [lastPayload, setLastPayload] = useState<ImportPaperSheetPayload[]>([]);
  const [importedAssignmentId, setImportedAssignmentId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const batch = useMemo(
    () => batches.find((b) => b.id === batchId) ?? null,
    [batches, batchId]
  );
  const rowIds = useMemo(() => sheetRowQuestionIds(quiz), [quiz]);
  const isStub = useMemo(
    () => quiz.questions.every((q) => CHOICE_LETTERS.includes(q.correctAnswer)),
    [quiz]
  );

  const readFile = async (file: File) => {
    if (!batch) return;
    setStep('reading');
    const pages: ScannedPage[] = [];
    const nextCrops = new Map<string, string>();
    try {
      let scanIndex = 0;
      for await (const page of rasterize(file)) {
        setProgress(`Reading page ${page.pageNumber}…`);
        const read = readPage(page.page, {
          questionCount: batch.questionCount,
          choiceCount: batch.choiceCount,
        });
        if (read.status === 'ok') {
          for (const row of read.rows) {
            if (row.doubt) {
              nextCrops.set(
                cropKey(scanIndex, row.indexOnPage),
                page.crop(row.crop)
              );
            }
          }
        }
        pages.push({ scanIndex, read });
        scanIndex += 1;
      }
      const next = assemblePaperScan(batch, pages);
      setAssembled(next);
      setCrops(nextCrops);
      setKey(next.keySheet ? keySheetChoices(next.keySheet, quiz) : {});
      setKeyConfirmed(false);
      setStep('review');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not read the scan.');
      setStep('setup');
    }
  };

  const setAnswer = (seat: number, question: number, choice: number | null) => {
    setAssembled((prev) => {
      if (!prev) return prev;
      const patch = (s: AssembledSheet): AssembledSheet =>
        s.seat !== seat
          ? s
          : {
              ...s,
              answers: s.answers.map((a) =>
                a.question === question
                  ? {
                      question: a.question,
                      choice,
                      fills: a.fills,
                      crop: a.crop,
                      scanIndex: a.scanIndex,
                    }
                  : a
              ),
            };
      return { ...prev, sheets: prev.sheets.map(patch) };
    });
  };

  const needsKey = !!batch?.keySheetSeat && isStub;
  const keyMissing = needsKey && !assembled?.keySheet;
  const keyIncomplete =
    !!assembled?.keySheet &&
    rowIds.some((id) => key[id] === null || key[id] === undefined);
  const canImport =
    step === 'review' &&
    !!assembled &&
    !keyMissing &&
    (!assembled.keySheet || (keyConfirmed && !keyIncomplete));

  const runImport = async (
    sheets: ImportPaperSheetPayload[],
    targetAssignmentId: string
  ) => {
    const written: number[] = [];
    const collisions: ImportPaperCollision[] = [];
    for (let i = 0; i < sheets.length; i += IMPORT_CHUNK) {
      const part = await onImport(
        batchId,
        targetAssignmentId,
        sheets.slice(i, i + IMPORT_CHUNK)
      );
      written.push(...part.written);
      collisions.push(...part.collisions);
    }
    return { written, collisions };
  };

  const handleImport = async () => {
    if (!batch || !assembled) return;
    setStep('importing');
    try {
      // Key first (Q19): grading reads the quiz, so the key must land before
      // any response that will be graded against it.
      if (assembled.keySheet) {
        await onSaveQuiz(applyKeyToQuiz(quiz, batch, key, Date.now()));
      }
      const { payload } = buildImportPayload({
        batch,
        quiz,
        rosters,
        sheets: assembled.sheets,
        spareAssignments,
      });
      const target =
        assignmentId === NEW_ADMINISTRATION
          ? await onCreateAssignment()
          : assignmentId;
      setImportedAssignmentId(target);
      setLastPayload(payload);
      setResult(await runImport(payload, target));
      setStep('done');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Import failed.');
      setStep('review');
    }
  };

  const handleReplace = async () => {
    if (!result || replaceSeats.size === 0) return;
    setStep('importing');
    try {
      const retry = lastPayload
        .filter((s) => replaceSeats.has(s.seat))
        .map((s) => ({ ...s, replaceExisting: true }));
      const part = await runImport(retry, importedAssignmentId);
      setResult({
        written: [...result.written, ...part.written],
        collisions: result.collisions.filter((c) => !replaceSeats.has(c.seat)),
      });
      setReplaceSeats(new Set());
      setStep('done');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Import failed.');
      setStep('done');
    }
  };

  const summary = useMemo(() => {
    if (!assembled || !batch) return null;
    const { payload, skipped } = buildImportPayload({
      batch,
      quiz,
      rosters,
      sheets: assembled.sheets,
      spareAssignments,
    });
    return {
      ready: payload.length,
      blank: skipped.filter((s) => s.reason === 'blank').length,
      unassigned: skipped.filter((s) => s.reason === 'unassigned-spare').length,
      missingStudent: skipped.filter((s) => s.reason === 'student-not-found')
        .length,
      doubtful: assembled.sheets.reduce(
        (n, s) => n + s.answers.filter((a) => a.doubt).length,
        0
      ),
    };
  }, [assembled, batch, quiz, rosters, spareAssignments]);

  const header = (
    <div className="flex items-start justify-between border-b border-slate-100 px-5 pb-3 pt-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary">
          <ScanLine className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Import scanned answer sheets
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

  const fieldClass =
    'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm';
  const labelClass =
    'text-xs font-bold uppercase tracking-wider text-slate-500';

  const renderSetup = () => (
    <div className="space-y-4 px-5 pb-5 pt-4">
      {batches.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          No answer sheets have been printed for this quiz yet. Print a batch
          first — the scan is matched to it by the marker on every page.
        </p>
      ) : (
        <>
          <label className="block">
            <span className={labelClass}>Printed batch</span>
            <select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className={fieldClass}
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {formatDate(b.createdAt)} ·{' '}
                  {Object.keys(b.seats).length + b.spareSeats.length} sheets ·{' '}
                  {b.questionCount} questions
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Administration</span>
            <select
              value={assignmentId}
              onChange={(e) => setAssignmentId(e.target.value)}
              className={fieldClass}
            >
              <option value={NEW_ADMINISTRATION}>
                New paper administration
              </option>
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {formatDate(a.createdAt)} ·{' '}
                  {a.className?.trim() ? a.className : a.code}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              Attach to an existing administration to put paper make-ups beside
              digital responses.
            </span>
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            aria-label="Scan file"
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
            disabled={!batch}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-6 text-sm font-semibold text-slate-600 transition-colors hover:border-brand-blue-primary hover:text-brand-blue-primary disabled:opacity-50"
          >
            <FileUp className="h-5 w-5" />
            Choose the scanned PDF or image
          </button>
          <p className="text-xs text-slate-500">
            Pages can be in any order, upside down, or split across scans. The
            file is read on this computer and never uploaded.
          </p>
        </>
      )}
    </div>
  );

  const renderKey = () => {
    if (!assembled || !batch) return null;
    if (keyMissing) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mr-1 inline h-4 w-4" />
          The ANSWER KEY sheet was not in this scan. This paper test has no
          answers yet, so scan the key sheet before importing.
        </div>
      );
    }
    if (!assembled.keySheet) return null;
    return (
      <section className="rounded-xl border border-slate-200 p-3">
        <p className="text-sm font-bold text-slate-900">Answer key</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Read from the ANSWER KEY sheet. Check every row before confirming — it
          grades the whole stack.
        </p>
        <ol className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {rowIds.map((id, i) => (
            <li key={id} className="flex items-center gap-2 text-sm">
              <span className="w-6 text-right text-slate-500">{i + 1}.</span>
              <select
                aria-label={`Key for question ${i + 1}`}
                value={key[id] ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setKey((k) => ({ ...k, [id]: v === '' ? null : Number(v) }));
                  setKeyConfirmed(false);
                }}
                className="rounded border border-slate-200 px-1 py-0.5 text-sm"
              >
                <option value="">—</option>
                {CHOICE_LETTERS.slice(0, batch.choiceCount).map((letter, c) => (
                  <option key={letter} value={c}>
                    {letter}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ol>
        <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <input
            type="checkbox"
            checked={keyConfirmed}
            disabled={keyIncomplete}
            onChange={(e) => setKeyConfirmed(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          {keyIncomplete
            ? 'Fill in every row to confirm the key'
            : 'This key is correct'}
        </label>
      </section>
    );
  };

  const renderSheet = (sheet: AssembledSheet) => {
    if (!batch) return null;
    const doubtful = sheet.answers.filter((a) => a.doubt);
    const needsAttention =
      doubtful.length > 0 ||
      sheet.flags.length > 0 ||
      (sheet.kind === 'spare' && !sheet.isBlank);
    if (!needsAttention) return null;
    return (
      <section
        key={sheet.seat}
        className="rounded-xl border border-slate-200 p-3"
        aria-label={sheetLabel(sheet, rosters)}
      >
        <p className="text-sm font-bold text-slate-900">
          {sheetLabel(sheet, rosters)}
        </p>
        {sheet.kind === 'spare' && !sheet.isBlank && (
          <label className="mt-2 block">
            <span className={labelClass}>Whose sheet is this?</span>
            <select
              aria-label={`Student for seat ${sheet.seat}`}
              value={
                spareAssignments[sheet.seat]
                  ? `${spareAssignments[sheet.seat].rosterId}/${spareAssignments[sheet.seat].studentId}`
                  : ''
              }
              onChange={(e) => {
                const [rosterId, studentId] = e.target.value.split('/');
                setSpareAssignments((prev) => {
                  const next = { ...prev };
                  if (rosterId && studentId)
                    next[sheet.seat] = { rosterId, studentId };
                  else delete next[sheet.seat];
                  return next;
                });
              }}
              className={fieldClass}
            >
              <option value="">Not assigned — skip this sheet</option>
              {rosters.map((r) =>
                r.students.map((s) => (
                  <option key={`${r.id}/${s.id}`} value={`${r.id}/${s.id}`}>
                    {s.lastName}, {s.firstName} · {r.name}
                  </option>
                ))
              )}
            </select>
          </label>
        )}
        {sheet.missingPages.length > 0 && (
          <p className="mt-2 text-xs text-amber-800">
            Page {sheet.missingPages.join(', ')} not found in the scan — those
            questions import as unanswered until it is rescanned.
          </p>
        )}
        {sheet.flags.includes('duplicate-conflict') && (
          <p className="mt-2 text-xs text-amber-800">
            This sheet was scanned more than once with different answers; the
            later scan is shown.
          </p>
        )}
        {doubtful.length > 0 && (
          <ul className="mt-2 space-y-2">
            {doubtful.map((a) => {
              const crop = crops.get(cropKey(a.scanIndex, a.question));
              return (
                <li
                  key={a.question}
                  className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-2"
                >
                  <span className="w-8 text-sm font-semibold text-slate-700">
                    {a.question + 1}.
                  </span>
                  {crop && (
                    <img
                      src={crop}
                      alt={`Question ${a.question + 1} as scanned`}
                      className="h-10 rounded border border-slate-200 bg-white"
                    />
                  )}
                  <span className="text-xs text-slate-500">
                    {a.doubt === 'multiple'
                      ? 'More than one bubble'
                      : 'Unclear mark'}
                  </span>
                  <span className="flex gap-1">
                    {CHOICE_LETTERS.slice(0, batch.choiceCount).map(
                      (letter, c) => (
                        <button
                          key={letter}
                          type="button"
                          aria-label={`Question ${a.question + 1}: ${letter}`}
                          onClick={() => setAnswer(sheet.seat, a.question, c)}
                          className="h-7 w-7 rounded-full border border-slate-300 text-xs font-bold text-slate-700 hover:bg-brand-blue-lighter/40"
                        >
                          {letter}
                        </button>
                      )
                    )}
                    <button
                      type="button"
                      aria-label={`Question ${a.question + 1}: blank`}
                      onClick={() => setAnswer(sheet.seat, a.question, null)}
                      className="h-7 rounded-full border border-slate-300 px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Blank
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  };

  const renderReview = () => {
    if (!assembled || !summary) return null;
    const problems = [
      ...assembled.unreadablePages.map(
        (p) => `Page ${p + 1}: could not be read`
      ),
      ...assembled.foreignPages.map(
        (p) => `Page ${p + 1}: belongs to a different batch`
      ),
      ...assembled.unknownPages.map(
        (p) => `Page ${p + 1}: seat or page number not in this batch`
      ),
    ];
    const blankSheets = assembled.sheets.filter((s) => s.isBlank);
    return (
      <div className="space-y-4 px-5 pb-5 pt-4">
        <p className="text-sm text-slate-700">
          <strong>{summary.ready}</strong> sheet{summary.ready === 1 ? '' : 's'}{' '}
          ready to import
          {summary.doubtful > 0 && (
            <>
              , <strong>{summary.doubtful}</strong> row
              {summary.doubtful === 1 ? '' : 's'} to check
            </>
          )}
          {summary.blank > 0 && (
            <>
              , {summary.blank} blank sheet{summary.blank === 1 ? '' : 's'}{' '}
              unused
            </>
          )}
          {summary.unassigned > 0 && (
            <>
              , {summary.unassigned} spare{summary.unassigned === 1 ? '' : 's'}{' '}
              unassigned
            </>
          )}
          {summary.missingStudent > 0 && (
            <>, {summary.missingStudent} no longer on a roster</>
          )}
          .
        </p>
        {renderKey()}
        {assembled.sheets.map(renderSheet)}
        {problems.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-bold text-amber-900">Pages set aside</p>
            <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
              {problems.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          </section>
        )}
        {blankSheets.length > 0 && (
          <p className="text-xs text-slate-500">
            Unused: {blankSheets.map((s) => sheetLabel(s, rosters)).join('; ')}.
          </p>
        )}
      </div>
    );
  };

  const renderDone = () => {
    if (!result) return null;
    return (
      <div className="space-y-4 px-5 pb-5 pt-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-bold text-slate-900">
              {result.written.length} response
              {result.written.length === 1 ? '' : 's'} imported
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Grade and publish them from Results, like any other
              administration.
            </p>
          </div>
        </div>
        {result.collisions.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-bold text-amber-900">
              {result.collisions.length} student
              {result.collisions.length === 1
                ? ' already has'
                : 's already have'}{' '}
              a response here
            </p>
            <p className="mt-0.5 text-xs text-amber-800">
              Tick a sheet to replace the existing response with the paper one;
              leave it to keep what is there.
            </p>
            <ul className="mt-2 space-y-1">
              {result.collisions.map((c) => {
                const sheet = assembled?.sheets.find((s) => s.seat === c.seat);
                return (
                  <li key={c.seat} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      aria-label={`Replace seat ${c.seat}`}
                      checked={replaceSeats.has(c.seat)}
                      onChange={(e) =>
                        setReplaceSeats((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(c.seat);
                          else next.delete(c.seat);
                          return next;
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span>
                      {sheet ? sheetLabel(sheet, rosters) : `Seat ${c.seat}`}
                      <span className="ml-2 text-xs text-amber-800">
                        {c.fromOtherBatch
                          ? 'from an earlier paper import'
                          : 'answered on a device'}
                        {c.existingSubmittedAt
                          ? ` · ${formatDate(c.existingSubmittedAt)}`
                          : ''}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => void handleReplace()}
              disabled={replaceSeats.size === 0}
              className="mt-3 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Replace selected
            </button>
          </section>
        )}
      </div>
    );
  };

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
          onClick={() => void handleImport()}
          disabled={!canImport || summary?.ready === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Import {summary?.ready ?? 0} sheet{summary?.ready === 1 ? '' : 's'}
        </button>
      </div>
    ) : step === 'done' ? (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue-dark"
        >
          Done
        </button>
      </div>
    ) : undefined;

  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel="Import scanned answer sheets"
      maxWidth="max-w-2xl"
      contentClassName=""
      customHeader={header}
      footer={footer}
    >
      {step === 'setup' && renderSetup()}
      {(step === 'reading' || step === 'importing') && (
        <div className="flex items-center gap-3 px-5 py-8 text-sm text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          {step === 'reading' ? progress || 'Reading…' : 'Importing…'}
        </div>
      )}
      {step === 'review' && renderReview()}
      {step === 'done' && renderDone()}
    </Modal>
  );
};
