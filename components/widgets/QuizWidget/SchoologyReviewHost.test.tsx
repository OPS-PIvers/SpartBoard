import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import {
  SCHOOLOGY_REVIEW_WAIT_MS,
  SchoologyReviewHost,
} from './SchoologyReviewHost';
import {
  claimSchoologyReview,
  schoologyReviewPending,
} from '@/utils/schoologyInbox';
import { SCHOOLOGY_REVIEW_EVENT } from '@/utils/schoologyReviewProtocol';

const addWidget = vi.fn();
const addToast = vi.fn();
let widgets: { id: string; type: string }[] = [];
let readOnly = false;
let quizAllowed = true;

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { id: 'board-1', widgets },
    addWidget,
    addToast,
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessWidget: () => quizAllowed }),
}));
vi.mock('@/context/dashboardCanvasStore', () => ({
  useIsActiveBoardReadOnly: () => readOnly,
}));

const ask = () => {
  const event = new CustomEvent(SCHOOLOGY_REVIEW_EVENT, { cancelable: true });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
};
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('SchoologyReviewHost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    addWidget.mockClear();
    addToast.mockClear();
    widgets = [];
    readOnly = false;
    quizAllowed = true;
    claimSchoologyReview();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('acknowledges the event and adds a Quiz widget when the board has none', () => {
    render(<SchoologyReviewHost />);
    expect(ask().defaultPrevented).toBe(true);
    wait(0);
    expect(addWidget).toHaveBeenCalledExactlyOnceWith('quiz');
  });

  it("adds one when the board's Quiz widget never takes the request, such as a colleague's on a shared board", () => {
    widgets = [{ id: 'w1', type: 'quiz' }];
    render(<SchoologyReviewHost />);
    ask();
    wait(SCHOOLOGY_REVIEW_WAIT_MS - 1);
    expect(addWidget).not.toHaveBeenCalled();
    wait(1);
    expect(addWidget).toHaveBeenCalledExactlyOnceWith('quiz');
  });

  it('adds nothing when a Quiz widget takes the request', () => {
    widgets = [{ id: 'w1', type: 'quiz' }];
    render(<SchoologyReviewHost />);
    ask();
    act(() => {
      claimSchoologyReview();
    });
    wait(SCHOOLOGY_REVIEW_WAIT_MS);
    expect(addWidget).not.toHaveBeenCalled();
  });

  it('says why and drops the request on a view-only board', () => {
    readOnly = true;
    render(<SchoologyReviewHost />);
    ask();
    wait(0);
    expect(addWidget).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledOnce();
    expect(schoologyReviewPending()).toBe(false);
  });

  it('adds no Quiz widget for a teacher who may not use it', () => {
    quizAllowed = false;
    render(<SchoologyReviewHost />);
    ask();
    wait(0);
    expect(addWidget).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledOnce();
    expect(schoologyReviewPending()).toBe(false);
  });
});
