/**
 * PaperPrintModal — pick who gets a sheet, then print the stack.
 *
 * Writes the `PaperBatch` that the scan import later reads seats out of, so a
 * successful print is the point of no return: the batch must be saved before
 * the paper exists. See docs/plans/QUIZ_PAPER_ANSWER_SHEETS.md §6.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Printer,
  Share2,
  X,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { AiReaderToggle } from '@/components/common/library/importer/AiReaderToggle';
import {
  TestAndKeyUploader,
  type TestAndKeySelection,
} from '@/components/common/library/importer/TestAndKeyUploader';
import type { ReadUploadedTest } from '@/utils/quizDocumentImport/readTestAndKey';
import { Toggle } from '@/components/common/Toggle';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useGooglePicker } from '@/hooks/useGooglePicker';
import { usePaperSheetImageSharing } from '@/hooks/usePaperSheetImageSharing';
import { usePaperSheetStimulusImages } from '@/hooks/usePaperSheetStimulusImages';
import type {
  ClassRoster,
  PaperBatch,
  PaperSheetStimulus,
  QuizData,
  Student,
} from '@/types';
import { applyQuestionFill, type QuestionFill } from '@/utils/paperQuestionOcr';
import {
  MAX_CHOICE_COUNT,
  MIN_CHOICE_COUNT,
  pageCountForQuestions,
  paperGridOf,
} from '@/utils/paperSheetLayout';
import {
  readByLabel,
  type ExtractedQuestion,
} from '@/utils/quizDocumentImport';
import {
  MAX_PDF_PAGES_LISTED,
  isPdf,
  openPdfPages,
  pdfPageFileName,
  pdfPageLabel,
  type PdfPages,
} from '@/utils/paperSheetPdfPage';
import { stimulusLoadErrorMessage } from '@/utils/paperSheetStimulusImages';
import { shareSheetImagesPrompt } from '@/utils/paperSheetStimulusSharing';
import { PaperSheetStimuliSection } from './PaperSheetStimuliSection';
import {
  analyzePaperQuiz,
  buildPaperStubQuiz,
  planPaperBatch,
} from '@/utils/paperSheetPlan';
import { printPaperSheets } from '@/utils/paperSheetPrint';
import { printPaperTest } from '@/utils/paperTestPrint';

const MAX_SPARES = 20;
const DEFAULT_STUB_QUESTIONS = 25;
/** Upload cap for a sheet image; a page of toner cannot use more than this. */
const MAX_SHEET_IMAGE_BYTES = 10 * 1024 * 1024;
const SHEET_IMAGE_FOLDER = 'Assets/PaperSheetStimuli';

/** Natural pixel size, so auto-fit knows the shape without loading the file. */
async function imagePixelSize(
  file: Blob
): Promise<{ widthPx: number; heightPx: number } | null> {
  const url = URL.createObjectURL(file);
  try {
    const size = await new Promise<{
      widthPx: number;
      heightPx: number;
    } | null>((resolve) => {
      const img = new Image();
      img.onload = () =>
        resolve({ widthPx: img.naturalWidth, heightPx: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = url;
    });
    return size;
  } finally {
    URL.revokeObjectURL(url);
  }
}

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
  /**
   * Persist the answer-sheet stimuli onto the quiz. Called just before the
   * print, so what is on the paper is what the quiz records (D18). Absent on
   * the "Paper test" door, where the stub carries them instead.
   */
  onSaveSheetStimuli?: (stimuli: PaperSheetStimulus[]) => Promise<void>;
  /**
   * Reads a test document with the import wizard's readers, so a new paper
   * test carries its real questions from the start instead of placeholders.
   * Absent when the document-import feature is off, which hides the upload.
   */
  readDocument?: ReadUploadedTest;
  /** The teacher has AI access, so the reader can be switched off for a read. */
  canUseAi?: boolean;
  /** Drive picker for that document; absent hides the Drive button. */
  pickDocument?: () => Promise<{ file: Blob; fileName: string } | null>;
  /** The quiz is in a PLC sync group, so its sheet images need sharing (D6). */
  inPlcGroup?: boolean;
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
  onSaveSheetStimuli,
  readDocument,
  canUseAi = false,
  pickDocument,
  inPlcGroup = false,
  onClose,
  onError,
  print = printPaperSheets,
  printTest = printPaperTest,
}) => {
  const { driveService } = useGoogleDrive();
  const { openPicker } = useGooglePicker();
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
  // The test paper this stub's questions came from, when one was uploaded.
  const [readDoc, setReadDoc] = useState<{
    fileName: string;
    questions: ExtractedQuestion[];
    warnings: string[];
    note: string;
  } | null>(null);
  const [readingDoc, setReadingDoc] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [spareCount, setSpareCount] = useState(2);
  const [includeKeySheet, setIncludeKeySheet] = useState(isStub);
  const [includeQuestionText, setIncludeQuestionText] = useState(false);
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
  const unanswered = (readDoc?.questions ?? []).filter(
    (q) => !q.correctAnswer.trim()
  ).length;
  const choiceCount = isStub ? stubChoiceCount : analysis.sheetChoiceCount;

  const [sheetStimuli, setSheetStimuli] = useState<PaperSheetStimulus[]>(
    quiz.paperSheetStimuli ?? []
  );
  const [stimulusBusy, setStimulusBusy] = useState(false);
  // Anything in the band takes the page's right half, so the answers drop to
  // one column and the test spreads over twice as many pages (D1).
  const columnsPerPage = sheetStimuli.length > 0 ? 1 : 2;
  // Question text takes the band stimuli would print in, so the two never combine.
  const questionTextLayout =
    includeQuestionText && !isStub && sheetStimuli.length === 0;
  const sheetImages = usePaperSheetStimulusImages(sheetStimuli);
  const sharing = usePaperSheetImageSharing(sheetStimuli, inPlcGroup);
  /** Set once the teacher has answered the sharing ask, either way. */
  const [sharingAnswered, setSharingAnswered] = useState(false);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [askingToShare, setAskingToShare] = useState(false);
  /** A PDF waiting on the teacher to say which page goes on the sheet (D7). */
  const [pdfPick, setPdfPick] = useState<{
    file: File;
    pages: PdfPages;
  } | null>(null);
  const sheetStimuliChanged =
    JSON.stringify(sheetStimuli) !==
    JSON.stringify(quiz.paperSheetStimuli ?? []);
  const quizImageStimuli = useMemo(
    () => (quiz.stimuli ?? []).filter((s) => s.type === 'image'),
    [quiz.stimuli]
  );

  /** Put the bytes in Drive and make the stimulus that points at them. */
  const uploadToDrive = useCallback(
    async (
      blob: Blob,
      fileName: string,
      label: string,
      size: { widthPx: number; heightPx: number } | null
    ): Promise<PaperSheetStimulus | null> => {
      if (!driveService) {
        onError('Connect Google Drive to add an image to the answer sheet.');
        return null;
      }
      // Uploaded unshared: it stays the teacher's until the quiz is
      // published to a PLC, which is where the sharing prompt belongs (D6).
      const driveFile = await driveService.uploadFile(
        blob,
        `sheet-${Date.now()}-${fileName.replace(/[^\w.-]+/g, '_')}`,
        SHEET_IMAGE_FOLDER
      );
      return {
        id: crypto.randomUUID(),
        label,
        source: 'image',
        driveFileId: driveFile.id,
        ...(size ?? {}),
      };
    },
    [driveService, onError]
  );

  const uploadSheetImage = useCallback(
    async (file: File): Promise<PaperSheetStimulus | null> => {
      const pdf = isPdf(file);
      if (!pdf && !file.type.startsWith('image/')) {
        onError(`"${file.name}" is not an image or a PDF.`);
        return null;
      }
      if (file.size > MAX_SHEET_IMAGE_BYTES) {
        onError(
          `"${file.name}" is too large (max ${MAX_SHEET_IMAGE_BYTES / 1024 / 1024}MB).`
        );
        return null;
      }
      // Said now rather than after a PDF has been parsed and a page picked.
      if (!driveService) {
        onError('Connect Google Drive to add an image to the answer sheet.');
        return null;
      }
      setStimulusBusy(true);
      try {
        // A PDF is not printable as it stands: the teacher picks the page and
        // it is rendered and uploaded as a PNG, so the print never sees pdf.js.
        if (pdf) {
          const pages = await openPdfPages(file);
          setPdfPick({ file, pages });
          return null;
        }
        return await uploadToDrive(
          file,
          file.name,
          file.name,
          await imagePixelSize(file)
        );
      } catch (err) {
        onError(
          err instanceof Error ? err.message : 'Could not upload that image.'
        );
        return null;
      } finally {
        setStimulusBusy(false);
      }
    },
    [driveService, onError, uploadToDrive]
  );

  const pickSheetImage =
    useCallback(async (): Promise<PaperSheetStimulus | null> => {
      setStimulusBusy(true);
      try {
        const picked = await openPicker({ mode: 'images' });
        if (!picked) return null;
        return {
          id: crypto.randomUUID(),
          label: picked.name,
          source: 'image',
          driveFileId: picked.id,
        };
      } catch (err) {
        onError(
          err instanceof Error ? err.message : 'Could not open Google Drive.'
        );
        return null;
      } finally {
        setStimulusBusy(false);
      }
    }, [openPicker, onError]);

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
  const pagesPerSheet = pageCountForQuestions(
    questionCount,
    questionTextLayout ? 'questions' : columnsPerPage
  );
  const canPrint =
    sheetCount > 0 &&
    questionCount > 0 &&
    !printing &&
    !stimulusBusy &&
    !sheetImages.loading &&
    // A click that beat the Drive lookup would skip the sharing ask entirely.
    !sharing.checking;

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

  /**
   * Read the teacher's own test paper so the stub starts with its questions
   * (D17). The numbers printed on the paper are the rows, so the count
   * follows the highest number read rather than how many were found.
   */
  const readQuestionsFrom = async ({ test, key }: TestAndKeySelection) => {
    if (!readDocument || !test) return;
    setReadingDoc(true);
    try {
      const extracted = await readDocument(test, {
        ...(canUseAi ? { useAi } : {}),
        key,
      });
      const questions = extracted.questions.filter((q) => q.text.trim());
      if (questions.length === 0) {
        onError(
          'No numbered questions were found in that file. Check that every question starts with its number.'
        );
        return;
      }
      const highest = Math.max(...questions.map((q) => q.number));
      setStubQuestionCount(Math.max(1, Math.min(500, highest)));
      const widest = Math.max(...questions.map((q) => q.options.length));
      if (widest >= MIN_CHOICE_COUNT) {
        setStubChoiceCount(Math.min(widest, MAX_CHOICE_COUNT));
      }
      if (!stubTitle.trim() && extracted.title.trim()) {
        setStubTitle(extracted.title.trim());
      }
      setReadDoc({
        fileName: key ? `${test.fileName} + ${key.fileName}` : test.fileName,
        questions,
        note: readByLabel(extracted.readBy),
        // Row notes are numbered by the reader, so they name their own row.
        warnings: [
          ...extracted.warnings,
          ...questions.flatMap((q) =>
            q.warnings.map((w) => `Question ${q.number}: ${w}`)
          ),
        ],
      });
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Could not read that test paper.'
      );
    } finally {
      setReadingDoc(false);
    }
  };

  /** What the read paper gives each stub row, by the number printed on it. */
  const documentFills = (): Record<number, QuestionFill> => {
    const fills: Record<number, QuestionFill> = {};
    for (const q of readDoc?.questions ?? []) {
      fills[q.number] = {
        text: q.text,
        options: q.options.map((o) => o.text),
        correctAnswer: q.correctAnswer,
      };
    }
    return fills;
  };

  /**
   * The bubble letters stand for the choices the teacher's own paper prints,
   * in its order — never a reshuffle, because that paper is already printed.
   * Without this the import would read every bubble back as a bare letter.
   */
  const documentChoiceOrder = (stub: QuizData): Record<string, string[]> => {
    const order: Record<string, string[]> = {};
    for (const q of readDoc?.questions ?? []) {
      const row = stub.questions[q.number - 1];
      if (row && q.options.length > 0) {
        order[row.id] = q.options.map((o) => o.text);
      }
    }
    return order;
  };

  const handlePrint = async () => {
    // A stimulus that cannot be fetched would print as an empty box the
    // teacher only discovers at the copier, so it blocks the print instead.
    if (sheetImages.failed.length > 0) {
      onError(stimulusLoadErrorMessage(sheetImages.failed));
      return;
    }
    setPrinting(true);
    try {
      const now = Date.now();
      // Create the quiz before the batch that points at it, and both before
      // printing: a sheet whose batch or quiz was never stored can never be
      // imported, and the teacher cannot tell that by looking at the paper.
      const printedQuiz = onCreateQuiz
        ? {
            ...applyQuestionFill(
              buildPaperStubQuiz({
                quizId: quiz.id,
                title: stubTitle,
                questionCount,
                choiceCount,
                createdAt: now,
              }),
              documentFills(),
              now
            ),
            ...(sheetStimuli.length > 0
              ? { paperSheetStimuli: sheetStimuli }
              : {}),
          }
        : quiz;
      const readChoiceOrder = onCreateQuiz
        ? documentChoiceOrder(printedQuiz)
        : {};
      const { batch, sheets } = planPaperBatch({
        batchId: crypto.randomUUID(),
        quizId: quiz.id,
        selections: selectionsForPrint,
        questionCount,
        choiceCount,
        spareCount,
        includeKeySheet,
        ...(isStub ? {} : { questions: sheetQuestions }),
        ...(Object.keys(readChoiceOrder).length > 0
          ? { choiceOrder: readChoiceOrder }
          : {}),
        ...(columnsPerPage === 1 ? { columnsPerPage: 1 as const } : {}),
        ...(questionTextLayout ? { sheetLayout: 'questions' as const } : {}),
        createdAt: now,
      });
      if (onCreateQuiz) await onCreateQuiz(printedQuiz);
      // The stub carries them already; an authored quiz records them here, so
      // the next print and every PLC copy start from the same sheet (D18).
      // Only when they changed: an unchanged save would publish a new version
      // to the PLC and tell every peer to pull a print they did not make.
      else if (onSaveSheetStimuli && sheetStimuliChanged)
        await onSaveSheetStimuli(sheetStimuli);
      await onSaveBatch(batch);
      print({
        batchId: batch.id,
        quizTitle: printedQuiz.title,
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
        ...(!isStub && analysis.rows.some((r) => r.sourceLabel)
          ? { rowLabels: analysis.rows.map((r) => r.sourceLabel) }
          : {}),
        ...(sheetStimuli.length > 0
          ? {
              sheetStimuli,
              stimulusImageSrc: sheetImages.src,
              // Closing unmounts this modal, which revokes the object URLs the
              // print window is reading from; wait until it has them.
              onImagesReady: () => {
                if (isStub) onClose();
              },
            }
          : {}),
        sheets,
      });
      // An authored quiz needs its test paper printed from the same batch, so
      // the letters on the paper match the order the import will decode.
      if (isStub && sheetStimuli.length === 0) onClose();
      else if (!isStub) setPrintedBatch(batch);
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Could not print response sheets.'
      );
    } finally {
      setPrinting(false);
    }
  };

  /**
   * Sharing is the owner's call, and this is the moment they are looking at
   * the images, so the ask comes before the paper rather than after (D6).
   */
  const handlePrintClick = () => {
    if (inPlcGroup && !sharingAnswered && sharing.unshared.length > 0) {
      setAskingToShare(true);
      return;
    }
    void handlePrint();
  };

  const answerSharing = async (share: boolean) => {
    if (share) {
      setSharingBusy(true);
      const failed = await sharing.share();
      setSharingBusy(false);
      if (failed.length > 0) {
        onError(
          `Could not share ${failed.map((s) => `"${s.label}"`).join(', ')} — your PLC will see an empty box there.`
        );
      }
    }
    setSharingAnswered(true);
    setAskingToShare(false);
    void handlePrint();
  };

  // A pdf.js worker outlives React state, so it is released where React can
  // promise it happens: when the pick changes, and when the modal goes away.
  useEffect(() => {
    const pages = pdfPick?.pages;
    return () => pages?.close();
  }, [pdfPick]);

  const closePdfPick = () => setPdfPick(null);

  const addPdfPage = async (pageNumber: number) => {
    if (!pdfPick) return;
    const { file, pages } = pdfPick;
    setStimulusBusy(true);
    try {
      const rendered = await pages.render(pageNumber);
      const stimulus = await uploadToDrive(
        rendered.blob,
        pdfPageFileName(file.name, pageNumber),
        pdfPageLabel(file.name, pageNumber, pages.pageCount),
        { widthPx: rendered.widthPx, heightPx: rendered.heightPx }
      );
      if (stimulus) setSheetStimuli((prev) => [...prev, stimulus]);
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Could not read that PDF page.'
      );
    } finally {
      setStimulusBusy(false);
      closePdfPick();
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

  if (pdfPick) {
    const listed = Math.min(pdfPick.pages.pageCount, MAX_PDF_PAGES_LISTED);
    return (
      <Modal
        isOpen
        // Backing out mid-render would destroy the document the render is
        // still reading, and the teacher would get an error for a page they
        // had already given up on.
        onClose={() => {
          if (!stimulusBusy) closePdfPick();
        }}
        ariaLabel="Pick a page"
        maxWidth="max-w-md"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              disabled={stimulusBusy}
              onClick={closePdfPick}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        }
      >
        <div className="space-y-3 px-6 pb-4">
          <h2 className="text-base font-semibold text-slate-800">
            Which page goes on the sheet?
          </h2>
          <p className="text-sm text-slate-700">
            {pdfPick.file.name} has {pdfPick.pages.pageCount} page
            {pdfPick.pages.pageCount === 1 ? '' : 's'}. One page goes on the
            answer sheet, as a picture.
          </p>
          <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto">
            {Array.from({ length: listed }, (_, i) => (
              <button
                key={i + 1}
                type="button"
                disabled={stimulusBusy}
                onClick={() => void addPdfPage(i + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Page {i + 1}
              </button>
            ))}
          </div>
          {pdfPick.pages.pageCount > listed && (
            <p className="text-xs text-slate-600">
              Only the first {listed} pages are offered. Split the PDF if you
              need one from further in.
            </p>
          )}
        </div>
      </Modal>
    );
  }

  if (askingToShare) {
    return (
      <Modal
        isOpen
        onClose={() => setAskingToShare(false)}
        ariaLabel="Share these images with your PLC"
        maxWidth="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={sharingBusy}
              onClick={() => void answerSharing(false)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              Print without sharing
            </button>
            <button
              type="button"
              disabled={sharingBusy}
              onClick={() => void answerSharing(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark disabled:opacity-50"
            >
              <Share2 className="h-4 w-4" />
              {sharingBusy ? 'Sharing…' : 'Share and print'}
            </button>
          </div>
        }
      >
        <div className="space-y-3 px-6 pb-4">
          <h2 className="text-base font-semibold text-slate-800">
            Share these images with your PLC?
          </h2>
          <p className="text-sm text-slate-700">
            {shareSheetImagesPrompt(sharing.unshared)}
          </p>
          <p className="text-sm text-slate-700">
            Sharing lets anyone with the link open them, which is what a
            teammate printing your test needs. Your own copies print either way.
          </p>
        </div>
      </Modal>
    );
  }

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
                {printedBatch.sheetLayout === 'questions'
                  ? 'The questions are printed on the sheets. Print the test paper too if any question was too long to fit beside its bubbles.'
                  : 'Now print the test paper. Its choices are lettered to match these sheets, so hand out this copy rather than one written by hand — the import reads each bubble through that order.'}
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
              onClick={handlePrintClick}
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

        {onCreateQuiz && readDocument && (
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Import questions (optional)
            </span>
            {readDoc ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {readDoc.fileName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {readDoc.questions.length} question
                      {readDoc.questions.length === 1 ? '' : 's'} read. Results
                      will name the question a student missed, not just its
                      number.{readDoc.note ? ` ${readDoc.note}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReadDoc(null)}
                    className="shrink-0 text-xs font-bold uppercase tracking-wide text-slate-500 transition-colors hover:text-brand-red-primary"
                  >
                    Remove
                  </button>
                </div>
                <ol className="mt-2 max-h-36 space-y-1 overflow-y-auto pr-1">
                  {readDoc.questions.map((q) => (
                    <li key={q.number} className="flex gap-2 text-xs">
                      <span className="w-5 shrink-0 text-right font-semibold text-slate-500">
                        {q.number}.
                      </span>
                      <span className="min-w-0 flex-1 truncate text-slate-700">
                        {q.text}
                      </span>
                    </li>
                  ))}
                </ol>
                {unanswered > 0 && (
                  <p className="mt-2 text-xs text-amber-800">
                    {unanswered} question{unanswered === 1 ? '' : 's'} came in
                    without an answer. Bubble the ANSWER KEY sheet, or fill them
                    in the quiz editor.
                  </p>
                )}
                {readDoc.warnings.length > 0 && (
                  <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto pr-1 text-xs text-amber-800">
                    {readDoc.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <TestAndKeyUploader
                  pickFromDrive={pickDocument}
                  submitLabel="Read the test"
                  busy={readingDoc}
                  busyLabel="Reading the test…"
                  onSubmit={(selection) => void readQuestionsFrom(selection)}
                >
                  {canUseAi && (
                    <AiReaderToggle
                      checked={useAi}
                      onChange={setUseAi}
                      disabled={readingDoc}
                    />
                  )}
                </TestAndKeyUploader>
                <p className="text-xs text-slate-500">
                  The questions and answer choices come from your file. Students
                  still answer on the bubble sheet.
                </p>
              </div>
            )}
          </div>
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

        <PaperSheetStimuliSection
          stimuli={sheetStimuli}
          onChange={setSheetStimuli}
          quizImageStimuli={quizImageStimuli}
          pageCount={pagesPerSheet}
          imageSrc={sheetImages.src}
          failed={sheetImages.failed}
          unshared={sharing.unshared}
          onUploadFile={uploadSheetImage}
          onPickFromDrive={pickSheetImage}
          busy={stimulusBusy}
        />

        {!isStub && (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-700">Include question text</p>
              <p className="text-xs text-slate-500">
                {sheetStimuli.length > 0
                  ? 'Not available while the sheet has images or templates on it.'
                  : 'Prints each question with its choices listed underneath, each beside its own bubble. Fits 5 questions per page.'}
              </p>
            </div>
            <Toggle
              checked={questionTextLayout}
              onChange={setIncludeQuestionText}
              disabled={sheetStimuli.length > 0}
              label="Include question text"
              size="sm"
            />
          </div>
        )}

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
