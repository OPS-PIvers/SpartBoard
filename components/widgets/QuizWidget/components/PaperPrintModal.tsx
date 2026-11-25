/**
 * PaperPrintModal — pick who gets a sheet, then print the stack.
 *
 * Writes the `PaperBatch` that the scan import later reads seats out of, so a
 * successful print is the point of no return: the batch must be saved before
 * the paper exists. See docs/plans/shipped/QUIZ_PAPER_ANSWER_SHEETS.md §6.
 */

import { promptLabel } from '@/utils/quizPromptText';
import { choicePictureFields } from '@/utils/quizAnswerImages';
import { plainPromptText } from '@/utils/promptMath';
import { tourTypeAttr } from '@/config/tourAnchors';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertTriangle, Printer, Share2, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { AssignStepper } from '@/components/common/library/assignStepper/AssignStepper';
import {
  getAssignStepTitle,
  type AssignStepDef,
} from '@/components/common/library/assignStepper/assignSteps';
import { ClassChecklist } from '@/components/common/library/assignStepper/ClassChecklist';
import { StudentPickMenu } from '@/components/common/library/assignStepper/StudentPickMenu';
import {
  EMPTY_ASSIGN_CLASSES_VALUE,
  formatClassesValue,
  type AssignClassesValue,
} from '@/components/common/library/assignStepper/assignClassesValue';
import { SharingStep } from '@/components/common/library/assignStepper/SharingStep';
import {
  formatSharingValue,
  isSharingStepAvailable,
  PICK_A_PLC,
  sharingNeedsPlc,
  type SharingStepValue,
} from '@/components/common/library/assignStepper/SharingStep.format';
import {
  paperSelectedStudentIds,
  paperStudentRef,
} from '@/utils/paperAssignClasses';
import { Toggle } from '@/components/common/Toggle';
import { useAuth } from '@/context/useAuth';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useGooglePicker } from '@/hooks/useGooglePicker';
import { usePaperSheetImageSharing } from '@/hooks/usePaperSheetImageSharing';
import { usePaperSheetStimulusImages } from '@/hooks/usePaperSheetStimulusImages';
import type {
  ClassRoster,
  PaperBatch,
  PaperBoxSize,
  PaperBoxStyle,
  PaperPageMap,
  PaperSheetStimulus,
  Plc,
  QuizData,
  Student,
} from '@/types';
import { pageCountForQuestions, paperGridOf } from '@/utils/paperSheetLayout';
import {
  isPdf,
  openPdfPages,
  pdfPageFileName,
  pdfPageLabel,
  type PdfPages,
} from '@/utils/paperSheetPdfPage';
import { stimulusLoadErrorMessage } from '@/utils/paperSheetStimulusImages';
import { shareSheetImagesPrompt } from '@/utils/paperSheetStimulusSharing';
import { PaperSheetStimuliSection } from './PaperSheetStimuliSection';
import { PaperPrintPreview } from './PaperPrintPreview';
import {
  BoxImageSelect,
  BoxSizeSelect,
  BoxStyleSelect,
  WrittenBoxRow,
} from './PaperWrittenBoxControls';
import {
  analyzePaperQuiz,
  matchingPairs,
  planPaperBatch,
  type PaperExclusionReason,
  type PaperQuizAnalysis,
} from '@/utils/paperSheetPlan';
import {
  planPaperPages,
  type PaperSheetEntry,
  type PlanPaperPagesResult,
} from '@/utils/paperPageMap';
import { browserStemMeasure, stemLinesById } from '@/utils/paperStemLines';
import { MAX_SHEET_PAGE } from '@/utils/paperSheetMarker';
import {
  PAPER_HANDWRITTEN_FEATURE,
  PAPER_MAX_BOX_PAGES,
  PAPER_MULTI_PAGE_FEATURE,
  PAPER_PRINT_PREVIEW_FEATURE,
  letteredBlanks,
  changedPaperBoxSetup,
  paperBoxImageChoices,
  withPaperBoxSizes,
  withPaperBoxStyles,
  paperBoxStyleOf,
  type PaperBoxStylePick,
} from '@/utils/paperWritten';
import { splitBlanks } from '@/utils/quizFibBlanks';
import {
  buildPaperSheetsPreviewPages,
  type PaperPreviewPage,
  printPaperSheets,
  type PaperGroupText,
  type PaperPrintJob,
  type PaperPromptPage,
} from '@/utils/paperSheetPrint';
import {
  browserBlockMeasure,
  estimateBlockMm,
  planSheetStimuli,
  type BlockMeasure,
} from '@/utils/paperSheetStimulusBlocks';
import { paperPrintWords } from '@/utils/paperPrintWords';
import {
  blockPromptRows,
  layoutSheetStimuli,
  type SheetStimuliSet,
} from '@/utils/paperSheetStimuliLayout';
import {
  planPaperVersions,
  printVersionsFor,
  promptAnalysis,
  promptPagesFor,
  promptRowsFor,
  promptQuestionIds,
  groupTextsFor,
  sheetRowSlots,
  versionSheetQuestions,
  versionStemLines,
} from '@/utils/paperSheetVersions';
import type { ResolvedQuizAssignment } from '@/utils/questionBanks';
import {
  PAPER_TEST_PACKET_STYLES,
  paperTestPacketCopies,
  type PaperTestJob,
} from '@/utils/paperTestPrint';
import { attachPaperTestStimuli } from '@/utils/paperTestStimuli';
import { usePaperTestStimulusFiles } from '@/hooks/usePaperTestStimulusFiles';
import type {
  PrintedSupport,
  PrintedTranslation,
} from '@/utils/paperPrintedVersions';
import {
  chooseLineFor,
  sectionOfQuestion,
  sessionSectionsFor,
} from '@/utils/quizSections';

const MAX_SPARES = 20;
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

/** Why a question stays off the sheet, one line per kind. */
const EXCLUSION_FIX =
  'Return to the question editor or print without this question.';
const EXCLUSION_REASONS: Record<PaperExclusionReason, string> = {
  recording: `Cannot print recordings. ${EXCLUSION_FIX}`,
  'too-many-choices': `Cannot print questions with more than 20 answers. ${EXCLUSION_FIX}`,
  'too-few-choices': `Cannot print questions with fewer than 2 answers. ${EXCLUSION_FIX}`,
  'question-type': `Cannot print written questions. ${EXCLUSION_FIX}`,
  'bank-slot': `Cannot print question bank pulls. ${EXCLUSION_FIX}`,
};

/** What Assign on paper records once the stack is saved. */
export interface PaperAssignPicks {
  batchId: string;
  rosterIds: string[];
  periodNames: string[];
  /** Null when the teacher is in no PLC, so there was no Sharing step. */
  sharing: SharingStepValue | null;
  /** The quiz as this print just saved it, so the assignment freezes what is on the paper. */
  quiz?: QuizData;
  /** The bank pools the sheets drew from, so the assignment grades the same questions. */
  resolved?: ResolvedQuizAssignment;
}

export interface PaperAssignOptions {
  plcs: readonly Plc[];
  initialSharing: SharingStepValue;
  /** Creates the paper assignment; runs after the batch is saved and before the print. */
  onCreateAssignment: (picks: PaperAssignPicks) => Promise<void>;
}

interface PaperPrintModalProps {
  quiz: QuizData;
  /** Assign on paper: the stepper picks classes and the print makes a paper assignment. */
  assign?: PaperAssignOptions;
  /** A modification group's printed version: its students only, and its supports after the test. */
  group?: PaperPrintGroup;
  rosters: ClassRoster[];
  /** Persists the batch; the caller owns the Firestore write and its errors. */
  onSaveBatch: (batch: PaperBatch) => Promise<void>;
  /**
   * Persist the answer-sheet stimuli and written box sizes onto the quiz.
   * Called just before the print, so what is on the paper is what the quiz
   * records (D18).
   */
  onSavePrintSetup?: (setup: PaperPrintSetup) => Promise<QuizData | undefined>;
  /** The quiz is in a PLC sync group, so its sheet images need sharing (D6). */
  inPlcGroup?: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  /** The quiz's bank pulls resolved to their pools, so each sheet prints its own draw (QUIZ_IMPORT_VERSIONS.md V24). */
  resolved?: ResolvedQuizAssignment;
  /** Test seam mirroring `printPaperSheets`. */
  print?: typeof printPaperSheets;
}

/** The students a printed group's stack is for, by roster id. */
export interface PaperPrintGroup {
  label: string;
  students: Record<string, readonly string[]>;
  supports?: readonly PrintedSupport[];
  /** The group's language on the test paper; the answer sheet stays in English. */
  translation?: PrintedTranslation;
  /** Prints by page map, so a scan reads the rows of a student's own question subset. */
  servedQuestionIds?: readonly string[];
}

/** What the print dialog records on an authored quiz. */
export interface PaperPrintSetup {
  stimuli: PaperSheetStimulus[];
  /** Box sizes the teacher changed, by question id; only the quiz's own questions. */
  boxSizes: Record<string, PaperBoxSize>;
  /** Box styles the teacher changed, by question id; only the quiz's own questions. */
  boxStyles: Record<string, PaperBoxStylePick>;
}

const tooManyPagesMessage = (pageCount: number): string =>
  `This sheet needs ${pageCount} pages. The most one sheet can print is ${MAX_SHEET_PAGE}.`;

const studentSort = (a: Student, b: Student): number =>
  `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);

export const PaperPrintModal: React.FC<PaperPrintModalProps> = ({
  quiz: savedQuiz,
  assign,
  group,
  rosters,
  onSaveBatch,
  onSavePrintSetup,
  inPlcGroup = false,
  onClose,
  onError,
  resolved: resolvedBanks,
  print = printPaperSheets,
}) => {
  const { driveService } = useGoogleDrive();
  const { openPicker } = useGooglePicker();
  const { canAccessFeature } = useAuth();
  // The caller already checked the paper sheets rollout and gate; this adds the written-box flag.
  const writtenOn = canAccessFeature(PAPER_HANDWRITTEN_FEATURE);
  const previewOn = canAccessFeature(PAPER_PRINT_PREVIEW_FEATURE);
  const maxPages = canAccessFeature(PAPER_MULTI_PAGE_FEATURE)
    ? PAPER_MAX_BOX_PAGES
    : 1;
  // Handwritten box sizes are a print choice, so they are picked here rather than in the editor.
  const [boxSizes, setBoxSizes] = useState<Record<string, PaperBoxSize>>({});
  const [boxStyles, setBoxStyles] = useState<Record<string, PaperBoxStylePick>>(
    {}
  );
  const quiz = useMemo(
    () => withPaperBoxStyles(withPaperBoxSizes(savedQuiz, boxSizes), boxStyles),
    [savedQuiz, boxSizes, boxStyles]
  );
  const [pickedStudentIds] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(
      Object.entries(group?.students ?? {}).map(([id, ids]) => [
        id,
        new Set(ids),
      ])
    )
  );
  const [classes, setClasses] = useState<AssignClassesValue>(
    EMPTY_ASSIGN_CLASSES_VALUE
  );
  // Null until the teacher touches Sharing, so the default follows PLC data that loads late.
  const [sharingPick, setSharingValue] = useState<SharingStepValue | null>(
    null
  );
  const sharingValue: SharingStepValue = sharingPick ??
    assign?.initialSharing ?? { plcMode: false, plcId: '' };
  // Assign on paper: the stack (and then the assignment) already saved, so a retry only prints.
  const committedRef = useRef<{
    batch: PaperBatch;
    sheets: ReturnType<typeof planPaperBatch>['sheets'];
    assigned: boolean;
    picks: string;
  } | null>(null);
  const selectedStudentIds = useMemo(
    () =>
      assign ? paperSelectedStudentIds(classes, rosters) : pickedStudentIds,
    [assign, classes, rosters, pickedStudentIds]
  );
  // A group's stack is for named students, so it starts with no spares.
  const [spareCount, setSpareCount] = useState(group ? 0 : 2);
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

  const resolvedForPrint = useMemo(
    () =>
      resolvedBanks
        ? withPaperBoxStyles(
            withPaperBoxSizes(resolvedBanks, boxSizes),
            boxStyles
          )
        : null,
    [resolvedBanks, boxSizes, boxStyles]
  );
  // One random draw per sheet; the seed keeps each sheet's draw steady while the teacher picks.
  const [drawSeed] = useState(() => crypto.randomUUID());
  // Fixed once a stack is assigned, so a retried print matches the saved draws.
  const [lockedFormCount, setLockedFormCount] = useState<number | null>(null);
  const formCount =
    lockedFormCount ??
    Math.max(
      1,
      selectionsForPrint.reduce((n, s) => n + s.students.length, 0) + spareCount
    );
  const versionPlan = useMemo(() => {
    if (!resolvedForPrint?.sessionSlots.length) return null;
    try {
      return planPaperVersions(
        quiz,
        resolvedForPrint,
        { written: writtenOn, fib: true, groups: true },
        { count: formCount, seed: drawSeed }
      );
    } catch {
      return null;
    }
  }, [resolvedForPrint, quiz, writtenOn, formCount, drawSeed]);
  const analysis = useMemo(() => {
    if (versionPlan) return versionPlan.template;
    return promptAnalysis(
      quiz,
      analyzePaperQuiz(quiz, { written: writtenOn, fib: true, groups: true })
    );
  }, [versionPlan, quiz, writtenOn]);
  const [includeKeySheet, setIncludeKeySheet] = useState(false);
  const [includeQuestionText, setIncludeQuestionText] = useState(false);
  const [printing, setPrinting] = useState(false);
  /** Set once an authored quiz's sheets printed; the test paper comes next. */

  const questionsById = useMemo(
    () =>
      versionPlan?.questionsById ??
      new Map((quiz.questions ?? []).map((q) => [q.id, q])),
    [versionPlan, quiz.questions]
  );
  const quizStimuli = useMemo(
    () => versionPlan?.stimuli ?? quiz.stimuli ?? [],
    [versionPlan, quiz.stimuli]
  );
  // Stimuli a printed question uses, fetched now so the test paper prints them on the click.
  const testStimuli = useMemo(() => {
    const entries = versionPlan
      ? versionPlan.versions.flatMap((v) => v.analysis.entries)
      : analysis.entries;
    const used = new Set(
      entries.flatMap((e) => questionsById.get(e.questionId)?.stimulusIds ?? [])
    );
    return quizStimuli.filter((s) => used.has(s.id));
  }, [versionPlan, analysis.entries, questionsById, quizStimuli]);
  const testStimulusFiles = usePaperTestStimulusFiles(testStimuli);
  // A long written prompt and its figures print whole above its box, on the box's page.
  const promptIds = useMemo(
    () =>
      versionPlan?.promptIds ??
      promptQuestionIds(analysis, questionsById, quizStimuli),
    [versionPlan, analysis, questionsById, quizStimuli]
  );
  const promptPages = useMemo(
    () => promptPagesFor(promptIds, questionsById, quizStimuli),
    [promptIds, questionsById, quizStimuli]
  );
  // Every prompt set a sheet can print: the quiz's own, then each version's.
  const promptSets = useMemo(
    () => [
      promptPages,
      ...(versionPlan
        ? printVersionsFor(versionPlan, {}, false).map((v) => v.prompts ?? {})
        : []),
    ],
    [promptPages, versionPlan]
  );
  // Each prompt prints above its box on one page, so the box page reserves its height.
  const promptRows = useMemo(
    () => promptRowsFor(promptSets, !!versionPlan),
    [promptSets, versionPlan]
  );
  const sheetQuestions = useMemo(
    () =>
      analysis.rows.flatMap((r) => {
        const q = questionsById.get(r.questionId);
        return q ? [q] : [];
      }),
    [analysis.rows, questionsById]
  );
  // Matching, ordering and choose all record their lettered order on the batch too.
  const groupQuestions = useMemo(
    () =>
      analysis.groups.flatMap((g) => {
        const q = questionsById.get(g.questionId);
        return q ? [q] : [];
      }),
    [analysis.groups, questionsById]
  );
  const lettered = useMemo(
    () => [...sheetQuestions, ...groupQuestions],
    [sheetQuestions, groupQuestions]
  );
  /** Each sheet row's multiple choice question, or null on a grouped question's rows. */
  const rowSlots = useMemo(() => sheetRowSlots(analysis), [analysis]);

  const writtenCount = analysis.written.length;
  const questionCount = analysis.rows.length + analysis.groups.length;
  // A quiz with no bubble questions has no choices to count.
  const showChoiceCount = questionCount > 0;
  const blankAnswersOf = (a: typeof analysis): Record<string, string[]> =>
    Object.fromEntries(
      a.written.flatMap((w) => {
        const q = questionsById.get(w.questionId);
        return q?.type === 'FIB'
          ? [[w.questionId, splitBlanks(q.correctAnswer)]]
          : [];
      })
    );
  const choiceCount = analysis.sheetChoiceCount;

  const [sheetStimuli, setSheetStimuli] = useState<PaperSheetStimulus[]>(
    quiz.paperSheetStimuli ?? []
  );
  const [stimulusBusy, setStimulusBusy] = useState(false);
  // Anything in the band takes the page's right half, so the answers drop to
  // one column and the test spreads over twice as many pages (D1).
  const columnsPerPage = sheetStimuli.length > 0 ? 1 : 2;
  // Question text takes the band stimuli would print in, so the two never combine.
  const questionTextLayout = includeQuestionText && sheetStimuli.length === 0;
  const grid = questionTextLayout ? 'questions' : columnsPerPage;
  const blockMeasure = useMemo(
    (): BlockMeasure => browserBlockMeasure() ?? estimateBlockMm,
    []
  );
  const printLanguage = group?.translation?.language;
  const printWords = useMemo(
    () => paperPrintWords(printLanguage),
    [printLanguage]
  );
  // A response sheet with question text is the whole test, so it prints every stimulus too.
  const stimuliSets = useMemo((): SheetStimuliSet[] | null => {
    if (!questionTextLayout || testStimulusFiles.loading) return null;
    const setOf = (
      entries: readonly PaperSheetEntry[],
      slots: readonly PaperSheetEntry[]
    ): SheetStimuliSet => ({
      entries,
      mapIds: slots.map((e) => e.questionId),
      slots,
      plan: planSheetStimuli(
        entries.map((e) => ({ questionId: e.questionId, row: e.label })),
        questionsById,
        quizStimuli,
        testStimulusFiles.files,
        blockMeasure,
        printWords
      ),
    });
    if (versionPlan) {
      const template = versionPlan.template.entries;
      return versionPlan.versions.map((v) =>
        setOf(v.analysis.entries, template)
      );
    }
    return [setOf(analysis.entries, analysis.entries)];
  }, [
    questionTextLayout,
    testStimulusFiles.loading,
    testStimulusFiles.files,
    versionPlan,
    analysis.entries,
    questionsById,
    quizStimuli,
    blockMeasure,
    printWords,
  ]);
  const stimuliLayout = useMemo(
    () => (stimuliSets ? layoutSheetStimuli(stimuliSets, promptIds) : null),
    [stimuliSets, promptIds]
  );
  /** Written questions that print their prompt above the box, with or without a stimulus block. */
  const sheetPromptIds = useMemo(
    () => new Set([...promptIds, ...(stimuliLayout?.promptIds ?? [])]),
    [stimuliLayout, promptIds]
  );
  const sheetPromptRows = useMemo(
    () =>
      stimuliLayout && stimuliSets
        ? {
            ...promptRows,
            ...blockPromptRows(
              stimuliLayout,
              stimuliSets,
              questionsById,
              !!versionPlan
            ),
          }
        : promptRows,
    [stimuliLayout, stimuliSets, promptRows, questionsById, versionPlan]
  );
  /** The prompt each prompted box prints; on a question-text sheet its pictures move into the block. */
  const sheetPromptsFor = (
    setIndex: number,
    textOf: (mapId: string) => string | undefined
  ): Record<string, PaperPromptPage> =>
    Object.fromEntries(
      [...sheetPromptIds].flatMap((id) => {
        const text = textOf(id);
        if (text === undefined) return [];
        const block = stimuliLayout?.sets[setIndex]?.prompts[id];
        return [[id, { text, stimuli: [], ...(block ? { block } : {}) }]];
      })
    );
  /** A printed group's translation, and on a question-text sheet each question's stimuli. */
  const groupTextsWithWords = (
    texts: Record<string, PaperGroupText>
  ): Record<string, PaperGroupText> =>
    Object.fromEntries(
      Object.entries(texts).map(([id, t]) => {
        const tr = group?.translation?.questions[id];
        const stimulus = stimuliLayout?.sets[0]?.rows.get(id);
        return [
          id,
          {
            ...t,
            ...(tr?.text?.trim() ? { text: tr.text } : {}),
            options: t.options.map((o) => tr?.choices?.[o] ?? o),
            ...(t.terms
              ? { terms: t.terms.map((term) => tr?.terms?.[term] ?? term) }
              : {}),
            ...(stimulus ? { stimulus } : {}),
          },
        ];
      })
    );
  /** Stem per written question, for the header above its box. */
  const writtenTextsOf = (a: typeof analysis): Record<string, string> =>
    Object.fromEntries(
      a.written.flatMap((w) => {
        const q = questionsById.get(w.questionId);
        const text = q?.type === 'FIB' ? letteredBlanks(q.text) : q?.text;
        return text && !sheetPromptIds.has(w.questionId)
          ? [[w.questionId, text]]
          : [];
      })
    );
  // Each question-text row is sized to its own stem, so those sheets always print by page map.
  const stemLines = useMemo(() => {
    if (!questionTextLayout) return undefined;
    const measure = browserStemMeasure();
    return versionPlan
      ? versionStemLines(versionPlan, (qs) => stemLinesById(qs, measure) ?? {})
      : stemLinesById(lettered, measure);
  }, [questionTextLayout, lettered, versionPlan]);
  const planPages = useCallback(
    (entries: readonly PaperSheetEntry[]): PlanPaperPagesResult =>
      planPaperPages({
        entries,
        grid,
        stems: true,
        choiceCount,
        ...(stemLines ? { stemLines } : {}),
        ...(Object.keys(sheetPromptRows).length > 0
          ? { promptRows: sheetPromptRows }
          : {}),
        ...(stimuliLayout && Object.keys(stimuliLayout.stimulusMm).length > 0
          ? { stimulusMm: stimuliLayout.stimulusMm }
          : {}),
      }),
    [grid, choiceCount, stemLines, sheetPromptRows, stimuliLayout]
  );
  // Only a sheet with written boxes, question text or versions prints by page map; every other sheet keeps today's layout.
  const pagePlan = useMemo((): PlanPaperPagesResult | null => {
    if (
      writtenCount === 0 &&
      !questionTextLayout &&
      !versionPlan &&
      analysis.groups.length === 0 &&
      !group?.servedQuestionIds
    )
      return null;
    return planPages(analysis.entries);
  }, [
    writtenCount,
    questionTextLayout,
    versionPlan,
    group?.servedQuestionIds,
    planPages,
    analysis.entries,
    analysis.groups.length,
  ]);
  const tooManyPages = pagePlan?.ok === false;
  /** Custom image box images by question id, for every written box that prints one. */
  const boxImages = useMemo(() => {
    const entries = versionPlan
      ? versionPlan.versions.flatMap((v) => v.analysis.entries)
      : analysis.entries;
    const out = new Map<string, PaperSheetStimulus>();
    for (const e of entries) {
      if (e.kind !== 'written' || e.style !== 'image') continue;
      const image = questionsById.get(e.questionId)?.paperBoxImage;
      if (image) out.set(e.questionId, image);
    }
    return out;
  }, [versionPlan, analysis.entries, questionsById]);
  const boxImageStimuli = useMemo(() => [...boxImages.values()], [boxImages]);
  const imageStimuli = useMemo(() => {
    const prompts = promptSets.flatMap((p) =>
      Object.values(p).flatMap((x) => x.stimuli)
    );
    const seen = new Set(sheetStimuli.map((s) => s.id));
    return [
      ...sheetStimuli,
      ...[...prompts, ...boxImageStimuli].filter(
        (s) => !seen.has(s.id) && !!seen.add(s.id)
      ),
    ];
  }, [sheetStimuli, promptSets, boxImageStimuli]);
  const sheetImages = usePaperSheetStimulusImages(imageStimuli);
  const sharing = usePaperSheetImageSharing(sheetStimuli, inPlcGroup);
  /** Set once the teacher has answered the sharing ask, either way. */
  const [sharingAnswered, setSharingAnswered] = useState(false);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [askingToShare, setAskingToShare] = useState(false);
  /** A PDF waiting on the teacher to say which page goes on the sheet (D7). */
  const [pdfPageDraft, setPdfPageDraft] = useState('1');
  const [pdfPick, setPdfPick] = useState<{
    file: File;
    pages: PdfPages;
  } | null>(null);
  const sheetStimuliChanged =
    JSON.stringify(sheetStimuli) !==
    JSON.stringify(quiz.paperSheetStimuli ?? []);
  const { boxSizes: changedBoxSizes, boxStyles: changedBoxStyles } =
    changedPaperBoxSetup(savedQuiz.questions, boxSizes, boxStyles);
  const boxSizesChanged = Object.keys(changedBoxSizes).length > 0;
  const boxStylesChanged = Object.keys(changedBoxStyles).length > 0;
  /** Written boxes the teacher can size; one row per question, across versions. */
  const writtenRows = useMemo(() => {
    const plans = versionPlan
      ? versionPlan.versions.flatMap((v) => v.analysis.written)
      : analysis.written;
    const seen = new Set<string>();
    return plans.flatMap((w) => {
      const q = questionsById.get(w.questionId);
      // A blank's line count is its blank count, so it has no box controls.
      if (!q || q.type === 'FIB' || seen.has(w.questionId)) return [];
      seen.add(w.questionId);
      return [
        {
          questionId: w.questionId,
          label: versionPlan ? null : w.label,
          text: plainPromptText(q.text),
          size: w.size,
          style: paperBoxStyleOf(q),
          image: q.paperBoxImage,
        },
      ];
    });
  }, [versionPlan, analysis.written, questionsById]);
  const quizImageStimuli = useMemo(
    () => (quiz.stimuli ?? []).filter((s) => s.type === 'image'),
    [quiz.stimuli]
  );
  /** The quiz's own images, as a custom image box prints them. */
  const quizBoxImages = useMemo(
    () => paperBoxImageChoices(quiz.stimuli ?? []),
    [quiz.stimuli]
  );
  const boxImageInput = useRef<HTMLInputElement>(null);
  const [boxImageFor, setBoxImageFor] = useState<string | null>(null);
  const openBoxImageUpload = (questionId: string) => {
    setBoxImageFor(questionId);
    boxImageInput.current?.click();
  };
  const pickBoxStyle = (
    row: { questionId: string; image?: PaperSheetStimulus },
    style: PaperBoxStyle
  ) => {
    if (style !== 'image') {
      setBoxStyles((prev) => ({ ...prev, [row.questionId]: { style } }));
      return;
    }
    // An image box needs its image first; with none to offer, the upload opens and the style waits for it.
    const image = row.image ?? quizBoxImages[0];
    if (image)
      setBoxStyles((prev) => ({
        ...prev,
        [row.questionId]: { style, image },
      }));
    else openBoxImageUpload(row.questionId);
  };

  /** Put the bytes in Drive and make the stimulus that points at them. */
  const uploadToDrive = useCallback(
    async (
      blob: Blob,
      fileName: string,
      label: string,
      size: { widthPx: number; heightPx: number } | null
    ): Promise<PaperSheetStimulus | null> => {
      if (!driveService) {
        onError('Connect Google Drive to add an image to the response sheet.');
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
        onError('Connect Google Drive to add an image to the response sheet.');
        return null;
      }
      setStimulusBusy(true);
      try {
        // A PDF is not printable as it stands: the teacher picks the page and
        // it is rendered and uploaded as a PNG, so the print never sees pdf.js.
        if (pdf) {
          const pages = await openPdfPages(file);
          setPdfPageDraft('1');
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

  const uploadBoxImage = async (file: File) => {
    const questionId = boxImageFor;
    if (!questionId) return;
    if (!file.type.startsWith('image/')) {
      onError(`"${file.name}" is not an image.`);
      return;
    }
    if (file.size > MAX_SHEET_IMAGE_BYTES) {
      onError(
        `"${file.name}" is too large (max ${MAX_SHEET_IMAGE_BYTES / 1024 / 1024}MB).`
      );
      return;
    }
    try {
      const image = await uploadToDrive(
        file,
        file.name,
        file.name,
        await imagePixelSize(file)
      );
      if (image)
        setBoxStyles((prev) => ({
          ...prev,
          [questionId]: { style: 'image', image },
        }));
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Could not upload that image.'
      );
    }
  };

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

  const studentSheetCount = selectionsForPrint.reduce(
    (n, s) => n + s.students.length,
    0
  );
  // A stack in versions prints one key per version a sheet carries.
  const versionsDealt = !versionPlan
    ? 1
    : Math.min(
        versionPlan.versions.length,
        versionPlan.dealBySheet
          ? studentSheetCount + spareCount
          : Math.max(
              spareCount,
              ...selectionsForPrint.map((x) => x.students.length)
            )
      );
  const keySheetCount = includeKeySheet ? Math.max(1, versionsDealt) : 0;
  const sheetCount = studentSheetCount + spareCount + keySheetCount;
  const pagesPerSheet = pagePlan
    ? pagePlan.ok
      ? pagePlan.pageMaps.length
      : pagePlan.pageCount
    : pageCountForQuestions(questionCount, grid);
  const firstStimuli = stimuliLayout?.sets[0];
  const stimulusPagesPerSheet = firstStimuli
    ? (stimuliSets?.[0]?.plan.resourcePages.length ?? 0) +
      Object.values(firstStimuli.pagesBefore).reduce((n, p) => n + p.length, 0)
    : 0;
  const printedPages =
    sheetCount * pagesPerSheet +
    (sheetCount - keySheetCount) * stimulusPagesPerSheet;
  const stimuliLoading =
    testStimulusFiles.loading || (questionTextLayout && !stimuliLayout);
  const canPrint =
    sheetCount > 0 &&
    questionCount + writtenCount > 0 &&
    analysis.writtenRefusals.length === 0 &&
    !tooManyPages &&
    !printing &&
    !stimulusBusy &&
    !sheetImages.loading &&
    // The packet prints the stimuli, so it waits until they have loaded.
    !stimuliLoading &&
    // A click that beat the Drive lookup would skip the sharing ask entirely.
    !sharing.checking;

  const sharingStepShown =
    !!assign && isSharingStepAvailable(assign.plcs, 'work');
  const needsPlc =
    !!assign && sharingStepShown && sharingNeedsPlc(sharingValue, assign.plcs);

  /** The test paper for a batch, lettered in the order its sheets will be decoded. */
  const testPaperJobFor = (batch: PaperBatch): PaperTestJob => {
    const sections = sessionSectionsFor(quiz);
    // A sheet with written boxes numbers by quiz position and prints them in place (D11, D18).
    const byMap = !!batch.pageMaps;
    const questionsOf = (a: PaperQuizAnalysis) => {
      const printed = byMap
        ? a.entries.map((e) => ({
            questionId: e.questionId,
            row: e.label,
            written: e.kind === 'written',
            group: e.kind === 'mc' ? e.group : undefined,
          }))
        : a.rows.map((r) => ({
            questionId: r.questionId,
            row: r.row,
            written: false,
            group: undefined,
          }));
      // Paper prints only these, so the choose line counts only them.
      const printedIds = printed.map((r) => r.questionId);
      const headed = new Set<string>();
      const placed = attachPaperTestStimuli(
        printed,
        questionsById,
        quizStimuli,
        testStimulusFiles.files
      );
      const questions = printed.flatMap((r) => {
        const q = questionsById.get(r.questionId);
        if (!q) return [];
        const choices = r.written
          ? []
          : (batch.choiceOrder?.[q.id] ?? [
              q.correctAnswer,
              ...(q.incorrectAnswers ?? []),
            ]);
        // The first printed question of a section carries its heading (E15).
        const section = sectionOfQuestion(sections, q.id);
        const heading =
          section && !headed.has(section.id)
            ? {
                title: section.title,
                ...(section.directions
                  ? { directions: section.directions }
                  : {}),
                ...(chooseLineFor(section, printedIds)
                  ? {
                      chooseLine:
                        chooseLineFor(section, printedIds) ?? undefined,
                    }
                  : {}),
              }
            : undefined;
        if (section) headed.add(section.id);
        const tr = group?.translation?.questions[q.id];
        return [
          {
            row: r.row,
            text: tr?.text ?? q.text,
            choices: tr?.choices
              ? choices.map((c) => tr.choices?.[c] ?? c)
              : choices,
            ...(r.group
              ? {
                  group: r.group,
                  ...(r.group === 'match'
                    ? {
                        terms: matchingPairs(q.correctAnswer).map(
                          ([left]) => tr?.terms?.[left] ?? left
                        ),
                      }
                    : {}),
                }
              : choicePictureFields(q, choices)),
            ...(r.written ? { written: true } : {}),
            ...(heading ? { section: heading } : {}),
            ...placed.questions.get(q.id),
          },
        ];
      });
      return { questions, resources: placed.resources };
    };
    // Each version gets its own copy of the test, headed with its label (V24).
    return versionPlan
      ? {
          quizTitle: group?.translation?.title ?? quiz.title,
          ...(printLanguage ? { language: printLanguage } : {}),
          questions: [],
          versions: versionPlan.versions.map((v) => ({
            label: v.label,
            ...questionsOf(v.analysis),
          })),
          ...(group?.supports?.length ? { supports: group.supports } : {}),
        }
      : {
          quizTitle: group?.translation?.title ?? quiz.title,
          ...(printLanguage ? { language: printLanguage } : {}),
          ...questionsOf(analysis),
          ...(group?.supports?.length ? { supports: group.supports } : {}),
        };
  };

  /** What prints for a planned stack; the preview draws the same job. */
  const jobFor = (
    batch: PaperBatch,
    sheets: ReturnType<typeof planPaperBatch>['sheets'],
    quizTitle: string
  ): PaperPrintJob => {
    // With no question text, each student's packet opens with the test paper, lettered to match their sheet.
    const testCopies = !stimuliLayout
      ? paperTestPacketCopies(testPaperJobFor(batch))
      : null;
    return {
      batchId: batch.id,
      quizTitle,
      ...(printLanguage ? { language: printLanguage } : {}),
      ...(testCopies
        ? {
            testPaper: testCopies[0],
            testPaperStyles: PAPER_TEST_PACKET_STYLES,
          }
        : {}),
      questionCount: batch.questionCount,
      choiceCount: batch.choiceCount,
      ...(batch.columnsPerPage || batch.sheetLayout
        ? { columnsPerPage: paperGridOf(batch) }
        : {}),
      ...(batch.sheetLayout === 'questions'
        ? {
            questionTexts: rowSlots.map((id) => {
              const q = id ? questionsById.get(id) : undefined;
              if (!q) return { text: '', choices: [] };
              const english = batch.choiceOrder?.[q.id] ?? [];
              const tr = group?.translation?.questions[q.id];
              const stimulus = stimuliLayout?.sets[0]?.rows.get(q.id);
              return {
                text: plainPromptText(
                  tr?.text?.trim() ? tr.text : promptLabel(q)
                ),
                choices: english.map((c) => tr?.choices?.[c] ?? c),
                ...choicePictureFields(q, english),
                ...(stimulus ? { stimulus } : {}),
              };
            }),
          }
        : {}),
      ...(analysis.rows.some((r) => r.sourceLabel)
        ? {
            rowLabels: rowSlots.map((id) =>
              id
                ? analysis.rows.find((r) => r.questionId === id)?.sourceLabel
                : undefined
            ),
          }
        : {}),
      ...(analysis.groups.length > 0 && !versionPlan
        ? {
            groupTexts: groupTextsWithWords(
              groupTextsFor(analysis, questionsById, batch.choiceOrder ?? {})
            ),
          }
        : {}),
      ...(batch.pageMaps
        ? {
            pageMaps: batch.pageMaps,
            writtenTexts: writtenTextsOf(analysis),
            blankAnswers: blankAnswersOf(analysis),
            ...(boxImages.size > 0
              ? {
                  writtenImages: Object.fromEntries(
                    [...boxImages].flatMap(([id, image]) => {
                      const src = sheetImages.src[image.id];
                      return src ? [[id, src]] : [];
                    })
                  ),
                }
              : {}),
            ...(stimuliLayout
              ? {
                  ...(sheetPromptIds.size > 0
                    ? {
                        prompts: sheetPromptsFor(
                          0,
                          (id) => questionsById.get(id)?.text
                        ),
                      }
                    : {}),
                  stimulusBlocks: stimuliLayout.sets[0]?.written ?? {},
                  pagesBefore: stimuliLayout.sets[0]?.pagesBefore ?? {},
                  resourcePages: stimuliSets?.[0]?.plan.resourcePages ?? [],
                }
              : promptIds.size > 0
                ? { prompts: promptPages }
                : {}),
          }
        : {}),
      ...(versionPlan
        ? {
            versions: printVersionsFor(
              versionPlan,
              batch.choiceOrder ?? {},
              batch.sheetLayout === 'questions'
            ).map((v, k) => {
              const forSet = stimuliLayout?.sets[k];
              const set = stimuliSets?.[k];
              if (!forSet || !set)
                return testCopies?.[k] ? { ...v, testPaper: testCopies[k] } : v;
              // Each version prints its own questions' stimuli in the template's places.
              const actual = new Map(
                set.mapIds.map((id, i) => [id, set.entries[i]?.questionId])
              );
              const slots = sheetRowSlots(versionPlan.versions[k].analysis);
              return {
                ...v,
                ...(v.questionTexts
                  ? {
                      questionTexts: v.questionTexts.map((qt, r) => {
                        const stimulus = forSet.rows.get(slots[r] ?? '');
                        return stimulus ? { ...qt, stimulus } : qt;
                      }),
                    }
                  : {}),
                ...(v.groupTexts
                  ? {
                      groupTexts: Object.fromEntries(
                        Object.entries(v.groupTexts).map(([at, t]) => {
                          const stimulus = forSet.rows.get(
                            actual.get(at) ?? ''
                          );
                          return [at, stimulus ? { ...t, stimulus } : t];
                        })
                      ),
                    }
                  : {}),
                prompts: sheetPromptsFor(k, (id) => {
                  const qid = actual.get(id);
                  return qid ? questionsById.get(qid)?.text : undefined;
                }),
                stimulusBlocks: forSet.written,
                pagesBefore: forSet.pagesBefore,
                resourcePages: set.plan.resourcePages,
              };
            }),
          }
        : {}),
      ...(imageStimuli.length > sheetStimuli.length
        ? { stimulusImageSrc: sheetImages.src }
        : {}),
      ...(sheetStimuli.length > 0
        ? {
            sheetStimuli,
            stimulusImageSrc: sheetImages.src,
          }
        : {}),
      sheets,
    };
  };

  // The first student's packet (or a spare), planned like the print but never saved.
  const previewFirst = selectionsForPrint[0];
  const previewPages = useMemo((): PaperPreviewPage[] | null => {
    if (!previewOn || questionCount + writtenCount === 0) return null;
    if (pagePlan && !pagePlan.ok) return null;
    if (stimuliLoading || sheetImages.loading) return null;
    if (!previewFirst && spareCount === 0) return null;
    // A preview that cannot be drawn shows nothing rather than closing the dialog.
    try {
      const { batch, sheets } = planPaperBatch({
        batchId: 'preview',
        quizId: quiz.id,
        selections: previewFirst
          ? [
              {
                roster: previewFirst.roster,
                students: [previewFirst.students[0]],
              },
            ]
          : [],
        questionCount,
        choiceCount,
        spareCount: previewFirst ? 0 : 1,
        includeKeySheet: false,
        questions: versionPlan ? versionSheetQuestions(versionPlan) : lettered,
        ...(columnsPerPage === 1 ? { columnsPerPage: 1 as const } : {}),
        ...(questionTextLayout ? { sheetLayout: 'questions' as const } : {}),
        ...(pagePlan?.ok ? { pageMaps: pagePlan.pageMaps } : {}),
        ...(versionPlan
          ? {
              versions: versionPlan.records,
              ...(versionPlan.dealBySheet ? { dealBySheet: true } : {}),
            }
          : {}),
        createdAt: 0,
      });
      return buildPaperSheetsPreviewPages(jobFor(batch, sheets, quiz.title));
    } catch {
      return null;
    }
    // jobFor is rebuilt every render, so its inputs are listed instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    previewOn,
    questionCount,
    writtenCount,
    pagePlan,
    stimuliLoading,
    sheetImages,
    previewFirst,
    spareCount,
    quiz,
    quizStimuli,
    testStimulusFiles.files,
    choiceCount,
    versionPlan,
    sheetQuestions,
    columnsPerPage,
    questionTextLayout,
    analysis,
    stimuliLayout,
    stimuliSets,
    imageStimuli,
    boxImages,
    group,
    promptIds,
    promptPages,
    sheetPromptIds,
    questionsById,
    printLanguage,
    blockMeasure,
    sheetStimuli,
  ]);

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
      // Replanned with the real question ids; refused before anything is saved (D13).
      let pageMaps: PaperPageMap[] | undefined;
      if (pagePlan) {
        const plan = planPages(analysis.entries);
        if (!plan.ok) {
          onError(tooManyPagesMessage(plan.pageCount));
          return;
        }
        pageMaps = plan.pageMaps;
      }

      const unassigned =
        assign && !committedRef.current?.assigned ? committedRef.current : null;
      const planned = planPaperBatch({
        // A replan before the assignment exists overwrites the stack it saved, so none is left behind.
        batchId: unassigned?.batch.id ?? crypto.randomUUID(),
        quizId: quiz.id,
        selections: selectionsForPrint,
        questionCount,
        choiceCount,
        spareCount,
        includeKeySheet,
        questions: versionPlan ? versionSheetQuestions(versionPlan) : lettered,
        ...(columnsPerPage === 1 ? { columnsPerPage: 1 as const } : {}),
        ...(questionTextLayout ? { sheetLayout: 'questions' as const } : {}),
        ...(pageMaps ? { pageMaps } : {}),
        ...(versionPlan
          ? {
              versions: versionPlan.records,
              ...(versionPlan.dealBySheet ? { dealBySheet: true } : {}),
            }
          : {}),
        createdAt: now,
      });
      const picks = JSON.stringify([
        selectionsForPrint.map((x) => [
          x.roster.id,
          x.students.map((st) => st.id),
        ]),
        spareCount,
        includeKeySheet,
        sheetStimuli,
        boxSizes,
        boxStyles,
        questionTextLayout,
      ]);
      const saved = assign ? committedRef.current : null;
      // A saved stack is reused only for the same picks and setup, or once its assignment exists.
      const committed =
        saved && (saved.assigned || saved.picks === picks) ? saved : null;
      const { batch, sheets } = committed ?? planned;
      // A retry after the stack was saved reuses it rather than orphaning it.
      let savedQuiz: QuizData | undefined;
      if (!committed) {
        // Records them on the quiz so the next print and every PLC copy start from the same sheet (D18).
        // Only when they changed: an unchanged save would publish a new version
        // to the PLC and tell every peer to pull a print they did not make.
        if (
          onSavePrintSetup &&
          (sheetStimuliChanged || boxSizesChanged || boxStylesChanged)
        )
          savedQuiz = await onSavePrintSetup({
            stimuli: sheetStimuli,
            boxSizes: changedBoxSizes,
            boxStyles: changedBoxStyles,
          });
        await onSaveBatch(batch);
        if (assign)
          committedRef.current = { batch, sheets, assigned: false, picks };
      }
      if (assign && !committedRef.current?.assigned) {
        const printed = rosters.filter((r) => batch.rosterIds.includes(r.id));
        await assign.onCreateAssignment({
          batchId: batch.id,
          rosterIds: printed.map((r) => r.id),
          periodNames: printed.map((r) => r.name),
          sharing: sharingStepShown ? sharingValue : null,
          ...(savedQuiz ? { quiz: savedQuiz } : {}),
          // Only a stack that printed each sheet's draw freezes the pools it drew from.
          ...(resolvedForPrint && versionPlan
            ? { resolved: resolvedForPrint }
            : {}),
        });
        committedRef.current = { batch, sheets, assigned: true, picks };
        setLockedFormCount(formCount);
      }
      print({
        ...jobFor(batch, sheets, quiz.title),
        // Closing unmounts this modal, which revokes the object URLs the print window is reading from.
        onImagesReady: onClose,
      });
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

  if (pdfPick) {
    const picked = Number(pdfPageDraft);
    const pdfPageNumber =
      Number.isInteger(picked) &&
      picked >= 1 &&
      picked <= pdfPick.pages.pageCount
        ? picked
        : null;
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
              {...tourTypeAttr('quiz-print.pdf-page-cancel', 'quiz')}
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
            {pdfPick.pages.pageCount === 1 ? '' : 's'}.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              aria-label="Page number"
              {...tourTypeAttr('quiz-print.pdf-page-number', 'quiz')}
              min={1}
              max={pdfPick.pages.pageCount}
              value={pdfPageDraft}
              disabled={stimulusBusy}
              onChange={(e) => setPdfPageDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || pdfPageNumber === null) return;
                e.preventDefault();
                void addPdfPage(pdfPageNumber);
              }}
              className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={stimulusBusy || pdfPageNumber === null}
              {...tourTypeAttr('quiz-print.pdf-page-add', 'quiz')}
              onClick={() => {
                if (pdfPageNumber !== null) void addPdfPage(pdfPageNumber);
              }}
              className="rounded-lg bg-brand-blue-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark disabled:opacity-50"
            >
              Add page
            </button>
          </div>
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
              {...tourTypeAttr('quiz-print.share-print-only', 'quiz')}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              Print without sharing
            </button>
            <button
              type="button"
              disabled={sharingBusy}
              onClick={() => void answerSharing(true)}
              {...tourTypeAttr('quiz-print.share-and-print', 'quiz')}
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
            Anyone with the link can open them, so teammates can print your
            test.
          </p>
        </div>
      </Modal>
    );
  }

  const groupStudentNames = group
    ? selectionsForPrint.flatMap(({ students }) =>
        students.map((st) =>
          [st.lastName, st.firstName].filter(Boolean).join(', ')
        )
      )
    : [];

  const footerMessage = tooManyPages
    ? tooManyPagesMessage(pagesPerSheet)
    : sheetCount === 0
      ? 'Pick at least one student or spare sheet.'
      : stimuliLoading
        ? 'Loading stimuli.'
        : null;

  const exclusionReasons = [
    ...new Set(analysis.exclusions.map((ex) => EXCLUSION_REASONS[ex.reason])),
  ];

  const setupBody = (
    <div className={assign ? 'space-y-4' : 'space-y-4 px-5 pb-5 pt-4'}>
      {analysis.exclusions.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-amber-900">
                {analysis.exclusions.length} question
                {analysis.exclusions.length === 1 ? '' : 's'} will not be on the
                sheet
              </p>
              {exclusionReasons.map((line) => (
                <p key={line} className="mt-1 text-xs text-amber-800">
                  {line}
                </p>
              ))}
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

      {analysis.writtenRefusals.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brand-red-primary" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-red-900">
                Written questions can&apos;t be in a choose section on paper
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-red-800">
                {analysis.writtenRefusals.map((ex, i) => (
                  <li key={i} className="truncate">
                    • {ex.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div
        className={`grid gap-3 ${showChoiceCount ? 'grid-cols-2' : 'grid-cols-1'}`}
      >
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Questions
          </span>
          <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {questionCount + writtenCount} from this quiz
          </p>
        </label>

        {showChoiceCount && (
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Choices per question
            </span>
            <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {choiceCount} (A–{'ABCDE'[choiceCount - 1]})
            </p>
          </label>
        )}
      </div>

      {writtenOn && writtenRows.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Written answers
          </p>
          <ul className="mt-1 divide-y divide-slate-100">
            {writtenRows.map((row) => (
              <WrittenBoxRow
                key={row.questionId}
                label={row.label}
                text={row.text || 'Untitled question'}
              >
                <BoxSizeSelect
                  maxPages={maxPages}
                  size={row.size}
                  onChange={(size) =>
                    setBoxSizes((prev) => ({
                      ...prev,
                      [row.questionId]: size,
                    }))
                  }
                  ariaLabel={`${row.label ? `Question ${row.label}` : row.text} box size`}
                  anchor={row.label ?? row.questionId}
                />
                <BoxStyleSelect
                  style={row.style}
                  onChange={(style) => pickBoxStyle(row, style)}
                  ariaLabel={`${row.label ? `Question ${row.label}` : row.text} answer style`}
                  anchor={row.label ?? row.questionId}
                />
                {row.style === 'image' && (
                  <BoxImageSelect
                    image={row.image}
                    quizImages={quizBoxImages}
                    onPick={(image) =>
                      setBoxStyles((prev) => ({
                        ...prev,
                        [row.questionId]: { style: 'image', image },
                      }))
                    }
                    onUpload={() => openBoxImageUpload(row.questionId)}
                    ariaLabel={`${row.label ? `Question ${row.label}` : row.text} image`}
                    anchor={row.label ?? row.questionId}
                  />
                )}
              </WrittenBoxRow>
            ))}
          </ul>
          {/* no-tour-anchor: hidden file input, opened from the image menu */}
          <input
            ref={boxImageInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void uploadBoxImage(file);
            }}
          />
        </div>
      )}

      {analysis.shortRows.length > 0 && (
        <p className="text-xs text-slate-500">
          Question{analysis.shortRows.length === 1 ? ' ' : 's '}
          {analysis.shortRows.join(', ')}{' '}
          {analysis.shortRows.length === 1 ? 'has' : 'have'} fewer than{' '}
          {choiceCount} choices, so students leave the extra bubbles blank.
        </p>
      )}

      {group && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Who gets a sheet
          </p>
          <p className="mt-1 text-sm text-slate-700">
            {groupStudentNames.join('; ')}
          </p>
        </div>
      )}

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
          {...tourTypeAttr('quiz-print.spare-count', 'quiz')}
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

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-700">Include question text</p>
          {sheetStimuli.length > 0 && (
            <p className="text-xs text-slate-500">
              Not available while the sheet has images or templates on it.
            </p>
          )}
        </div>
        <Toggle
          checked={questionTextLayout}
          onChange={setIncludeQuestionText}
          disabled={sheetStimuli.length > 0}
          label="Include question text"
          anchor={tourTypeAttr('quiz-print.include-question-text', 'quiz')}
          size="sm"
        />
      </div>

      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-700">Include an answer key sheet</p>
        <Toggle
          checked={includeKeySheet}
          onChange={setIncludeKeySheet}
          label="Include an answer key sheet"
          anchor={tourTypeAttr('quiz-print.include-key-sheet', 'quiz')}
          size="sm"
        />
      </div>
    </div>
  );

  const previewEmptyText = tooManyPages
    ? tooManyPagesMessage(pagesPerSheet)
    : stimuliLoading || sheetImages.loading
      ? 'Loading the pages.'
      : sheetCount === 0
        ? 'Pick at least one student or spare sheet.'
        : 'Add a question to see the pages.';
  const previewPane = (
    <>
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Preview
        </p>
        <p className="min-w-0 truncate text-xs text-slate-500">
          {previewFirst
            ? [
                previewFirst.students[0].lastName,
                previewFirst.students[0].firstName,
              ]
                .filter(Boolean)
                .join(', ')
            : 'Spare sheet'}
        </p>
      </div>
      <PaperPrintPreview
        pages={previewPages}
        loading={stimuliLoading || sheetImages.loading}
        emptyText={previewEmptyText}
        className="mt-1 flex-1"
      />
    </>
  );

  if (assign) {
    const steps: AssignStepDef[] = [
      {
        id: 'classes',
        title: getAssignStepTitle('classes', 'quiz', { kind: 'work' }),
        value: formatClassesValue(classes, rosters),
        body: (
          <div className="space-y-3">
            <ClassChecklist
              rosters={rosters}
              value={classes}
              onChange={setClasses}
            />
            <StudentPickMenu
              rosters={rosters.filter((r) => !r.loadError)}
              value={classes}
              onChange={setClasses}
              refFor={paperStudentRef}
            />
          </div>
        ),
      },
      {
        id: 'sheets',
        title: getAssignStepTitle('sheets', 'quiz', { kind: 'work' }),
        value: `${sheetCount} sheet${sheetCount === 1 ? '' : 's'}`,
        body: setupBody,
      },
      ...(sharingStepShown
        ? [
            {
              id: 'sharing' as const,
              title: getAssignStepTitle('sharing', 'quiz', { kind: 'work' }),
              value: needsPlc
                ? PICK_A_PLC
                : formatSharingValue(sharingValue, { plcs: assign.plcs }),
              body: (
                <SharingStep
                  value={sharingValue}
                  onChange={setSharingValue}
                  plcs={assign.plcs}
                />
              ),
            },
          ]
        : []),
    ];
    return (
      <AssignStepper
        isOpen
        onClose={onClose}
        title={quiz.title || 'Untitled paper test'}
        steps={steps}
        submitLabel="Assign and print"
        submitIcon={Printer}
        {...(previewOn ? { aside: previewPane } : {})}
        onSubmit={handlePrintClick}
        submitting={printing}
        disabled={!canPrint || needsPlc}
        disabledReason={needsPlc ? PICK_A_PLC : (footerMessage ?? undefined)}
      />
    );
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel="Print response sheets"
      maxWidth={previewOn ? 'max-w-6xl' : 'max-w-2xl'}
      {...(previewOn
        ? {
            className:
              'h-[min(90dvh,52rem)] bg-white rounded-2xl shadow-2xl overflow-hidden',
          }
        : {})}
      contentClassName=""
      customHeader={
        <div className="flex items-start justify-between gap-3 px-5 py-3.5 bg-emerald-700 text-white rounded-t-2xl">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Print response sheets
              </h2>
              <p className="mt-0.5 max-w-[24rem] truncate text-xs text-white/80">
                {[quiz.title || 'Untitled paper test', group?.label]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            {...tourTypeAttr('quiz-print.close', 'quiz')}
            className="shrink-0 rounded-lg p-1 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <p
            className={`text-xs ${tooManyPages ? 'text-brand-red-primary' : 'text-slate-600'}`}
          >
            {tooManyPages
              ? tooManyPagesMessage(pagesPerSheet)
              : sheetCount === 0
                ? 'Pick at least one student or spare sheet.'
                : `${sheetCount} sheet${sheetCount === 1 ? '' : 's'} · ${
                    printedPages
                  } page${printedPages === 1 ? '' : 's'}${
                    versionsDealt > 1 ? ` · ${versionsDealt} versions` : ''
                  }`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              {...tourTypeAttr('quiz-print.cancel', 'quiz')}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePrintClick}
              {...tourTypeAttr('quiz-print.print', 'quiz')}
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
      {previewOn ? (
        <div className="flex h-full min-h-0 flex-col overflow-hidden md:flex-row">
          <div className="min-h-0 flex-1 overflow-y-auto md:w-2xl md:flex-none">
            {setupBody}
          </div>
          <div className="flex h-[40%] min-h-0 flex-col border-t border-slate-200 bg-slate-100 md:h-auto md:flex-1 md:border-l md:border-t-0">
            {previewPane}
          </div>
        </div>
      ) : (
        setupBody
      )}
    </Modal>
  );
};
