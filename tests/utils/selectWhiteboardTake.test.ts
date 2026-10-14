import { describe, expect, it } from 'vitest';
import { selectWhiteboardTake } from '@/utils/responseArtifacts';
import type { QuizResponseAnswer, ResponseArtifact } from '@/types';

const art = (
  id: string,
  over: Partial<ResponseArtifact> = {}
): ResponseArtifact => ({
  id,
  slot: 'primary',
  kind: 'whiteboard',
  part: 'picture',
  uploadState: 'uploaded',
  ...over,
});

const take = (
  takeIndex: number,
  artifacts: ResponseArtifact[],
  questionId = 'q1'
): QuizResponseAnswer => ({
  questionId,
  answer: '',
  answeredAt: 1,
  takeIndex,
  artifacts,
});

describe('selectWhiteboardTake', () => {
  it('groups picture, log and audio from one entry', () => {
    const sel = selectWhiteboardTake(
      [
        take(0, [
          art('p0'),
          art('l0', { part: 'log' }),
          art('a0', { kind: 'audio', part: undefined }),
        ]),
      ],
      'q1'
    );
    expect(sel?.picture.id).toBe('p0');
    expect(sel?.log?.id).toBe('l0');
    expect(sel?.audio?.id).toBe('a0');
    expect(sel?.displayIndex).toBe(1);
  });

  it('returns a draw-only take with no audio', () => {
    const sel = selectWhiteboardTake(
      [take(0, [art('p0'), art('l0', { part: 'log' })])],
      'q1'
    );
    expect(sel?.audio).toBeUndefined();
  });

  it('picks the latest take, or the pinned one', () => {
    const answers = [take(0, [art('p0')]), take(1, [art('p1')])];
    expect(selectWhiteboardTake(answers, 'q1')?.picture.id).toBe('p1');
    const pinned = selectWhiteboardTake(answers, 'q1', 'primary', 0);
    expect(pinned?.picture.id).toBe('p0');
    expect(pinned?.displayIndex).toBe(1);
  });

  it('skips a take whose picture upload failed with no archive rescue', () => {
    const answers = [
      take(0, [art('p0')]),
      take(1, [art('p1', { uploadState: 'failed' })]),
    ];
    expect(selectWhiteboardTake(answers, 'q1')?.picture.id).toBe('p0');
  });

  it('ignores audio-only entries and other questions', () => {
    const answers = [
      take(0, [art('a0', { kind: 'audio', part: undefined })]),
      take(0, [art('px')], 'q2'),
    ];
    expect(selectWhiteboardTake(answers, 'q1')).toBeNull();
  });
});
