import { describe, expect, it } from 'vitest';
import type {
  PaperPrivateStatus,
  QuizResponseAnswer,
  ResponseArtifact,
  WrittenReturnMode,
} from '@/types';
import {
  canTransitionPaperPrivate,
  defaultPaperBoxSize,
  paperBoxLines,
  paperCropStoragePath,
  paperTranscriptionJobId,
  paperWrittenView,
  publicTranscriptState,
} from './paperWritten';

const crop: ResponseArtifact = {
  id: 'a1',
  slot: 'primary',
  kind: 'handwriting',
  storagePath: 'paper_written_crops/u/s/3/q1.webp',
  mimeType: 'image/webp',
  uploadState: 'uploaded',
};

function answer(
  paperTranscript: QuizResponseAnswer['paperTranscript'],
  text = '',
  withCrop = true
): QuizResponseAnswer {
  return {
    questionId: 'q1',
    answer: text,
    answeredAt: 1,
    paperTranscript,
    artifacts: withCrop ? [crop] : undefined,
  };
}

describe('defaultPaperBoxSize', () => {
  it.each([
    [undefined, 'M'],
    [0, 'M'],
    [-5, 'M'],
    [1, 'S'],
    [30, 'S'],
    [31, 'M'],
    [60, 'M'],
    [61, 'L'],
    [120, 'L'],
    [121, 'full'],
  ] as const)('maxWords %s gives %s', (maxWords, size) => {
    expect(defaultPaperBoxSize(maxWords)).toBe(size);
  });

  it('maps sizes to line counts', () => {
    expect(paperBoxLines('S')).toBe(3);
    expect(paperBoxLines('M')).toBe(6);
    expect(paperBoxLines('L')).toBe(12);
    expect(paperBoxLines('full')).toBe(24);
  });
});

describe('paths and ids', () => {
  it('builds the crop path and job id', () => {
    expect(paperCropStoragePath('u', 's', 3, 'q1')).toBe(
      'paper_written_crops/u/s/3/q1.webp'
    );
    expect(paperTranscriptionJobId('s', 3, 2, 0)).toBe('s_3_2_0');
  });
});

describe('status helpers', () => {
  it('shows failures publicly as pending', () => {
    expect(publicTranscriptState('failed')).toBe('pending');
    expect(publicTranscriptState('over-quota')).toBe('pending');
    expect(publicTranscriptState('done')).toBe('done');
    expect(publicTranscriptState('blank')).toBe('blank');
  });

  it('allows only the planned transitions', () => {
    expect(canTransitionPaperPrivate('pending', 'done')).toBe(true);
    expect(canTransitionPaperPrivate('failed', 'pending')).toBe(true);
    expect(canTransitionPaperPrivate('blank', 'pending')).toBe(true);
    expect(canTransitionPaperPrivate('done', 'pending')).toBe(false);
    expect(canTransitionPaperPrivate('blank', 'done')).toBe(false);
  });
});

describe('paperWrittenView', () => {
  const modes: WrittenReturnMode[] = ['handwriting', 'typed', 'both'];
  const statuses: PaperPrivateStatus[] = [
    'pending',
    'done',
    'failed',
    'blank',
    'over-quota',
  ];

  it('leaves typed device answers alone', () => {
    const view = paperWrittenView(
      { questionId: 'q', answer: '<p>hi</p>', answeredAt: 1 } as never,
      null,
      'handwriting'
    );
    expect(view).toEqual({
      showCrop: false,
      crop: null,
      transcript: '<p>hi</p>',
      placeholder: null,
    });
  });

  for (const mode of modes) {
    for (const status of statuses) {
      it(`${mode} × ${status}`, () => {
        const pub = publicTranscriptState(status);
        const view = paperWrittenView(
          answer(pub, pub === 'done' ? '<p>text</p>' : ''),
          { status },
          mode
        );
        expect(view.showCrop).toBe(mode !== 'typed');
        if (mode === 'handwriting') {
          expect(view.transcript).toBeNull();
          expect(view.placeholder).toBeNull();
          return;
        }
        if (pub === 'done') {
          expect(view.transcript).toBe('<p>text</p>');
          expect(view.placeholder).toBeNull();
        } else {
          expect(view.transcript).toBeNull();
          expect(view.placeholder).toBe(
            pub === 'blank' ? 'blank' : 'transcribing'
          );
        }
      });
    }
  }

  it('falls back to the public state without a private doc', () => {
    expect(paperWrittenView(answer('pending'), null, 'typed').placeholder).toBe(
      'transcribing'
    );
  });

  it('marks a missing crop unavailable', () => {
    const view = paperWrittenView(
      answer('done', '<p>x</p>', false),
      null,
      'handwriting'
    );
    expect(view.showCrop).toBe(false);
    expect(view.placeholder).toBe('unavailable');
  });
});
