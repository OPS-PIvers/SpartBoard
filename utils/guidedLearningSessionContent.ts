import type { GuidedLearningSession } from '@/types';

export const GL_CONTENT_COLLECTION = 'content';
export const GL_CONTENT_DOC = 'steps';

/** `guided_learning_sessions/{id}/content/steps`: what a per-period session hides until the period opens. */
export type GuidedLearningSessionContent = Pick<
  GuidedLearningSession,
  'publicSteps' | 'imageUrls' | 'imageKinds' | 'videoTrims'
>;

/** Folds the content doc into a per-period session; other sessions pass through unchanged. */
export function mergeGuidedLearningSessionContent<
  T extends GuidedLearningSession,
>(session: T, content: GuidedLearningSessionContent | null): T {
  if (!session.stepsInContent || !content) return session;
  return {
    ...session,
    publicSteps: Array.isArray(content.publicSteps) ? content.publicSteps : [],
    imageUrls: Array.isArray(content.imageUrls) ? content.imageUrls : [],
    ...(content.imageKinds ? { imageKinds: content.imageKinds } : {}),
    ...(content.videoTrims ? { videoTrims: content.videoTrims } : {}),
  };
}
