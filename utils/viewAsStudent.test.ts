import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const startMock = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: () => startMock,
}));
vi.mock('firebase/auth', () => ({
  signInWithCustomToken: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ auth: {}, functions: {} }));

import { openStudentPreviewTab, studentPreviewUrl } from './viewAsStudent';
import { VIEW_AS_READY, VIEW_AS_STUDENT_HANDOFF } from './viewAsTab';

const PREVIEW = {
  sid: 's1',
  token: 'stok',
  studentUid: 'stu-1',
  kind: 'video-activity' as const,
  sessionId: 'va-1',
  studentKey: 'stu-1',
  expiresAt: 123,
};

const fakeWin = () => ({ postMessage: vi.fn(), close: vi.fn() });

const sendReady = (source: unknown, origin = window.location.origin) => {
  const ev = new MessageEvent('message', {
    data: { type: VIEW_AS_READY },
    origin,
  });
  Object.defineProperty(ev, 'source', { value: source });
  window.dispatchEvent(ev);
};

describe('studentPreviewUrl', () => {
  it('opens the student app path in a student View as tab', () => {
    expect(
      studentPreviewUrl({ kind: 'quiz', sessionId: 'q1', studentKey: 'k' })
    ).toBe('/quiz?viewAs=student');
    expect(
      studentPreviewUrl({
        kind: 'activity-wall',
        sessionId: 't1_w1',
        studentKey: 'k',
      })
    ).toBe('/activity-wall/t1_w1?viewAs=student');
    expect(
      studentPreviewUrl({
        kind: 'guided-learning',
        sessionId: 'g/1',
        studentKey: 'k',
      })
    ).toBe('/guided-learning/g%2F1?viewAs=student');
  });
});

describe('openStudentPreviewTab', () => {
  let win: ReturnType<typeof fakeWin>;

  beforeEach(() => {
    win = fakeWin();
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    startMock.mockReset().mockResolvedValue({ data: PREVIEW });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hands the token over only after the student tab is ready, and only once', async () => {
    await openStudentPreviewTab({
      kind: 'video-activity',
      sessionId: 'va-1',
      studentKey: 'stu-1',
    });
    expect(window.open).toHaveBeenCalledWith(
      '/activity/va-1?viewAs=student',
      '_blank'
    );
    expect(win.postMessage).not.toHaveBeenCalled();

    sendReady(fakeWin());
    sendReady(win, 'https://evil.example');
    expect(win.postMessage).not.toHaveBeenCalled();

    sendReady(win);
    sendReady(win);
    expect(win.postMessage).toHaveBeenCalledTimes(1);
    expect(win.postMessage).toHaveBeenCalledWith(
      { type: VIEW_AS_STUDENT_HANDOFF, preview: PREVIEW },
      window.location.origin
    );
  });

  it('closes the tab when the server refuses', async () => {
    startMock.mockRejectedValue(new Error('nope'));
    await expect(
      openStudentPreviewTab({ kind: 'quiz', sessionId: 'q1', studentKey: 'k' })
    ).rejects.toThrow('nope');
    expect(win.close).toHaveBeenCalled();
    sendReady(win);
    expect(win.postMessage).not.toHaveBeenCalled();
  });

  it('reports a blocked pop-up', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    await expect(
      openStudentPreviewTab({ kind: 'quiz', sessionId: 'q1', studentKey: 'k' })
    ).rejects.toThrow(/pop-ups/);
    expect(startMock).not.toHaveBeenCalled();
  });
});
