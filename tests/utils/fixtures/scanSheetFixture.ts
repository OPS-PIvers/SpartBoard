import type {
  PaperBatch,
  PaperGrid,
  PaperMarkupItem,
  PaperPageMap,
  QuizData,
  QuizQuestion,
  QuizResponse,
  ResponseArtifact,
} from '@/types';
import { planPaperPages, type PaperSheetEntry } from '@/utils/paperPageMap';
import { planSheetReprint } from '@/utils/paperSheetReprint';
import { computeStudentDrilldown } from '@/utils/quizStudentDrilldown';
import type {
  ResultsPrintJob,
  ResultsPrintStudent,
} from '@/utils/quizStudentReportPrint';

/** Stands in for a kept page's object URL. */
export const PAGE_SRC = 'blob:https://spartboard.test/kept-page';

const mc = (id: string, n: number): QuizQuestion => ({
  id,
  type: 'MC',
  text: `Question ${n}?`,
  correctAnswer: `Right ${n}`,
  incorrectAnswers: [`Wrong ${n}a`, `Wrong ${n}b`, `Wrong ${n}c`],
  timeLimit: 0,
  points: 1,
});

const written = (id: string, text: string): QuizQuestion => ({
  id,
  type: 'free-response',
  text,
  correctAnswer: '',
  incorrectAnswers: [],
  timeLimit: 0,
  points: 4,
});

const MC_IDS = Array.from({ length: 10 }, (_, i) => `q${i + 1}`);

export const SCAN_QUESTIONS: QuizQuestion[] = [
  ...MC_IDS.slice(0, 6).map((id, i) => mc(id, i + 1)),
  written('w1', 'Explain why plants need light.'),
  ...MC_IDS.slice(6).map((id, i) => mc(id, i + 7)),
  written('w2', 'Describe the water cycle in your own words.'),
];

export const SCAN_QUIZ: QuizData = {
  id: 'quiz-scan',
  title: 'Science Check',
  createdAt: 1,
  updatedAt: 1,
  questions: SCAN_QUESTIONS,
};

/** Bubble order printed on the sheet: the right answer is B, C, A, D in turn. */
export const CHOICE_ORDER: Record<string, string[]> = Object.fromEntries(
  MC_IDS.map((id, i) => {
    const n = i + 1;
    const wrong = [`Wrong ${n}a`, `Wrong ${n}b`, `Wrong ${n}c`];
    const at = [1, 2, 0, 3][i % 4];
    const order = [...wrong];
    order.splice(at, 0, `Right ${n}`);
    return [id, order];
  })
);

/** The bubble each student row filled; null is a blank row. */
export const FILLED: (number | null)[] = [1, 0, 0, 3, null, 2, 0, 2, 1, 2];

function entries(): PaperSheetEntry[] {
  return SCAN_QUESTIONS.map((q, i) =>
    q.type === 'MC'
      ? { kind: 'mc', questionId: q.id, label: String(i + 1) }
      : {
          kind: 'written',
          questionId: q.id,
          label: String(i + 1),
          size: q.id === 'w1' ? 'M' : 'full',
        }
  );
}

export interface ScanFixtureOptions {
  grid?: PaperGrid;
  /** An older batch's item-free page printing w2's prompt before its box. */
  promptPage?: boolean;
  /** Printed page numbers the response kept. */
  keptPages?: readonly number[];
  /** Scan id on the written answers; the pages are always scan-A. */
  answerScanId?: string;
  markup?: Record<string, PaperMarkupItem[]>;
  imageMarkup?: boolean;
  overallComment?: string;
  responseKey?: string;
  w1Points?: number;
  period?: string;
}

export function scanPageMaps(opts: ScanFixtureOptions = {}): PaperPageMap[] {
  const plan = planPaperPages({
    entries: entries(),
    grid: opts.grid ?? 2,
    stems: true,
    choiceCount: 4,
  });
  if (!plan.ok) throw new Error('plan refused');
  if (!opts.promptPage) return plan.pageMaps;
  const at = plan.pageMaps.findIndex((m) =>
    m.items.some((i) => i.kind === 'written' && i.questionId === 'w2')
  );
  const maps: PaperPageMap[] = [
    ...plan.pageMaps.slice(0, at),
    { page: 0, grid: plan.pageMaps[at].grid, items: [], prompt: 'w2' },
    ...plan.pageMaps.slice(at),
  ];
  return maps.map((m, i) => ({ ...m, page: i + 1 }));
}

export function scanBatch(opts: ScanFixtureOptions = {}): PaperBatch {
  const pageMaps = scanPageMaps(opts);
  return {
    id: 'batch-scan',
    quizId: SCAN_QUIZ.id,
    rosterIds: [],
    questionCount: MC_IDS.length,
    choiceCount: 4,
    seats: {},
    spareSeats: [],
    pagesPerSheet: pageMaps.length,
    createdAt: 1,
    layoutVersion: 2,
    pageMaps,
    choiceOrder: CHOICE_ORDER,
    ...(opts.grid === 'questions'
      ? { sheetLayout: 'questions' as const }
      : { columnsPerPage: opts.grid === 1 ? 1 : 2 }),
  };
}

export const keptPageArtifactFor = (scanId: string, page: number) =>
  ({
    id: `pg_${scanId}_${page}`,
    slot: 'primary',
    kind: 'paper-page',
    storagePath: `paper_pages/t/${scanId}/7/${page}.webp`,
    mimeType: 'image/webp',
    uploadState: 'uploaded',
  }) satisfies ResponseArtifact;

export function scanResponse(opts: ScanFixtureOptions = {}): QuizResponse {
  const scanId = opts.answerScanId ?? 'scan-A';
  const done = (answer: string) => ({
    answer,
    paperTranscript: 'done' as const,
    paperScanId: scanId,
    artifacts: [
      {
        id: `crop-${answer.length}`,
        slot: 'primary',
        kind: 'handwriting',
        storagePath: 'x',
        uploadState: 'uploaded',
      },
    ],
  });
  return {
    studentUid: opts.responseKey ?? 'u',
    _responseKey: opts.responseKey ?? 'paper-1',
    status: 'completed',
    submittedAt: Date.UTC(2026, 10, 2, 15),
    classPeriod: opts.period ?? 'Period 2',
    paperBatchId: 'batch-scan',
    paperSeat: 7,
    answers: [
      // A blank row imports as no answer at all.
      ...MC_IDS.flatMap((id, i) =>
        FILLED[i] === null
          ? []
          : [
              {
                questionId: id,
                answer: CHOICE_ORDER[id][FILLED[i]],
                answeredAt: 1,
              },
            ]
      ),
      {
        questionId: 'w1',
        answeredAt: 1,
        ...done('<p>Plants use light to make food.</p>'),
      },
      {
        questionId: 'w2',
        answeredAt: 1,
        ...done('<p>Water evaporates and rains.</p>'),
      },
    ],
    grading: {
      w1: {
        pointsAwarded: opts.w1Points ?? 3,
        gradedAt: 1,
        gradedBy: 't',
        overallComment:
          opts.overallComment ?? 'Good start. Say where the energy goes.',
        ...(opts.markup?.w1
          ? {
              imageMarkup: { scanId: 'scan-A', page: 1, items: opts.markup.w1 },
            }
          : {}),
      },
      w2: {
        pointsAwarded: 2,
        gradedAt: 1,
        gradedBy: 't',
        overallComment: 'Name each step.',
        ...(opts.markup?.w2
          ? {
              imageMarkup: { scanId: 'scan-A', page: 2, items: opts.markup.w2 },
            }
          : {}),
      },
    },
    paperPages: (opts.keptPages ?? []).map((p) =>
      keptPageArtifactFor('scan-A', p)
    ),
  } as unknown as QuizResponse;
}

/** The written box of a question on the fixture's sheet. */
export function scanBoxOf(questionId: string, opts: ScanFixtureOptions = {}) {
  for (const map of scanPageMaps(opts)) {
    for (const item of map.items) {
      if (item.kind === 'written' && item.questionId === questionId) {
        return item.boxMm;
      }
    }
  }
  throw new Error(`no box for ${questionId}`);
}

/** Markup on w1: a highlight with a comment, a circle, a pin and a stamp. */
export function scanMarkup(opts: ScanFixtureOptions = {}): PaperMarkupItem[] {
  const b = scanBoxOf('w1', opts);
  return [
    {
      id: 'h1',
      kind: 'highlight',
      rectMm: { x: b.x + 4, y: b.y + 2, w: 70, h: 6 },
      comment: 'Strong claim.',
    },
    {
      id: 'e1',
      kind: 'ellipse',
      rectMm: { x: b.x + 76, y: b.y + 9, w: 30, h: 8 },
    },
    {
      id: 'p1',
      kind: 'pin',
      atMm: { x: b.x + 110, y: b.y + 12 },
      comment: 'Which gas do plants take in?',
    },
    {
      id: 's1',
      kind: 'stamp',
      atMm: { x: b.x + 128, y: b.y + 4 },
      symbol: 'check',
    },
  ];
}

/** One paper student whose sheet can print on kept pages, plus one online student. */
export function scanJob(
  opts: ScanFixtureOptions = {},
  keptPages?: Record<number, string | null>
): ResultsPrintJob {
  const response = scanResponse(opts);
  const batch = scanBatch(opts);
  const reprint = planSheetReprint(response, batch, SCAN_QUIZ);
  if (!reprint) throw new Error('expected a reprint plan');
  const paper: ResultsPrintStudent = {
    key: 'paper-1',
    name: 'Maya Okafor',
    sortName: 'Okafor Maya',
    period: 'Period 2',
    status: 'completed',
    drilldown: computeStudentDrilldown(SCAN_QUESTIONS, response, undefined, {
      choiceOrder: CHOICE_ORDER,
      recordedChoices: CHOICE_ORDER,
    }),
    targets: [],
    lettered: true,
    sheet: reprint,
    paperWritten: {
      w1: { answer: answerOf(response, 'w1'), cropSrc: CROP_SRC },
      w2: { answer: answerOf(response, 'w2'), cropSrc: CROP_SRC },
    },
    ...(keptPages ? { keptPages } : {}),
  };
  return {
    quizTitle: SCAN_QUIZ.title,
    stimuli: [],
    periodOrder: ['Period 2'],
    students: [paper],
    writtenMode: 'handwriting',
    ...(opts.imageMarkup ? { imageMarkup: true } : {}),
  };
}

const CROP_SRC = 'data:image/png;base64,AAAA';

function answerOf(response: QuizResponse, questionId: string) {
  const a = response.answers.find((x) => x.questionId === questionId);
  if (!a) throw new Error(`no answer for ${questionId}`);
  return a;
}

/** A bubble-only quiz on an older two-column stack: no page map, rows by arithmetic. */
export const BUBBLE_QUIZ: QuizData = {
  id: 'quiz-bubble',
  title: 'Unit 4 Vocabulary',
  createdAt: 1,
  updatedAt: 1,
  questions: Array.from({ length: 20 }, (_, i) => mc(`b${i + 1}`, i + 1)),
};

export const BUBBLE_ORDER: Record<string, string[]> = Object.fromEntries(
  BUBBLE_QUIZ.questions.map((q, i) => {
    const order = [...q.incorrectAnswers];
    order.splice([1, 2, 0, 3][i % 4], 0, q.correctAnswer);
    return [q.id, order];
  })
);

/** The bubble each row of the bubble-only sheet filled. */
export const BUBBLE_FILLED: (number | null)[] = [
  1,
  2,
  0,
  3,
  1,
  2,
  2,
  3,
  1,
  2,
  0,
  3,
  null,
  2,
  0,
  1,
  1,
  2,
  0,
  3,
];

export function bubbleBatch(): PaperBatch {
  return {
    id: 'batch-bubble',
    quizId: BUBBLE_QUIZ.id,
    rosterIds: [],
    questionCount: 20,
    choiceCount: 4,
    seats: {},
    spareSeats: [],
    pagesPerSheet: 1,
    createdAt: 1,
    choiceOrder: BUBBLE_ORDER,
    columnsPerPage: 2,
  };
}

export function bubbleResponse(
  opts: Pick<ScanFixtureOptions, 'keptPages' | 'responseKey' | 'period'> = {}
): QuizResponse {
  return {
    studentUid: opts.responseKey ?? 'b',
    _responseKey: opts.responseKey ?? 'bubble-1',
    status: 'completed',
    submittedAt: Date.UTC(2026, 10, 2, 15),
    classPeriod: opts.period ?? 'Period 2',
    paperBatchId: 'batch-bubble',
    paperSeat: 3,
    answers: BUBBLE_QUIZ.questions.flatMap((q, i) =>
      BUBBLE_FILLED[i] === null
        ? []
        : [
            {
              questionId: q.id,
              answer: BUBBLE_ORDER[q.id][BUBBLE_FILLED[i]],
              answeredAt: 1,
            },
          ]
    ),
    paperPages: (opts.keptPages ?? []).map((p) =>
      keptPageArtifactFor('scan-B', p)
    ),
  } as unknown as QuizResponse;
}
