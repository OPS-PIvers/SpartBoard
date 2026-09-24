/**
 * Turns the pictures a Word test carried into quiz stimuli
 * (docs/plans/QUIZ_DOCUMENT_IMPORT.md D13, D14).
 *
 * Between the read and the save, a question's `stimulusIds` hold the
 * reader's own image ids. This swaps them for the ids of real uploaded
 * stimuli, and it runs at save rather than at read so a teacher who backs
 * out of the wizard leaves nothing behind in their Drive.
 */

import type { QuizData, QuizQuestion, QuizStimulus } from '@/types';
import type { ExtractedImage } from './types';

/** Puts one picture somewhere students can open it, and takes it back. */
export interface StimulusUploader {
  /** Resolves with the stored file's Drive id and viewable URL. */
  upload: (
    image: ExtractedImage
  ) => Promise<{ driveFileId: string; url: string }>;
  /** Best-effort delete, used to clean up after a failed batch. */
  remove: (driveFileId: string) => Promise<void>;
}

/** The reader's image ids that questions still point at. */
function referencedImageIds(quiz: QuizData): Set<string> {
  const ids = new Set<string>();
  for (const q of quiz.questions) {
    for (const id of q.stimulusIds ?? []) ids.add(id);
  }
  return ids;
}

/** Stimuli already on the quiz (a shared passage), which no upload replaces. */
const existingIds = (quiz: QuizData): Set<string> =>
  new Set((quiz.stimuli ?? []).map((s) => s.id));

/** Keeps only pointers in `keep`, dropping a passage whose questions were all unticked. */
function pruneStimuli(quiz: QuizData, keep: ReadonlySet<string>): QuizData {
  const questions = quiz.questions.map((q): QuizQuestion => {
    const ids = (q.stimulusIds ?? []).filter((id) => keep.has(id));
    if (ids.length === 0) {
      const { stimulusIds: _drop, ...rest } = q;
      return rest;
    }
    return { ...q, stimulusIds: ids };
  });
  const used = new Set(questions.flatMap((q) => q.stimulusIds ?? []));
  const stimuli = (quiz.stimuli ?? []).filter(
    (s) => s.type !== 'text' || used.has(s.id)
  );
  const { stimuli: _old, ...rest } = quiz;
  return {
    ...rest,
    questions,
    ...(stimuli.length > 0 ? { stimuli } : {}),
  };
}

/** Drops pointers to pictures that are not becoming stimuli. */
function withoutStimulusIds(quiz: QuizData): QuizData {
  return pruneStimuli(quiz, existingIds(quiz));
}

/**
 * Upload the pictures the surviving questions use and point those questions
 * at them. A picture two questions share is uploaded once and linked twice
 * (D14). Questions the teacher unticked in the review table are already gone
 * from `quiz`, so their pictures are never uploaded.
 *
 * Throws if any upload fails, having first removed the ones that succeeded —
 * a half-attached quiz is worse than none, and the teacher can retry.
 */
export async function attachDocumentImages(
  quiz: QuizData,
  images: readonly ExtractedImage[],
  uploader: StimulusUploader
): Promise<QuizData> {
  const wanted = referencedImageIds(quiz);
  const toUpload = images.filter((img) => wanted.has(img.id));
  if (toUpload.length === 0) return withoutStimulusIds(quiz);

  const stimulusIdByImageId = new Map<string, string>();
  const stimuli: QuizStimulus[] = [];
  const uploaded: string[] = [];

  try {
    for (const image of toUpload) {
      const { driveFileId, url } = await uploader.upload(image);
      uploaded.push(driveFileId);
      const stimulus: QuizStimulus = {
        id: crypto.randomUUID(),
        type: 'image',
        url,
        driveFileId,
        label: image.name,
      };
      stimuli.push(stimulus);
      stimulusIdByImageId.set(image.id, stimulus.id);
    }
  } catch (error) {
    await Promise.all(
      uploaded.map((id) => uploader.remove(id).catch(() => undefined))
    );
    throw error;
  }

  const keep = existingIds(quiz);
  const withUploads: QuizData = {
    ...quiz,
    stimuli: [...(quiz.stimuli ?? []), ...stimuli],
    questions: quiz.questions.map((q) => ({
      ...q,
      stimulusIds: (q.stimulusIds ?? []).map(
        (id) => stimulusIdByImageId.get(id) ?? id
      ),
    })),
  };
  // A pointer with no upload behind it would dangle, so only the ids
  // that actually became stimuli survive.
  for (const id of stimulusIdByImageId.values()) keep.add(id);
  return pruneStimuli(withUploads, keep);
}
