import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import {
  freshTourPictureUrl,
  tourThumbnail,
} from '@/components/widgets/GuidedLearning/utils/liveTour';
import { liveTourStepsOf } from '@/components/tours/tourSession';
import type { FracRect } from '@/components/tours/web/pictureTarget';
import type { StepsViewStep } from './stepsModel';

const hasList = (v: unknown): boolean => Array.isArray(v) && v.length > 0;

const targetOf = (thumb: ReturnType<typeof tourThumbnail>): FracRect | null => {
  const t = thumb?.target;
  return t && t.w > 0 && t.h > 0 ? t : null;
};

/** A Live tour's steps as the Steps view draws them, with each step's thumbnail (or legacy slide) as its picture. */
export function stepsFromLiveTour(set: GuidedLearningSet): {
  steps: StepsViewStep[];
  /** Each step's picture address, by step id. */
  urls: Record<string, string>;
} {
  const urls: Record<string, string> = {};
  const steps = liveTourStepsOf(set).map((step: GuidedLearningStep) => {
    const url = freshTourPictureUrl(step, set) ?? undefined;
    const thumb = tourThumbnail(step);
    if (url) urls[step.id] = url;
    return {
      id: step.id,
      title: step.label ?? '',
      text: step.text ?? '',
      onlyIfAppears: hasList(step.tour?.showWhen),
      observe: step.tour?.action === 'observe',
      picture: url
        ? {
            w: thumb?.w ?? 0,
            h: thumb?.h ?? 0,
            cssW: thumb?.w ?? 0,
            target: targetOf(thumb),
          }
        : null,
    };
  });
  return { steps, urls };
}
