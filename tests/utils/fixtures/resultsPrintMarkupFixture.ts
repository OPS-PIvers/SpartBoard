import type {
  PaperBatch,
  PaperMarkupItem,
  QuizData,
  QuizQuestion,
  QuizResponse,
} from '@/types';
import { planPaperPages } from '@/utils/paperPageMap';
import { planSheetReprint } from '@/utils/paperSheetReprint';
import { computeStudentDrilldown } from '@/utils/quizStudentDrilldown';
import type {
  ResultsPrintJob,
  ResultsPrintStudent,
} from '@/utils/quizStudentReportPrint';

export const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const mc = (id: string, correct: string, wrong: string[]): QuizQuestion => ({
  id,
  type: 'MC',
  text: `Which one is ${id}?`,
  correctAnswer: correct,
  incorrectAnswers: wrong,
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

export const QUESTIONS: QuizQuestion[] = [
  mc('q1', 'Paris', ['Rome', 'Oslo', 'Bern']),
  written('w1', 'Explain why plants need light.'),
  mc('q2', 'Blue', ['Red', 'Green', 'Pink']),
  written('w2', 'Describe the water cycle.'),
];

export const QUIZ: QuizData = {
  id: 'quiz',
  title: 'Science Check',
  createdAt: 1,
  updatedAt: 1,
  questions: QUESTIONS,
};

const plan = planPaperPages({
  entries: [
    { kind: 'mc', questionId: 'q1', label: '1' },
    { kind: 'written', questionId: 'w1', label: '2', size: 'M' },
    { kind: 'mc', questionId: 'q2', label: '3' },
    { kind: 'written', questionId: 'w2', label: '4', size: 'S' },
  ],
  grid: 2,
  stems: true,
});
if (!plan.ok) throw new Error('plan refused');
export const PAGE_MAPS = plan.pageMaps;

export const BATCH: PaperBatch = {
  id: 'batch-1',
  quizId: 'quiz',
  rosterIds: [],
  questionCount: 2,
  choiceCount: 4,
  seats: {},
  spareSeats: [],
  pagesPerSheet: plan.pageMaps.length,
  createdAt: 1,
  layoutVersion: 2,
  pageMaps: plan.pageMaps,
  choiceOrder: {
    q1: ['Rome', 'Paris', 'Oslo', 'Bern'],
    q2: ['Red', 'Blue', 'Green', 'Pink'],
  },
};

export const CROP = {
  id: 'art-1',
  kind: 'handwriting',
  storagePath: 'x',
  mimeType: 'image/webp',
};

/** The written box of a question on the fixture's sheet. */
export function boxOf(questionId: string) {
  for (const map of PAGE_MAPS) {
    for (const item of map.items) {
      if (item.kind === 'written' && item.questionId === questionId) {
        return item.boxMm;
      }
    }
  }
  throw new Error(`no box for ${questionId}`);
}

/** A few marks inside the first written box. */
export function markupFor(): PaperMarkupItem[] {
  const b = boxOf('w1');
  return [
    {
      id: 'h1',
      kind: 'highlight',
      rectMm: { x: b.x + 6, y: b.y + 8, w: 60, h: 5 },
      comment: 'Key claim',
    },
    {
      id: 'r1',
      kind: 'rect',
      rectMm: { x: b.x + 10, y: b.y + 18, w: 40, h: 12 },
    },
    {
      id: 'p1',
      kind: 'pin',
      atMm: { x: b.x + 90, y: b.y + 20 },
      comment: 'Cite the text.',
    },
    {
      id: 's1',
      kind: 'stamp',
      atMm: { x: b.x + 120, y: b.y + 12 },
      symbol: 'star',
    },
  ];
}

export interface FixtureOptions {
  /** Markup items by written question id. */
  markup?: Record<string, PaperMarkupItem[]>;
  imageMarkup?: boolean;
  overallComment?: string;
  /** A text highlight on the first answer's transcript, as the grader makes. */
  annotate?: boolean;
}

/** One paper student with two handwritten answers on a v2 sheet, plus one online student. */
export function fixtureJob(opts: FixtureOptions = {}): ResultsPrintJob {
  const done = {
    answer: '<p>Plants need light to make food</p>',
    paperTranscript: 'done' as const,
  };
  const response = {
    studentUid: 'u',
    status: 'completed',
    submittedAt: Date.UTC(2026, 8, 23, 15),
    paperBatchId: 'batch-1',
    paperSeat: 7,
    answers: [
      { questionId: 'q1', answer: 'Rome', answeredAt: 1 },
      { questionId: 'w1', answer: done.answer, answeredAt: 1, ...done },
      { questionId: 'q2', answer: 'Blue', answeredAt: 1 },
      { questionId: 'w2', answer: '', answeredAt: 1, paperTranscript: 'blank' },
    ],
    grading: {
      w1: {
        pointsAwarded: 3,
        gradedAt: 1,
        gradedBy: 't',
        overallComment: opts.overallComment ?? 'Overall note for w1',
        ...(opts.markup?.w1
          ? {
              imageMarkup: { scanId: 'scan-1', page: 1, items: opts.markup.w1 },
            }
          : {}),
        ...(opts.annotate
          ? {
              gradingSnapshot: done.answer,
              annotations: [
                {
                  id: 'a',
                  from: 1,
                  to: 7,
                  comment: 'Which plants?',
                  authorUid: 't',
                  createdAt: 1,
                },
              ],
            }
          : {}),
      },
      w2: {
        pointsAwarded: 2,
        gradedAt: 1,
        gradedBy: 't',
        overallComment: 'Overall note for w2',
        ...(opts.markup?.w2
          ? {
              imageMarkup: { scanId: 'scan-1', page: 1, items: opts.markup.w2 },
            }
          : {}),
      },
    },
  } as unknown as QuizResponse;
  const reprint = planSheetReprint(response, BATCH, QUIZ);
  if (!reprint) throw new Error('expected a reprint plan');
  const paper: ResultsPrintStudent = {
    key: 'paper-1',
    name: 'Ada Lovelace-Montgomery',
    sortName: 'Lovelace-Montgomery Ada',
    period: 'Period 1',
    status: 'completed',
    drilldown: computeStudentDrilldown(QUESTIONS, response, undefined, {
      choiceOrder: BATCH.choiceOrder,
      recordedChoices: BATCH.choiceOrder,
    }),
    targets: [],
    lettered: true,
    sheet: reprint,
    paperWritten: {
      w1: {
        answer: { ...done, artifacts: [CROP] } as never,
        cropSrc: TINY_PNG,
      },
      w2: {
        answer: {
          answer: '',
          paperTranscript: 'blank',
          artifacts: [CROP],
        } as never,
        cropSrc: TINY_PNG,
      },
    },
  };
  const onlineResponse = {
    studentUid: 'o',
    status: 'completed',
    submittedAt: Date.UTC(2026, 8, 23, 15),
    answers: [
      { questionId: 'q1', answer: 'Paris', answeredAt: 1 },
      { questionId: 'q2', answer: 'Red', answeredAt: 1 },
    ],
  } as unknown as QuizResponse;
  const online: ResultsPrintStudent = {
    key: 'online-1',
    name: 'Grace Hopper',
    sortName: 'Hopper Grace',
    pin: '2222',
    period: 'Period 1',
    status: 'completed',
    drilldown: computeStudentDrilldown(QUESTIONS, onlineResponse, undefined),
    targets: [],
    lettered: false,
  };
  return {
    quizTitle: 'Science Check',
    stimuli: [],
    periodOrder: ['Period 1'],
    students: [paper, online],
    writtenMode: 'both',
    ...(opts.imageMarkup ? { imageMarkup: true } : {}),
  };
}
