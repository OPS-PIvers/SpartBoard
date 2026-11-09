// DEV-only: the real Quiz grader on handwritten paper answers with image markup, at /paper-markup-dev.

import React, { useCallback, useMemo, useState } from 'react';
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/context/DashboardContextValue';
import { DialogProvider } from '@/context/DialogContext';
import { DialogContainer } from '@/components/common/DialogContainer';
import { AuthProvider } from '@/context/AuthContext';
import { FreeResponseGrader } from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
import {
  paperPrivateKey,
  type PaperCropResolver,
} from '@/utils/paperCropFetch';
import type {
  PaperBatch,
  PaperMarkupItem,
  PaperPrivateAnswer,
  QuizData,
  QuizResponse,
  WrittenAnswerGrade,
} from '@/types';

const noop = (): void => undefined;
const BOX = { x: 38, y: 70, w: 140, h: 64 };
const MARGIN_MM = 2;
const DPI = 150;
const MM = DPI / 25.4;

const QUIZ: QuizData = {
  id: 'quiz-water',
  title: 'Water cycle check',
  createdAt: 0,
  updatedAt: 0,
  questions: [
    {
      id: 'mc1',
      type: 'MC',
      text: 'Which process turns liquid water into vapor?',
      timeLimit: 0,
      correctAnswer: 'Evaporation',
      incorrectAnswers: ['Condensation', 'Runoff'],
    },
    {
      id: 'q2',
      type: 'free-response',
      text: 'Explain how water moves from the ocean to a mountain lake. Use at least two vocabulary words.',
      timeLimit: 0,
      correctAnswer: '',
      incorrectAnswers: [],
      points: 4,
    },
  ],
};

const BATCH = {
  id: 'batch-water',
  quizId: QUIZ.id,
  rosterIds: [],
  questionCount: 2,
  choiceCount: 3,
  seats: {},
  spareSeats: [],
  pagesPerSheet: 1,
  layoutVersion: 2,
  createdAt: 0,
  pageMaps: [
    {
      page: 1,
      grid: 1,
      items: [
        {
          kind: 'written',
          questionId: 'q2',
          label: '2',
          headerMm: { x: 38, y: 62, w: 140, h: 7 },
          boxMm: BOX,
          lines: 7,
        },
      ],
    },
  ],
} as PaperBatch;

const TEXT: Record<string, string[]> = {
  ada: [
    'The sun heats the ocean and the water',
    'evaporates into water vapor. The vapor rises',
    'and cools so it condenses into clouds. Wind',
    'pushes the clouds over the mountains where',
    'it gets colder and the water falls as',
    'precipitation, like rain or snow. Then it',
    'runs downhill and colects in the lake.',
  ],
  grace: [
    'Water evaporates off the ocean when the',
    'sun warms it up. it turns into a gas and',
    'goes up into the sky and makes clouds',
    '(condensation). The clouds move inland and',
    'when they get heavy it rains on the',
    'mountain. The rain flows into streams and',
    'the streams fill up the lake.',
  ],
  mika: [
    'First the ocean water gets hot from the sun',
    'and it evaporates. Then it condenses in the',
    'clouds because up high is cold. The clouds',
    'blow to the mountain and it snows. In spring',
    'the snow melts and that is runoff that goes',
    'into the lake. Some water also soaks in the',
    'ground and comes out as a spring.',
  ],
  theo: [
    'evaporation - the sun makes the water go up',
    'condensation - it makes clouds',
    'precipitation - rain falls on the mountain',
    'collection - the water goes in the lake',
    'I think the wind moves the clouds but',
    'Im not sure how far they can go before',
    'they rain.',
  ],
  olive: [
    'The ocean water evaporates when the sun',
    'heats it. The vapor rises and cools into',
    'clouds. Wind blows the clouds to the',
    'mountains and it rains or snows there.',
    'The water runs down the mountain into',
    'streams that end in the lake. That is',
    'the water cycle.',
  ],
  priya: [
    'Heat from the sun causes ocean water to',
    'evaporate. The water vapor rises, cools and',
    'condenses into tiny droplets that form clouds.',
    'Prevailing winds carry the clouds toward the',
    'mountains, where the air is pushed up and',
    'cools more, so it precipitates. Runoff and',
    'groundwater then flow into the lake.',
  ],
};

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** A grayscale 150 dpi crop of the answer box with pencil handwriting, like the reader cuts. */
async function drawCrop(lines: string[], seed: number): Promise<string> {
  await document.fonts.load('40px "Patrick Hand"').catch(() => []);
  const w = Math.round((BOX.w + MARGIN_MM * 2) * MM);
  const h = Math.round((BOX.h + MARGIN_MM * 2) * MM);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const rand = seeded(seed);
  ctx.fillStyle = '#efefec';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 2500; i++) {
    const g = 225 + Math.floor(rand() * 25);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(rand() * w, rand() * h, 1.2, 1.2);
  }
  const m = MARGIN_MM * MM;
  ctx.strokeStyle = '#7a7a7a';
  ctx.lineWidth = 0.3 * MM;
  ctx.strokeRect(m, m, BOX.w * MM, BOX.h * MM);
  ctx.strokeStyle = '#b4b4b4';
  ctx.lineWidth = 0.3 * MM;
  for (let i = 1; i < 8; i++) {
    const y = m + i * 8 * MM;
    ctx.beginPath();
    ctx.moveTo(m + 2 * MM, y);
    ctx.lineTo(m + (BOX.w - 2) * MM, y);
    ctx.stroke();
  }
  ctx.textBaseline = 'alphabetic';
  lines.forEach((line, row) => {
    let x = m + (3 + rand() * 2) * MM;
    const base = m + (row + 1) * 8 * MM - 1.1 * MM;
    for (const ch of line) {
      const size = 34 + rand() * 4;
      ctx.font = `${size}px "Patrick Hand", "Comic Neue", cursive`;
      const shade = 40 + Math.floor(rand() * 35);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.save();
      ctx.translate(x, base + (rand() - 0.5) * 3 + row * 0.4);
      ctx.rotate((rand() - 0.5) * 0.09 - 0.02);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      x += ctx.measureText(ch).width * (0.93 + rand() * 0.1);
    }
  });
  // A crossed-out false start, as pupils do.
  ctx.strokeStyle = 'rgb(70,70,70)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w - 46 * MM, m + 3.6 * 8 * MM);
  ctx.lineTo(w - 32 * MM, m + 3.5 * 8 * MM);
  ctx.stroke();
  return canvas.toDataURL('image/png');
}

const pin = (
  id: string,
  x: number,
  y: number,
  comment: string,
  color?: PaperMarkupItem['color']
): PaperMarkupItem => ({
  id,
  kind: 'pin',
  atMm: { x, y },
  comment,
  ...(color ? { color } : {}),
});

const LONG =
  'Your explanation of evaporation and condensation is clear and in the right order, which is the hardest part. ' +
  'Next time, say why the air cools as it rises over the mountain: it expands because the pressure is lower. ' +
  'That is the idea that connects your clouds to the snow. Also check the spelling of collects, and add one ' +
  'sentence about groundwater, since some of the lake water never ran over the surface at all. Nice work. ' +
  'Keep the same order next time and add the missing step about wind. Well done!';

const PRIYA_ITEMS: PaperMarkupItem[] = [
  {
    id: 'p1',
    kind: 'highlight',
    rectMm: { x: 41, y: 88, w: 64, h: 6 },
    comment: 'Precise vocabulary.',
  },
  {
    id: 'p2',
    kind: 'ellipse',
    rectMm: { x: 124, y: 102, w: 34, h: 9 },
    comment: 'Which winds? Name them.',
  },
  { id: 'p3', kind: 'stamp', atMm: { x: 172, y: 78 }, symbol: 'check' },
  {
    id: 'p4',
    kind: 'rect',
    rectMm: { x: 40, y: 119, w: 80, h: 8 },
    color: 'blue',
  },
  pin('p5', 150, 127, 'Good link to groundwater.'),
  { id: 'p6', kind: 'stamp', atMm: { x: 172, y: 126 }, symbol: 'star' },
];

const MIKA_ITEMS: PaperMarkupItem[] = [
  pin('c1', 38.5, 70.5, LONG),
  pin('c2', 177.5, 70.5, 'Top right corner pin.'),
  pin('c3', 38.5, 133.5, 'Bottom left corner pin.'),
  pin('c4', 177.5, 133.5, 'Bottom right corner pin.'),
  ...Array.from({ length: 8 }, (_, i) =>
    pin(
      `c${i + 5}`,
      60 + i * 14,
      98 + (i % 2) * 10,
      `Note ${i + 5}: check this step.`,
      i % 3 === 0 ? 'blue' : undefined
    )
  ),
];

const THEO_ITEMS: PaperMarkupItem[] = Array.from({ length: 40 }, (_, i) =>
  i % 2 === 0
    ? {
        id: `t${i}`,
        kind: 'stamp' as const,
        atMm: { x: 42 + (i % 10) * 14.5, y: 76 + Math.floor(i / 10) * 15 },
        symbol: (['check', 'x', 'question', 'star'] as const)[i % 4],
      }
    : {
        id: `t${i}`,
        kind: 'rect' as const,
        rectMm: {
          x: 37 + (i % 10) * 14.5,
          y: 71 + Math.floor(i / 10) * 15,
          w: 10,
          h: 9,
        },
        color: 'green' as const,
      }
);

const grade = (items?: PaperMarkupItem[]): WrittenAnswerGrade => ({
  pointsAwarded: 3,
  gradedBy: 'mock-user-id',
  gradedAt: 1,
  ...(items ? { imageMarkup: { scanId: 'scan-1', page: 1, items } } : {}),
});

const STUDENTS: {
  key: string;
  name: string;
  seat: number;
  transcribed: boolean;
  grade?: WrittenAnswerGrade;
}[] = [
  { key: 'ada', name: 'Ada Lindqvist', seat: 1, transcribed: true },
  { key: 'grace', name: 'Grace Okafor', seat: 2, transcribed: false },
  {
    key: 'priya',
    name: 'Priya Raghunathan',
    seat: 3,
    transcribed: true,
    grade: grade(PRIYA_ITEMS),
  },
  {
    key: 'mika',
    name: 'Mika Tanaka-Whitfield',
    seat: 4,
    transcribed: false,
    grade: grade(MIKA_ITEMS),
  },
  {
    key: 'theo',
    name: 'Theo Berg',
    seat: 5,
    transcribed: false,
    grade: grade(THEO_ITEMS),
  },
  { key: 'olive', name: 'Olive Brandt', seat: 6, transcribed: false },
];

// An older stack whose page maps never recorded the box, so markup cannot place itself.
const OLD_BATCH = {
  ...BATCH,
  id: 'batch-old',
  pageMaps: undefined,
} as PaperBatch;
const batchFor = (id: string) =>
  Promise.resolve(id === OLD_BATCH.id ? OLD_BATCH : BATCH);

const initialResponses = (): QuizResponse[] =>
  STUDENTS.map((s) => ({
    studentUid: s.key,
    _responseKey: s.key,
    status: 'completed',
    joinedAt: 0,
    submittedAt: 0,
    score: 0,
    tabSwitchWarnings: 0,
    completedAttempts: 1,
    paperBatchId: s.key === 'olive' ? OLD_BATCH.id : BATCH.id,
    paperSeat: s.seat,
    answers: [
      {
        questionId: 'q2',
        answer: s.transcribed ? `<p>${TEXT[s.key].join(' ')}</p>` : '',
        answeredAt: 0,
        paperScanId: 'scan-1',
        paperTranscript: s.transcribed ? 'done' : 'image',
        artifacts: [
          {
            id: 'hw_scan-1_q2',
            slot: 'primary',
            kind: 'handwriting',
            storagePath: `paper_written_crops/mock-user-id/scan-1/${s.seat}/q2.webp`,
            uploadState: 'uploaded',
          },
        ],
      },
    ],
    ...(s.grade ? { grading: { q2: s.grade } } : {}),
  }));

const PRIVATE = new Map<string, PaperPrivateAnswer>(
  STUDENTS.map((s) => [
    paperPrivateKey(s.key, 'q2'),
    {
      scanId: 'scan-1',
      status: s.transcribed ? 'done' : 'image',
      rawTranscript: s.transcribed ? TEXT[s.key].join(' ') : undefined,
      attempts: 1,
      charged: s.transcribed,
      updatedAt: 0,
    },
  ])
);

const cropCache = new Map<string, Promise<string>>();
const resolveCrop: PaperCropResolver = (req) => {
  const key = req.responseKey;
  let hit = cropCache.get(key);
  if (!hit) {
    hit = drawCrop(TEXT[key] ?? TEXT.ada, key.length * 977 + key.charCodeAt(0));
    cropCache.set(key, hit);
  }
  return hit;
};

const ok =
  <T,>(value: T) =>
  () =>
    Promise.resolve(value);

const readStudent = (): string => {
  const s = new URLSearchParams(window.location.search).get('student');
  return STUDENTS.some((x) => x.key === s) ? (s as string) : 'ada';
};

export const PaperMarkupDevHarness: React.FC = () => {
  const [responses, setResponses] = useState(initialResponses);
  const [student] = useState(readStudent);
  const dashboard = useMemo(
    () =>
      ({
        toasts: [],
        addToast: noop,
        removeToast: noop,
      }) as unknown as DashboardContextValue,
    []
  );
  const names = useMemo(
    () => new Map(STUDENTS.map((s) => [s.key, s.name])),
    []
  );
  const onSaveGrade = useCallback(
    (responseKey: string, key: string, g: WrittenAnswerGrade) => {
      setResponses((prev) =>
        prev.map((r) =>
          r._responseKey === responseKey
            ? { ...r, grading: { ...r.grading, [key]: g } }
            : r
        )
      );
      return Promise.resolve();
    },
    []
  );
  return (
    <DashboardContext.Provider value={dashboard}>
      <DialogProvider>
        <AuthProvider>
          <div className="h-screen [height:100dvh] bg-slate-700" />
          <FreeResponseGrader
            quiz={QUIZ}
            responses={responses}
            displayNameByResponseKey={names}
            teacherUid="mock-user-id"
            sessionId="session-water"
            initialTarget={{ questionId: 'q2', responseKey: student }}
            paperPrivate={PRIVATE}
            resolvePaperCrop={resolveCrop}
            paperActions={{
              updateTranscript: ok({ answer: '', snapshotRewritten: false }),
              applyNewerScan: ok({
                scanId: 'scan-1',
                paperTranscript: 'done' as const,
              }),
              transcribeBlank: ok({ jobId: 'j' }),
              retry: ok({}),
            }}
            loadPaperBatch={batchFor}
            autoAdvance={false}
            onSaveGrade={onSaveGrade}
            onClose={noop}
          />
          <DialogContainer />
        </AuthProvider>
      </DialogProvider>
    </DashboardContext.Provider>
  );
};
