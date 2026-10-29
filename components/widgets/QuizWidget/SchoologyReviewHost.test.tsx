import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { SchoologyReviewHost } from './SchoologyReviewHost';
import { claimSchoologyReview } from '@/utils/schoologyInbox';
import { SCHOOLOGY_REVIEW_EVENT } from '@/utils/schoologyReviewProtocol';

const addWidget = vi.fn();
let widgets: { id: string; type: string }[] = [];
let readOnly = false;

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { id: 'board-1', widgets },
    addWidget,
  }),
}));
vi.mock('@/context/dashboardCanvasStore', () => ({
  useIsActiveBoardReadOnly: () => readOnly,
}));

describe('SchoologyReviewHost', () => {
  beforeEach(() => {
    addWidget.mockClear();
    widgets = [];
    readOnly = false;
    claimSchoologyReview();
  });

  it('adds a Quiz widget when the extension asks and the board has none', () => {
    render(<SchoologyReviewHost />);
    expect(addWidget).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new CustomEvent(SCHOOLOGY_REVIEW_EVENT));
    });
    expect(addWidget).toHaveBeenCalledExactlyOnceWith('quiz');
  });

  it('leaves the request to the Quiz widget already on the board', () => {
    widgets = [{ id: 'w1', type: 'quiz' }];
    render(<SchoologyReviewHost />);
    act(() => {
      window.dispatchEvent(new CustomEvent(SCHOOLOGY_REVIEW_EVENT));
    });
    expect(addWidget).not.toHaveBeenCalled();
  });

  it('adds nothing to a board the teacher cannot edit', () => {
    readOnly = true;
    render(<SchoologyReviewHost />);
    act(() => {
      window.dispatchEvent(new CustomEvent(SCHOOLOGY_REVIEW_EVENT));
    });
    expect(addWidget).not.toHaveBeenCalled();
  });
});
