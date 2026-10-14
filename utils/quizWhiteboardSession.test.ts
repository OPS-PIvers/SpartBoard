import { describe, it, expect } from 'vitest';
import type { QuizPublicQuestion, RecordingConfig } from '@/types';
import {
  buildWhiteboardTakeArtifacts,
  noticeDrawingForSession,
  studentRecordingFor,
} from './quizWhiteboardSession';

const base: RecordingConfig = {
  prepSeconds: 0,
  limitSeconds: 60,
  prepExpiry: 'armed',
  takeLimit: null,
};
const q = (
  recording?: RecordingConfig,
  type: QuizPublicQuestion['type'] = 'free-response'
): Pick<QuizPublicQuestion, 'type' | 'recording'> => ({ type, recording });
const audio = q(base);
const narrated = q({ ...base, mode: 'whiteboard' });
const drawOnly = q({ ...base, mode: 'whiteboard', explainAloud: false });
const both = { mediaResponseEnabled: true, whiteboardResponseEnabled: true };

describe('studentRecordingFor', () => {
  it('needs the media marker for any recording', () => {
    expect(studentRecordingFor(audio, {})).toBeUndefined();
    expect(studentRecordingFor(narrated, {})).toBeUndefined();
  });

  it('needs the whiteboard marker for a whiteboard block', () => {
    const media = { mediaResponseEnabled: true };
    expect(studentRecordingFor(audio, media)).toEqual(base);
    expect(studentRecordingFor(narrated, media)).toBeUndefined();
    expect(studentRecordingFor(narrated, both)?.mode).toBe('whiteboard');
  });

  it('ignores a recording block on a choice question', () => {
    expect(studentRecordingFor(q(base, 'MC'), both)).toBeUndefined();
  });
});

describe('noticeDrawingForSession', () => {
  it('is null without a whiteboard question', () => {
    expect(noticeDrawingForSession(both, [audio])).toBeNull();
    expect(
      noticeDrawingForSession({ mediaResponseEnabled: true }, [narrated])
    ).toBeNull();
  });

  it('is narrated when any question uses the mic', () => {
    expect(noticeDrawingForSession(both, [narrated])).toBe('narrated');
    expect(noticeDrawingForSession(both, [drawOnly, audio])).toBe('narrated');
  });

  it('is draw-only when no question uses the mic', () => {
    expect(noticeDrawingForSession(both, [drawOnly, drawOnly])).toBe(
      'draw-only'
    );
  });
});

describe('buildWhiteboardTakeArtifacts', () => {
  const ids = ['a', 'b', 'c'];
  const take = {
    audio: { blob: new Blob(['aa']), mimeType: 'audio/webm' },
    picture: new Blob(['ppp']),
    log: new Blob(['l']),
    durationMs: 1000,
    micState: 'on' as const,
  };

  it('builds picture, log and audio in one take', () => {
    let i = 0;
    const parts = buildWhiteboardTakeArtifacts(
      take,
      (id, mime) => `${id}:${mime}`,
      () => ids[i++]
    );
    expect(parts.map((p) => p.artifact)).toEqual([
      expect.objectContaining({
        id: 'a',
        kind: 'whiteboard',
        part: 'picture',
        mimeType: 'image/png',
        storagePath: 'a:image/png',
        bytes: 3,
        uploadState: 'pending',
      }),
      expect.objectContaining({
        id: 'b',
        kind: 'whiteboard',
        part: 'log',
        mimeType: 'application/json',
      }),
      expect.objectContaining({
        id: 'c',
        kind: 'audio',
        mimeType: 'audio/webm',
        durationMs: 1000,
      }),
    ]);
    expect(parts[2].artifact).not.toHaveProperty('part');
  });

  it('omits audio on a draw-only take', () => {
    const parts = buildWhiteboardTakeArtifacts(
      { ...take, audio: null, micState: undefined },
      (id) => id
    );
    expect(parts.map((p) => p.artifact.kind)).toEqual([
      'whiteboard',
      'whiteboard',
    ]);
  });
});
