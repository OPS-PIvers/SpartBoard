import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VA_BEHAVIOR,
  getVideoActivityBehavior,
} from '@/utils/videoActivityBehavior';
import type { VideoActivityMetadata } from '@/types';

describe('getVideoActivityBehavior', () => {
  it('returns DEFAULT_VA_BEHAVIOR when metadata has no behavior', () => {
    const meta = {
      id: 'va1',
      title: 'T',
      youtubeUrl: 'https://youtu.be/x',
      driveFileId: 'd',
      questionCount: 0,
      createdAt: 1,
      updatedAt: 1,
    } as VideoActivityMetadata;
    expect(getVideoActivityBehavior(meta)).toEqual(DEFAULT_VA_BEHAVIOR);
  });
  it('returns the stored behavior when present', () => {
    const behavior = {
      sessionMode: 'student' as const,
      sessionOptions: { shuffleQuestions: true },
      attemptLimit: null,
    };
    const meta = {
      id: 'va1',
      title: 'T',
      youtubeUrl: 'https://youtu.be/x',
      driveFileId: 'd',
      questionCount: 0,
      createdAt: 1,
      updatedAt: 1,
      behavior,
    } as VideoActivityMetadata;
    expect(getVideoActivityBehavior(meta)).toEqual(behavior);
  });
  it('DEFAULT has teacher mode, attemptLimit 1, shuffleAnswerOptions on', () => {
    expect(DEFAULT_VA_BEHAVIOR.sessionMode).toBe('teacher');
    expect(DEFAULT_VA_BEHAVIOR.attemptLimit).toBe(1);
    expect(DEFAULT_VA_BEHAVIOR.sessionOptions.shuffleAnswerOptions).toBe(true);
  });
});
