import type {
  GuidedLearningStep,
  TourMarkupShape,
  WebTourPicture,
} from '@/types';

// Shape geometry only, keys in a fixed order, so a Firestore round trip compares equal.
const shapeKey = (s: TourMarkupShape): string => {
  const r = (n: number) => Math.round(n * 10000) / 10000;
  switch (s.kind) {
    case 'arrow':
      return `a:${r(s.x1)},${r(s.y1)},${r(s.x2)},${r(s.y2)}`;
    case 'box':
      return `b:${r(s.x)},${r(s.y)},${r(s.w)},${r(s.h)}`;
    case 'number':
      return `n:${r(s.x)},${r(s.y)},${s.n}`;
  }
};

/** The markup as one comparable string; empty when there is none. */
export const markupKey = (markup: readonly TourMarkupShape[] | undefined) =>
  (markup ?? []).map(shapeKey).join(';');

/** Whether a learner would see a different picture: another file (a crop, blur, retake or replacement) or different markup. */
export function pictureChanged(
  before: WebTourPicture | undefined,
  after: WebTourPicture | undefined
): boolean {
  if (!before || !after) return !!before !== !!after;
  return (
    before.path !== after.path ||
    markupKey(before.markup) !== markupKey(after.markup)
  );
}

/** Whether this step's picture changed between two versions of the step (S6 and the publish check use it). */
export const stepPictureChanged = (
  before: GuidedLearningStep | undefined,
  after: GuidedLearningStep | undefined
): boolean => pictureChanged(before?.web?.picture, after?.web?.picture);

/** Step ids, in order, whose picture differs from the published copy's step of the same id. */
export function changedPictureSteps(
  draft: { steps: readonly GuidedLearningStep[] },
  published: { steps: readonly GuidedLearningStep[] } | null
): string[] {
  const before = new Map((published?.steps ?? []).map((s) => [s.id, s]));
  return draft.steps
    .filter((s) => !!s.web?.picture || !!before.get(s.id)?.web?.picture)
    .filter((s) => stepPictureChanged(before.get(s.id), s))
    .map((s) => s.id);
}
