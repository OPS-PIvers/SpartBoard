/**
 * Pictures from a Word test becoming quiz stimuli
 * (docs/plans/QUIZ_DOCUMENT_IMPORT.md D13, D14). The ids a question carries
 * between the read and the save are the reader's own, so the thing under test
 * is that every one of them is either swapped for a real stimulus or dropped.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  attachDocumentImages,
  type StimulusUploader,
} from '@/utils/quizDocumentImport/attachImages';
import type { QuizData, QuizQuestion } from '@/types';
import type { ExtractedImage } from '@/utils/quizDocumentImport/types';

function image(id: string): ExtractedImage {
  return {
    id,
    blob: new Blob(['PNGDATA']),
    contentType: 'image/png',
    name: `${id}.png`,
  };
}

function question(over: Partial<QuizQuestion> = {}): QuizQuestion {
  return {
    id: 'q1',
    text: 'Which shape is this?',
    timeLimit: 0,
    type: 'MC',
    correctAnswer: 'Circle',
    incorrectAnswers: ['Square'],
    ...over,
  };
}

function quiz(questions: QuizQuestion[], stimuli?: QuizData['stimuli']) {
  return {
    id: 'quiz-1',
    title: 'Unit 3 Test',
    questions,
    ...(stimuli ? { stimuli } : {}),
    createdAt: 1,
    updatedAt: 1,
  } satisfies QuizData;
}

/** An uploader that hands back a predictable Drive id per picture. */
function uploader(over: Partial<StimulusUploader> = {}): StimulusUploader {
  return {
    upload: vi.fn((img: ExtractedImage) =>
      Promise.resolve({
        driveFileId: `drive-${img.id}`,
        url: `https://drive.google.com/file/d/drive-${img.id}/view`,
      })
    ),
    remove: vi.fn(() => Promise.resolve()),
    ...over,
  };
}

describe('attachDocumentImages', () => {
  it('uploads a picture and points its question at the new stimulus', async () => {
    const up = uploader();
    const result = await attachDocumentImages(
      quiz([question({ stimulusIds: ['img-1'] })]),
      [image('img-1')],
      up
    );

    expect(up.upload).toHaveBeenCalledTimes(1);
    expect(result.stimuli).toHaveLength(1);
    const [stimulus] = result.stimuli ?? [];
    expect(stimulus.type).toBe('image');
    expect(stimulus.driveFileId).toBe('drive-img-1');
    expect(stimulus.url).toContain('drive-img-1');
    expect(stimulus.label).toBe('img-1.png');
    // The reader's id must not survive into a saved quiz.
    expect(result.questions[0].stimulusIds).toEqual([stimulus.id]);
  });

  it('uploads a shared picture once and links it to every question', async () => {
    const up = uploader();
    const result = await attachDocumentImages(
      quiz([
        question({ id: 'q1', stimulusIds: ['img-1'] }),
        question({ id: 'q2', stimulusIds: ['img-1'] }),
      ]),
      [image('img-1')],
      up
    );

    // D14 — one stimulus, two pointers, not two copies in the teacher's Drive.
    expect(up.upload).toHaveBeenCalledTimes(1);
    expect(result.stimuli).toHaveLength(1);
    const stimulusId = result.stimuli?.[0].id;
    expect(result.questions[0].stimulusIds).toEqual([stimulusId]);
    expect(result.questions[1].stimulusIds).toEqual([stimulusId]);
  });

  it('never uploads a picture whose question the teacher unticked', async () => {
    const up = uploader();
    // The review table already removed q2, so img-2 has nothing pointing at it.
    const result = await attachDocumentImages(
      quiz([question({ stimulusIds: ['img-1'] })]),
      [image('img-1'), image('img-2')],
      up
    );

    expect(up.upload).toHaveBeenCalledTimes(1);
    expect(result.stimuli).toHaveLength(1);
    expect(result.stimuli?.[0].label).toBe('img-1.png');
  });

  it('strips a pointer to a picture the reader never produced', async () => {
    const result = await attachDocumentImages(
      quiz([
        question({ id: 'q1', stimulusIds: ['img-1'] }),
        question({ id: 'q2', stimulusIds: ['img-missing'] }),
      ]),
      [image('img-1')],
      uploader()
    );

    expect(result.questions[0].stimulusIds).toHaveLength(1);
    // A dangling pointer would render as a broken stimulus for a student.
    expect(result.questions[1].stimulusIds).toBeUndefined();
  });

  it('strips every pointer when no pictures are supplied', async () => {
    const up = uploader();
    const result = await attachDocumentImages(
      quiz([question({ stimulusIds: ['img-1'] })]),
      [],
      up
    );

    expect(up.upload).not.toHaveBeenCalled();
    expect(result.questions[0].stimulusIds).toBeUndefined();
    expect(result.stimuli).toBeUndefined();
  });

  it('leaves a quiz with no pictures alone', async () => {
    const result = await attachDocumentImages(
      quiz([question()]),
      [],
      uploader()
    );
    expect(result.questions[0]).toEqual(question());
    expect(result.stimuli).toBeUndefined();
  });

  it('keeps stimuli the quiz already carried', async () => {
    const existing = {
      id: 'existing',
      type: 'image' as const,
      url: 'https://example.test/a.png',
      label: 'a.png',
    };
    const result = await attachDocumentImages(
      quiz([question({ stimulusIds: ['img-1'] })], [existing]),
      [image('img-1')],
      uploader()
    );
    expect(result.stimuli).toHaveLength(2);
    expect(result.stimuli?.[0]).toEqual(existing);
  });

  it('removes what it already uploaded when a later upload fails', async () => {
    const remove = vi.fn(() => Promise.resolve());
    const upload = vi
      .fn()
      .mockResolvedValueOnce({
        driveFileId: 'drive-img-1',
        url: 'https://drive.google.com/file/d/drive-img-1/view',
      })
      .mockRejectedValueOnce(new Error('Drive is full.'));

    await expect(
      attachDocumentImages(
        quiz([
          question({ id: 'q1', stimulusIds: ['img-1'] }),
          question({ id: 'q2', stimulusIds: ['img-2'] }),
        ]),
        [image('img-1'), image('img-2')],
        uploader({ upload, remove })
      )
    ).rejects.toThrow('Drive is full.');

    // Half a quiz's pictures left in Drive with nothing pointing at them is
    // litter the teacher would have to find and delete by hand.
    expect(remove).toHaveBeenCalledWith('drive-img-1');
  });

  it('still reports the upload failure when the cleanup also fails', async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ driveFileId: 'drive-img-1', url: 'u' })
      .mockRejectedValueOnce(new Error('Drive is full.'));

    await expect(
      attachDocumentImages(
        quiz([
          question({ id: 'q1', stimulusIds: ['img-1'] }),
          question({ id: 'q2', stimulusIds: ['img-2'] }),
        ]),
        [image('img-1'), image('img-2')],
        uploader({
          upload,
          remove: vi.fn(() => Promise.reject(new Error('Delete denied.'))),
        })
      )
    ).rejects.toThrow('Drive is full.');
  });
});

describe('attachDocumentImages — shared passages (R25)', () => {
  const passage = {
    id: 'passage-1',
    type: 'text' as const,
    url: '',
    text: 'A fox lived by the wood.',
    label: 'Passage 1',
    readAloudSource: 'text' as const,
  };

  it('keeps a passage pointer beside an uploaded picture', async () => {
    const result = await attachDocumentImages(
      quiz([question({ stimulusIds: ['passage-1', 'img-1'] })], [passage]),
      [image('img-1')],
      uploader()
    );
    expect(result.questions[0].stimulusIds?.[0]).toBe('passage-1');
    expect(result.questions[0].stimulusIds).toHaveLength(2);
    expect(result.stimuli).toHaveLength(2);
  });

  it('keeps a passage when there are no pictures, and drops one nothing uses', async () => {
    const unused = { ...passage, id: 'passage-2' };
    const result = await attachDocumentImages(
      quiz([question({ stimulusIds: ['passage-1'] })], [passage, unused]),
      [],
      uploader()
    );
    expect(result.questions[0].stimulusIds).toEqual(['passage-1']);
    expect(result.stimuli?.map((s) => s.id)).toEqual(['passage-1']);
  });
});
