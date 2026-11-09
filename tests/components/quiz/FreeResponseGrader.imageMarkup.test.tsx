import React from 'react';
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import '@/i18n';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
const { showConfirm } = vi.hoisted(() => ({
  showConfirm: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm }),
}));
vi.mock('@/utils/scanContrast', () => ({
  enhancedScanUrl: vi.fn(() => Promise.resolve('blob:enhanced')),
}));
const { getPaperBatch } = vi.hoisted(() => ({
  getPaperBatch: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('@/utils/paperBatchStore', () => ({ getPaperBatch }));

import {
  FreeResponseGrader,
  REEDIT_DEBOUNCE_MS,
  type FreeResponseGraderProps,
} from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
import { AuthContext } from '@/context/AuthContextValue';
import type { AuthContextType } from '@/context/AuthContextValue';
import type {
  PaperBatch,
  QuizData,
  QuizResponse,
  WrittenAnswerGrade,
} from '@/types';

const BOX = { x: 38, y: 70, w: 140, h: 64 };
const px = (mmX: number, mmY: number) => ({
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
beforeAll(() => {
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
});
afterAll(() => {
  vi.restoreAllMocks();
});

const quiz: QuizData = {
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

const batch = {
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

const paper = (
  key: string,
  seat: number,
  grade?: WrittenAnswerGrade,
  answer = '<p>The water cycle.</p>'
): QuizResponse => ({
  studentUid: key,
  _responseKey: key,
  answers: [
    {
      questionId: 'q1',
      answer,
      answeredAt: 0,
      paperScanId: 'scan1',
      paperTranscript: 'done',
      artifacts: [
        {
          id: 'hw_scan1_q1',
          slot: 'primary',
          kind: 'handwriting',
          storagePath: `paper_written_crops/t1/scan1/${seat}/q1.webp`,
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

const scored = (
  extra: Partial<WrittenAnswerGrade> = {}
): WrittenAnswerGrade => ({
  pointsAwarded: 3,
  gradedBy: 't1',
  gradedAt: 1,
  ...extra,
});

const auth = (markup: boolean) =>
  ({
    canAccessFeature: (id: string) =>
      id === 'paper-image-markup' ? markup : true,
    canAccessQuizMediaResponse: () => false,
  }) as unknown as AuthContextType;

const names = new Map([
  ['ada', 'Ada Lovelace'],
  ['grace', 'Grace Hopper'],
]);

function renderGrader(responses: QuizResponse[], { markup = true } = {}) {
  const onSaveGrade = vi.fn<FreeResponseGraderProps['onSaveGrade']>(() =>
    Promise.resolve()
  );
  const loadPaperBatch = vi.fn(() => Promise.resolve(batch));
  const onClose = vi.fn();
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
    onClose,
  };
  const view = render(
    <AuthContext.Provider value={auth(markup)}>
      <FreeResponseGrader {...props} responses={responses} />
    </AuthContext.Provider>
  );
  const rerender = (next: QuizResponse[]) =>
    view.rerender(
      <AuthContext.Provider value={auth(markup)}>
        <FreeResponseGrader {...props} responses={next} />
      </AuthContext.Provider>
    );
  return { onSaveGrade, loadPaperBatch, rerender, onClose };
}

const readyLayer = async () => {
  const img = await screen.findByAltText(/Handwritten answer/);
  await waitFor(() => expect(img).toHaveAttribute('src', 'blob:enhanced'));
  fireEvent.load(screen.getByAltText(/Handwritten answer/));
  return screen.findByRole('group', { name: 'Marks on the handwriting' });
};

const drawBox = (
  layer: Element,
  from: [number, number],
  to: [number, number]
) => {
  fireEvent.click(
    within(screen.getByRole('toolbar')).getByRole('button', { name: 'Box' })
  );
  fireEvent.pointerDown(layer, px(...from));
  fireEvent.pointerMove(layer, px(...to));
  fireEvent.pointerUp(layer, px(...to));
};

beforeEach(() => {
  window.localStorage.clear();
  getPaperBatch.mockClear();
  showConfirm.mockClear();
  showConfirm.mockImplementation(() => Promise.resolve(true));
});

describe('FreeResponseGrader image markup', () => {
  it('saves marks in sheet millimetres with the scan and page, through the grade save', async () => {
    const { onSaveGrade, loadPaperBatch } = renderGrader([
      paper('ada', 1, scored()),
    ]);
    const layer = await readyLayer();
    expect(loadPaperBatch).toHaveBeenCalledWith('b1');
    drawBox(layer, [50, 80], [90, 95]);
    await waitFor(() => expect(onSaveGrade).toHaveBeenCalled(), {
      timeout: REEDIT_DEBOUNCE_MS + 1000,
    });
    const [key, slot, grade] = onSaveGrade.mock.calls[0];
    expect([key, slot]).toEqual(['ada', 'q1']);
    expect(grade.pointsAwarded).toBe(3);
    expect(grade.imageMarkup).toEqual({
      scanId: 'scan1',
      page: 1,
      items: [
        expect.objectContaining({
          kind: 'rect',
          rectMm: { x: 50, y: 80, w: 40, h: 15 },
        }),
      ],
    });
  });

  it('holds marks until a score exists, and says so', async () => {
    const { onSaveGrade } = renderGrader([paper('ada', 1)]);
    const layer = await readyLayer();
    drawBox(layer, [50, 80], [90, 95]);
    expect(
      screen.getByText('Enter a score to save these marks.')
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '2' },
    });
    await waitFor(() => expect(onSaveGrade).toHaveBeenCalled(), {
      timeout: 4000,
    });
    expect(onSaveGrade.mock.calls.at(-1)?.[2].imageMarkup?.items).toHaveLength(
      1
    );
  });

  it("banks the open answer's marks on leaving and never shows them on the next one", async () => {
    const { onSaveGrade } = renderGrader([
      paper('ada', 1, scored()),
      paper('grace', 2, scored()),
    ]);
    const layer = await readyLayer();
    drawBox(layer, [50, 80], [90, 95]);
    fireEvent.click(screen.getByRole('button', { name: /Grace Hopper/ }));
    expect(onSaveGrade).toHaveBeenCalledTimes(1);
    expect(onSaveGrade.mock.calls[0][0]).toBe('ada');
    expect(onSaveGrade.mock.calls[0][2].imageMarkup?.items).toHaveLength(1);

    const graceLayer = await readyLayer();
    expect(graceLayer.querySelector('[data-markup-item]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await new Promise((r) => setTimeout(r, REEDIT_DEBOUNCE_MS + 200));
    expect(onSaveGrade.mock.calls.filter(([k]) => k === 'grace')).toHaveLength(
      0
    );
  });

  it('keeps unsaved marks when the grade or transcript updates from the server', async () => {
    const { rerender } = renderGrader([paper('ada', 1)]);
    const layer = await readyLayer();
    drawBox(layer, [50, 80], [90, 95]);
    rerender([paper('ada', 1, scored({ overallComment: 'From elsewhere' }))]);
    rerender([
      paper('ada', 1, scored(), '<p>The water cycle, transcribed again.</p>'),
    ]);
    expect(
      (await readyLayer()).querySelectorAll('[data-markup-item]')
    ).toHaveLength(1);
  });

  it('with the flag off shows no markup, loads nothing and keeps saved markup on save', async () => {
    const saved = {
      scanId: 'scan1',
      page: 1,
      items: [
        {
          id: 'p',
          kind: 'pin' as const,
          atMm: { x: 60, y: 90 },
          comment: 'Hi',
        },
      ],
    };
    const { onSaveGrade, loadPaperBatch } = renderGrader(
      [paper('ada', 1, scored({ imageMarkup: saved }))],
      { markup: false }
    );
    await screen.findByAltText(/Handwritten answer/);
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(document.querySelector('[data-markup-item]')).toBeNull();
    expect(loadPaperBatch).not.toHaveBeenCalled();
    expect(getPaperBatch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '4' },
    });
    await waitFor(() => expect(onSaveGrade).toHaveBeenCalled(), {
      timeout: 4000,
    });
    expect(onSaveGrade.mock.calls[0][2].imageMarkup).toEqual(saved);
  });

  it('writes no markup field when there never was any', async () => {
    const { onSaveGrade } = renderGrader([paper('ada', 1)], { markup: false });
    await screen.findByAltText(/Handwritten answer/);
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '4' },
    });
    await waitFor(() => expect(onSaveGrade).toHaveBeenCalled(), {
      timeout: 4000,
    });
    expect(onSaveGrade.mock.calls[0][2]).not.toHaveProperty('imageMarkup');
  });

  it('disables the tools when the stack is gone', async () => {
    const { loadPaperBatch } = renderGrader([paper('ada', 1, scored())]);
    loadPaperBatch.mockResolvedValue(null as unknown as PaperBatch);
    await screen.findByAltText(/Handwritten answer/);
    await waitFor(() =>
      expect(
        within(screen.getByRole('toolbar')).getByRole('button', { name: 'Box' })
      ).toBeDisabled()
    );
  });

  it('keeps unscored marks across students, flags the row, and saves them with the score', async () => {
    const { onSaveGrade } = renderGrader([
      paper('ada', 1),
      paper('grace', 2, scored()),
    ]);
    drawBox(await readyLayer(), [50, 80], [90, 95]);
    fireEvent.click(screen.getByRole('button', { name: /Grace Hopper/ }));
    await readyLayer();
    const adaRow = screen.getByRole('button', { name: /Ada Lovelace/ });
    expect(within(adaRow).getByText('Marks not saved')).toBeInTheDocument();
    fireEvent.click(adaRow);
    expect(
      (await readyLayer()).querySelectorAll('[data-markup-focus]')
    ).toHaveLength(1);
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '2' },
    });
    await waitFor(
      () =>
        expect(
          onSaveGrade.mock.calls.some(
            ([k, , g]) => k === 'ada' && g.imageMarkup?.items.length === 1
          )
        ).toBe(true),
      { timeout: 4000 }
    );
    await waitFor(() =>
      expect(
        within(
          screen.getByRole('button', { name: /Ada Lovelace/ })
        ).queryByText('Marks not saved')
      ).toBeNull()
    );
  });

  it('asks before closing with unscored marks, and Go back keeps the grader open', async () => {
    const { onClose } = renderGrader([paper('ada', 1), paper('grace', 2)]);
    drawBox(await readyLayer(), [50, 80], [90, 95]);
    showConfirm.mockImplementation(() => Promise.resolve(false));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(showConfirm).toHaveBeenCalledTimes(1));
    expect(showConfirm).toHaveBeenCalledWith(
      '1 answer has marks but no score. Enter a score to keep them.',
      expect.objectContaining({
        title: 'Marks not saved',
        confirmLabel: 'Close anyway',
        cancelLabel: 'Go back',
      })
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(onClose).not.toHaveBeenCalled();
    showConfirm.mockImplementation(() => Promise.resolve(true));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('closes without asking when every marked answer has a score', async () => {
    const { onClose } = renderGrader([paper('ada', 1, scored())]);
    drawBox(await readyLayer(), [50, 80], [90, 95]);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(showConfirm).not.toHaveBeenCalled();
  });
});
