import type { GuidedLearningSet, WebTourPicture } from '@/types';
import {
  listWebTourDrafts,
  loadWebTourDraft,
  saveWebTourDraft,
  uploadWebTourPicture,
} from '@/components/tours/webTours';
import { newWebTour, pictureBlob, toWebStep } from './recordedSteps';
import {
  MAX_GOAL_CHARS,
  type IntakeDraft,
  type IntakeTarget,
  type RecordedWebStep,
} from './recorderProtocol';
import { scrubCapturedText } from './studentData';

/** Uploads a recorded step's picture into the set's folder; undefined when it has none. */
export async function uploadRecordedPicture(
  recorded: RecordedWebStep,
  setId: string
): Promise<WebTourPicture | undefined> {
  const blob = recorded.picture ? pictureBlob(recorded.picture.dataUrl) : null;
  if (!blob || !recorded.picture) return undefined;
  const path = await uploadWebTourPicture(setId, blob, 'image/jpeg');
  const { w, h, target, cssW, original } = recorded.picture;
  // The uncropped screen goes in its own file, for re-cropping in the editor; a failed upload just leaves it out.
  const full = original ? pictureBlob(original.dataUrl) : null;
  const originalPath = full
    ? await uploadWebTourPicture(setId, full, 'image/jpeg').catch(() => null)
    : null;
  return {
    path,
    w,
    h,
    ...(target ? { target: { ...target } } : {}),
    ...(cssW ? { cssW } : {}),
    ...(original && originalPath
      ? {
          original: {
            path: originalPath,
            w: original.w,
            h: original.h,
            crop: { ...original.crop },
          },
        }
      : {}),
  };
}

/** The draft a job writes to: a new one with the job's title, or the existing one; null when it is gone. */
export async function intakeDraftFor(
  target: IntakeTarget
): Promise<GuidedLearningSet | null> {
  if (target.kind === 'append') return loadWebTourDraft(target.setId);
  const goal = scrubCapturedText(target.goal, MAX_GOAL_CHARS);
  const set: GuidedLearningSet = {
    ...newWebTour(),
    title: target.title.trim() || 'Untitled web tour',
    ...(goal ? { webGoal: goal } : {}),
  };
  await saveWebTourDraft(set);
  return set;
}

/** Appends recorded steps one at a time, saving after each, so `onSaved` only reports what is stored. */
export async function appendRecordedSteps(
  set: GuidedLearningSet,
  steps: readonly RecordedWebStep[],
  onSaved: (stepId: string) => void
): Promise<GuidedLearningSet> {
  let current = set;
  for (const recorded of steps) {
    // A step sent again after a lost ack is already here.
    if (!current.steps.some((s) => s.id === recorded.id)) {
      const picture = await uploadRecordedPicture(recorded, current.id);
      current = {
        ...current,
        steps: [...current.steps, toWebStep(recorded, picture)],
      };
      await saveWebTourDraft(current);
    }
    onSaved(recorded.id);
  }
  return current;
}

/** The author's web tour drafts for the side panel's picker, most recently changed first. */
export async function intakeDrafts(): Promise<IntakeDraft[]> {
  const drafts = await listWebTourDrafts();
  return drafts
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, 200)
    .map((d) => ({ setId: d.id, title: d.title.slice(0, 200) }));
}
