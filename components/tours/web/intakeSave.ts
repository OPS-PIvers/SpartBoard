import type { GuidedLearningSet, WebTourPicture } from '@/types';
import {
  listWebTourDrafts,
  loadWebTourDraft,
  saveWebTourDraft,
  uploadWebTourPicture,
} from '@/components/tours/webTours';
import { newWebTour, pictureBlob, toWebStep } from './recordedSteps';
import type {
  IntakeDraft,
  IntakeTarget,
  RecordedWebStep,
} from './recorderProtocol';

/** Uploads a recorded step's picture into the set's folder; undefined when it has none. */
export async function uploadRecordedPicture(
  recorded: RecordedWebStep,
  setId: string
): Promise<WebTourPicture | undefined> {
  const blob = recorded.picture ? pictureBlob(recorded.picture.dataUrl) : null;
  if (!blob || !recorded.picture) return undefined;
  const path = await uploadWebTourPicture(setId, blob, 'image/jpeg');
  return { path, w: recorded.picture.w, h: recorded.picture.h };
}

/** The draft a job writes to: a new one with the job's title, or the existing one; null when it is gone. */
export async function intakeDraftFor(
  target: IntakeTarget
): Promise<GuidedLearningSet | null> {
  if (target.kind === 'append') return loadWebTourDraft(target.setId);
  const set: GuidedLearningSet = {
    ...newWebTour(),
    title: target.title.trim() || 'Untitled web tour',
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
