import type { TourMarkupShape } from '@/types';
import type { WebTourStep } from '@/components/widgets/GuidedLearning/utils/liveTour';
import {
  stagePlacement,
  type FracRect,
} from '@/components/tours/web/pictureTarget';

/** Where a step's target sits in its picture; the same numbers whether the picture came from Storage or a function. */
export interface StepsPicture {
  w: number;
  h: number;
  /** The picture's width in CSS pixels when taken, which sets how big the tour's chrome is drawn against it. */
  cssW: number;
  /** The target as 0-1 fractions of the picture, or null when it can't be placed with confidence. */
  target: FracRect | null;
  /** Arrows, boxes and numbers drawn over the picture, in 0-1 of its size. */
  markup?: readonly TourMarkupShape[];
}

/** One step as the Steps view draws it. Nothing here reads Firestore or Storage. */
export interface StepsViewStep {
  id: string;
  title: string;
  text: string;
  /** The step has a show condition, so only some people see it. */
  onlyIfAppears: boolean;
  /** Set when the learner presses Next themselves, as the tour does. */
  observe: boolean;
  /** Null when the step has no picture at all. */
  picture: StepsPicture | null;
}

export type StepPictureState =
  | { status: 'loading' }
  | { status: 'ready'; src: string }
  | { status: 'failed' };

export type StepPictures = Readonly<Record<string, StepPictureState>>;

/** The view's words, so a host without the app's translations (the extension panel) can pass its own. */
export interface StepsLabels {
  article: string;
  walkthrough: string;
  viewLabel: string;
  print: string;
  stepNumber: (n: number) => string;
  onlyIfAppears: string;
  untitledStep: string;
  pictureAlt: (n: number) => string;
  pictureLoading: string;
  noPicture: string;
  pictureFailed: string;
  empty: string;
  loading: string;
}

export const STEPS_LABELS_EN: StepsLabels = {
  article: 'Steps',
  walkthrough: 'Walk through',
  viewLabel: 'View',
  print: 'Print',
  stepNumber: (n) => `Step ${n}`,
  onlyIfAppears: 'Only if it appears',
  untitledStep: 'Untitled step',
  pictureAlt: (n) => `Picture of step ${n}`,
  pictureLoading: 'Loading picture',
  noPicture: 'No picture for this step',
  pictureFailed: "The picture couldn't load",
  empty: 'This tour has no steps yet.',
  loading: 'Loading steps',
};

/** A step condition: one test, or a list of them. */
export const hasCondition = (v: unknown): boolean =>
  Array.isArray(v) ? v.length > 0 : !!v && typeof v === 'object';

/** A web tour's steps as the Steps view draws them; the ring comes from the recorded place, else an estimate that passes its checks. */
export function stepsFromWebTour(
  steps: readonly WebTourStep[]
): StepsViewStep[] {
  return steps.map((step) => {
    const pic = step.web.picture;
    const placed = pic ? stagePlacement(pic, step.web.locator) : null;
    return {
      id: step.id,
      title: step.label ?? '',
      text: step.text ?? '',
      onlyIfAppears: hasCondition(step.web.showWhen),
      observe: step.web.action === 'observe',
      picture:
        pic && placed && pic.w > 0 && pic.h > 0
          ? {
              w: pic.w,
              h: pic.h,
              cssW: placed.cssW,
              target: placed.rect,
              ...(pic.markup?.length ? { markup: pic.markup } : {}),
            }
          : null,
    };
  });
}
