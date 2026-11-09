import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import '@/i18n';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn(() => Promise.resolve(true)) }),
}));
vi.mock('@/utils/scanContrast', () => ({
  enhancedScanUrl: vi.fn(() => Promise.resolve('blob:enhanced')),
}));
vi.mock('@/utils/paperBatchStore', () => ({
  getPaperBatch: vi.fn(() => Promise.resolve(null)),
}));

import { REEDIT_DEBOUNCE_MS } from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
import type { PaperImageMarkup } from '@/types';
import {
  installMarkupGeometry,
  paper,
  px,
  readyLayer,
  renderMarkupGrader,
  scored,
} from './paperMarkupGraderKit';

beforeAll(installMarkupGeometry);
afterAll(() => {
  vi.restoreAllMocks();
});

const NOTICE = 'These marks were made on an earlier scan.';
const SAVE_WAIT = { timeout: REEDIT_DEBOUNCE_MS + 1500 };

const oldMarks = (extra: Partial<PaperImageMarkup> = {}): PaperImageMarkup => ({
  scanId: 'scan0',
  page: 1,
  items: [
    {
      id: 'p',
      kind: 'pin',
      atMm: { x: 60, y: 90 },
      comment: 'Name the winds.',
    },
    { id: 'r', kind: 'rect', rectMm: { x: 50, y: 80, w: 30, h: 10 } },
  ],
  ...extra,
});

const answerWith = (markup: PaperImageMarkup, points = 3) =>
  paper('ada', 1, scored({ pointsAwarded: points, imageMarkup: markup }));

const marks = (layer: Element) =>
  layer.querySelectorAll('[data-markup-focus]').length;
const lastGrade = (
  onSaveGrade: ReturnType<typeof renderMarkupGrader>['onSaveGrade']
) => onSaveGrade.mock.calls.at(-1)?.[2];

describe('earlier-scan notice', () => {
  it('shows when the marks were made on another scan, with a tour anchor', async () => {
    renderMarkupGrader([answerWith(oldMarks())]);
    await readyLayer();
    const notice = screen.getByText(NOTICE).closest('[data-tour]');
    expect(notice).toHaveAttribute(
      'data-tour',
      'quiz-grading.markup-earlier-scan'
    );
    expect(
      within(notice as HTMLElement).getByRole('button', { name: 'Looks right' })
    ).toBeInTheDocument();
    expect(
      within(notice as HTMLElement).getByRole('button', { name: 'Clear marks' })
    ).toBeInTheDocument();
  });

  it('stays away when the marks match the scan', async () => {
    renderMarkupGrader([answerWith(oldMarks({ scanId: 'scan1' }))]);
    await readyLayer();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('stays away once confirmed for the current scan', async () => {
    renderMarkupGrader([answerWith(oldMarks({ reviewedForScanId: 'scan1' }))]);
    await readyLayer();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('stays away on an answer with no marks', async () => {
    renderMarkupGrader([paper('ada', 1, scored())]);
    await readyLayer();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('is not shown with the flag off', async () => {
    renderMarkupGrader([answerWith(oldMarks())], { markup: false });
    await screen.findByAltText(/Handwritten answer/);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});

describe('earlier-scan notice: Looks right', () => {
  it('saves the confirmation against the current scan and keeps the marks as they were', async () => {
    const { onSaveGrade } = renderMarkupGrader([answerWith(oldMarks())]);
    const layer = await readyLayer();
    fireEvent.click(screen.getByRole('button', { name: 'Looks right' }));
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(marks(layer)).toBe(2);
    await waitFor(() => expect(onSaveGrade).toHaveBeenCalled(), SAVE_WAIT);
    const grade = lastGrade(onSaveGrade);
    expect(grade?.pointsAwarded).toBe(3);
    expect(grade?.imageMarkup).toEqual({
      ...oldMarks(),
      reviewedForScanId: 'scan1',
    });
  });

  it('with no score yet, holds the confirmation and saves it once a score is entered', async () => {
    const { onSaveGrade } = renderMarkupGrader([answerWith(oldMarks())]);
    await readyLayer();
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Looks right' }));
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(
      screen.getByText('Enter a score to save these marks.')
    ).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, REEDIT_DEBOUNCE_MS + 300));
    expect(onSaveGrade).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '2' },
    });
    await waitFor(() => expect(onSaveGrade).toHaveBeenCalled(), {
      timeout: 4000,
    });
    const grade = lastGrade(onSaveGrade);
    expect(grade?.pointsAwarded).toBe(2);
    expect(grade?.imageMarkup?.reviewedForScanId).toBe('scan1');
    expect(grade?.imageMarkup?.scanId).toBe('scan0');
  });
});

describe('earlier-scan notice: Clear marks', () => {
  it('removes every mark, saves the grade without them, and undo brings them back', async () => {
    const { onSaveGrade } = renderMarkupGrader([answerWith(oldMarks())]);
    const layer = await readyLayer();
    fireEvent.click(screen.getByRole('button', { name: 'Clear marks' }));
    expect(marks(layer)).toBe(0);
    expect(screen.queryByText(NOTICE)).toBeNull();
    await waitFor(() => expect(onSaveGrade).toHaveBeenCalled(), SAVE_WAIT);
    expect(lastGrade(onSaveGrade)).not.toHaveProperty('imageMarkup');

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(marks(layer)).toBe(2);
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it('is one undo step however many marks there were', async () => {
    renderMarkupGrader([answerWith(oldMarks())]);
    await readyLayer();
    fireEvent.click(screen.getByRole('button', { name: 'Clear marks' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });
});

describe('earlier-scan notice: editing a mark', () => {
  it('restamps the marks with the current scan and dismisses the notice', async () => {
    const { onSaveGrade } = renderMarkupGrader([answerWith(oldMarks())]);
    const layer = await readyLayer();
    fireEvent.click(
      within(screen.getByRole('toolbar')).getByRole('button', { name: 'Box' })
    );
    fireEvent.pointerDown(layer, px(100, 100));
    fireEvent.pointerMove(layer, px(140, 112));
    fireEvent.pointerUp(layer, px(140, 112));
    expect(screen.queryByText(NOTICE)).toBeNull();
    await waitFor(() => expect(onSaveGrade).toHaveBeenCalled(), SAVE_WAIT);
    const markup = lastGrade(onSaveGrade)?.imageMarkup;
    expect(markup?.scanId).toBe('scan1');
    expect(markup).not.toHaveProperty('reviewedForScanId');
    expect(markup?.items).toHaveLength(3);
  });

  it('shows again on the next answer whose marks are from an earlier scan', async () => {
    renderMarkupGrader([
      answerWith(oldMarks({ scanId: 'scan1' })),
      paper('grace', 2, scored({ imageMarkup: oldMarks() })),
    ]);
    await readyLayer();
    expect(screen.queryByText(NOTICE)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Grace Hopper/ }));
    await readyLayer();
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });
});
