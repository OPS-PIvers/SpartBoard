import React, { useCallback, useMemo, useState } from 'react';
import { vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  FreeResponseGrader,
  type FreeResponseGraderProps,
} from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
import { AuthContext } from '@/context/AuthContextValue';
import type { AuthContextType } from '@/context/AuthContextValue';
import type {
  PaperBatch,
  QuizData,
  QuizResponse,
  WidgetConfig,
  WidgetType,
  WrittenAnswerGrade,
} from '@/types';

// Shared fixtures for the markup tests that drive the real grader.

export const BOX = { x: 38, y: 70, w: 140, h: 64 };
/** Drawn at 5 px per millimetre: client x = (mm - 36) * 5. */
export const px = (mmX: number, mmY: number) => ({
  clientX: (mmX - 36) * 5,
  clientY: (mmY - 68) * 5,
});

const ZERO = {
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  right: 0,
  bottom: 0,
  x: 0,
  y: 0,
};
const CANVAS = {
  left: 0,
  top: 0,
  width: 720,
  height: 340,
  right: 720,
  bottom: 340,
  x: 0,
  y: 0,
};

/** Gives the markup canvas a size and the image its natural size; call from beforeAll. */
export function installMarkupGeometry() {
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
    configurable: true,
    get: () => 850,
  });
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
    configurable: true,
    get: () => 402,
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      return (
        this.getAttribute('data-tour') === 'quiz-grading.markup-canvas'
          ? CANVAS
          : ZERO
      ) as DOMRect;
    }
  );
}

export const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Quiz',
  createdAt: 0,
  updatedAt: 0,
  questions: [
    {
      id: 'q1',
      type: 'free-response',
      text: 'Explain.',
      timeLimit: 0,
      correctAnswer: '',
      incorrectAnswers: [],
      points: 4,
    },
  ],
};

export const batch = {
  id: 'b1',
  quizId: 'quiz-1',
  layoutVersion: 2,
  pagesPerSheet: 1,
  pageMaps: [
    {
      page: 1,
      grid: 1,
      items: [
        {
          kind: 'written',
          questionId: 'q1',
          label: '1',
          headerMm: { x: 38, y: 62, w: 140, h: 7 },
          boxMm: BOX,
          lines: 6,
        },
      ],
    },
  ],
} as unknown as PaperBatch;

export const paper = (
  key: string,
  seat: number,
  grade?: WrittenAnswerGrade,
  scanId = 'scan1'
): QuizResponse => ({
  studentUid: key,
  _responseKey: key,
  answers: [
    {
      questionId: 'q1',
      answer: '<p>The water cycle.</p>',
      answeredAt: 0,
      paperScanId: scanId,
      paperTranscript: 'done',
      artifacts: [
        {
          id: `hw_${scanId}_q1`,
          slot: 'primary',
          kind: 'handwriting',
          storagePath: `paper_written_crops/t1/${scanId}/${seat}/q1.webp`,
          uploadState: 'uploaded',
        },
      ],
    },
  ],
  ...(grade ? { grading: { q1: grade } } : {}),
  status: 'completed',
  joinedAt: 0,
  submittedAt: 0,
  score: 0,
  tabSwitchWarnings: 0,
  completedAttempts: 1,
  paperBatchId: 'b1',
  paperSeat: seat,
});

export const scored = (
  extra: Partial<WrittenAnswerGrade> = {}
): WrittenAnswerGrade => ({
  pointsAwarded: 3,
  gradedBy: 't1',
  gradedAt: 1,
  ...extra,
});

export type PresetWrite = [WidgetType, Partial<WidgetConfig>];

/** A profile that holds `savedWidgetPresets` in state and records every write to it. */
// eslint-disable-next-line react-refresh/only-export-components -- test helper module
const Profile: React.FC<{
  markup: boolean;
  seed: string[] | undefined;
  writes: PresetWrite[];
  children: React.ReactNode;
}> = ({ markup, seed, writes, children }) => {
  const [presets, setPresets] = useState<AuthContextType['savedWidgetPresets']>(
    seed ? { quiz: { markupComments: seed } as Partial<WidgetConfig> } : {}
  );
  const saveWidgetPreset = useCallback(
    (type: WidgetType, preset: Partial<WidgetConfig>) => {
      writes.push([type, preset]);
      setPresets((prev) => ({
        ...prev,
        [type]: { ...(prev[type] ?? {}), ...preset },
      }));
    },
    [writes]
  );
  const value = useMemo(
    () =>
      ({
        canAccessFeature: (id: string) =>
          id === 'paper-image-markup' ? markup : true,
        canAccessQuizMediaResponse: () => false,
        savedWidgetPresets: presets,
        saveWidgetPreset,
      }) as unknown as AuthContextType,
    [markup, presets, saveWidgetPreset]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const names = new Map([
  ['ada', 'Ada Lovelace'],
  ['grace', 'Grace Hopper'],
]);

export function renderMarkupGrader(
  responses: QuizResponse[],
  { markup = true, saved }: { markup?: boolean; saved?: string[] } = {}
) {
  const onSaveGrade = vi.fn<FreeResponseGraderProps['onSaveGrade']>(() =>
    Promise.resolve()
  );
  const writes: PresetWrite[] = [];
  const loadPaperBatch = vi.fn(() => Promise.resolve(batch));
  const props = {
    quiz,
    displayNameByResponseKey: names,
    teacherUid: 't1',
    sessionId: 's1',
    resolvePaperCrop: vi.fn().mockResolvedValue('data:image/webp;base64,AA'),
    onSaveGrade,
    loadPaperBatch,
    graderMode: 'question' as const,
    autoAdvance: false,
    onClose: vi.fn(),
  };
  const tree = (list: QuizResponse[]) => (
    <Profile markup={markup} seed={saved} writes={writes}>
      <FreeResponseGrader {...props} responses={list} />
    </Profile>
  );
  const view = render(tree(responses));
  return {
    onSaveGrade,
    writes,
    rerender: (next: QuizResponse[]) => view.rerender(tree(next)),
  };
}

export const readyLayer = async () => {
  const img = await screen.findByAltText(/Handwritten answer/);
  await waitFor(() => expect(img).toHaveAttribute('src', 'blob:enhanced'));
  fireEvent.load(screen.getByAltText(/Handwritten answer/));
  return screen.findByRole('group', { name: 'Marks on the handwriting' });
};
