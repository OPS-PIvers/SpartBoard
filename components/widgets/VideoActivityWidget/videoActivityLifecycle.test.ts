import { describe, it, expect, vi, beforeEach } from 'vitest';

const docs = vi.hoisted<Record<string, Record<string, unknown> | undefined>>(
  () => ({})
);
const turnIn = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segs: string[]) => segs.join('/'),
  getDoc: (path: string) => Promise.resolve({ data: () => docs[path] }),
}));
vi.mock('@/utils/quizFinalizeOpenResponses', () => ({
  END_TURN_IN_DELAY_MS: 125_000,
}));
vi.mock('./videoClassTurnIn', () => ({
  finalizeClassVideoResponses: turnIn,
}));

import {
  LIVE_REOPEN_REASON,
  VIDEO_ACTIVITY_RUN_COLLECTIONS,
  videoActivityLifecycle,
} from './videoActivityLifecycle';

const hook = () => ({
  pauseAssignment: vi.fn(() => Promise.resolve()),
  resumeAssignment: vi.fn(() => Promise.resolve()),
  deactivateAssignment: vi.fn(() => Promise.resolve()),
  reactivateAssignment: vi.fn(() => Promise.resolve()),
});

beforeEach(() => {
  for (const k of Object.keys(docs)) delete docs[k];
  turnIn.mockClear();
});

describe('videoActivityLifecycle', () => {
  it('maps pause, resume and end onto the assignment hook', async () => {
    const h = hook();
    const life = videoActivityLifecycle(h);
    expect(life).toMatchObject({ turnInDelayMs: 125_000, endTurnsIn: false });
    await life.pause('a1');
    await life.resume('a1');
    await life.end('a1');
    expect(h.pauseAssignment).toHaveBeenCalledWith('a1');
    expect(h.resumeAssignment).toHaveBeenCalledWith('a1');
    expect(h.deactivateAssignment).toHaveBeenCalledWith('a1');
  });

  it('names the video run collections', () => {
    expect(VIDEO_ACTIVITY_RUN_COLLECTIONS).toEqual({
      sessionCollection: 'video_activity_sessions',
      assignmentCollection: 'video_activity_assignments',
    });
  });

  it('reopens an ended self-paced run straight to active (D9)', async () => {
    docs['video_activity_sessions/a1'] = { status: 'ended' };
    const h = hook();
    await videoActivityLifecycle(h).reopen('a1');
    expect(h.reactivateAssignment).toHaveBeenCalledWith('a1');
  });

  it('refuses to reopen an ended live run, which rules keep ended', async () => {
    docs['video_activity_sessions/a1'] = {
      status: 'ended',
      sessionMode: 'teacher',
    };
    const h = hook();
    await expect(videoActivityLifecycle(h).reopen('a1')).rejects.toThrow(
      LIVE_REOPEN_REASON
    );
    expect(h.reactivateAssignment).not.toHaveBeenCalled();
  });

  it('turns a class in through the video turn-in', async () => {
    await videoActivityLifecycle(hook()).turnInClass('s1', 'p1', 5);
    expect(turnIn).toHaveBeenCalledWith('s1', 'p1', 5);
  });
});
