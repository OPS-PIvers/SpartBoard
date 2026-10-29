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
const extension = {
  canConnect: false,
  signedIn: false as boolean | null,
  connect: vi.fn(() => Promise.resolve(true)),
};
vi.mock('@/components/tours/web/extensionClient', () => ({
  pingExtension: () => Promise.resolve({ kind: 'none' }),
  canConnectSchoology: () => extension.canConnect,
  extensionSignedIn: () => Promise.resolve(extension.signedIn),
  connectExtension: () => extension.connect(),
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
    extension.canConnect = false;
    extension.signedIn = false;
    extension.connect.mockClear();
    localStorage.clear();
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

  describe('connecting the extension', () => {
    const settle = () => act(async () => {});
    type Action = {
      onClick: () => void;
      secondary: { onClick: () => void };
    };
    const offer = () => addToast.mock.calls[0]?.[2] as Action | undefined;

    it('offers once when a staff extension has no sign-in, and connects on click', async () => {
      extension.canConnect = true;
      render(<SchoologyReviewHost />);
      await settle();
      expect(addToast).toHaveBeenCalledOnce();
      offer()?.onClick();
      await settle();
      expect(extension.connect).toHaveBeenCalledOnce();
      expect(addToast).toHaveBeenLastCalledWith(
        expect.stringContaining('Reload your Schoology page'),
        'success'
      );
    });

    it('stays quiet when signed in, without a staff extension, or after Not now', async () => {
      extension.canConnect = true;
      extension.signedIn = true;
      render(<SchoologyReviewHost />).unmount();
      await settle();
      extension.signedIn = false;
      extension.canConnect = false;
      render(<SchoologyReviewHost />).unmount();
      await settle();
      expect(addToast).not.toHaveBeenCalled();
      extension.canConnect = true;
      render(<SchoologyReviewHost />).unmount();
      await settle();
      offer()?.secondary.onClick();
      addToast.mockClear();
      render(<SchoologyReviewHost />);
      await settle();
      expect(addToast).not.toHaveBeenCalled();
    });
  });
});
