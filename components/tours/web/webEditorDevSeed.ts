import type { TourPublishStatus } from '@/components/tours/tourSnapshot';
import type { GuidedLearningSet } from '@/types';
import type { WritingRequestStep, WritingResult } from './writeWithClaude';

/** Web editor states the dummy backend can't reach, set by the `/web-tour-editor-dev` harness. */
export interface WebTourEditorDevSeed {
  publish?: TourPublishStatus;
  canCheck?: boolean;
  canFix?: boolean;
  checking?: boolean;
  /** Answers Write with Claude in place of the server. */
  writing?: (requests: WritingRequestStep[]) => WritingResult;
  /** No backend: uploads go into `pictures` and draft saves succeed at once. */
  offline?: boolean;
  /** The published copy, for what changed since publish. */
  publishedSet?: GuidedLearningSet;
  /** Step pictures by Storage path, standing in for Storage reads. */
  pictures?: Record<string, Blob>;
}

declare global {
  interface Window {
    __webTourEditorDevSeed?: WebTourEditorDevSeed;
  }
}

/** Dev builds only; always null in production. */
export const webTourEditorDevSeed = (): WebTourEditorDevSeed | null =>
  import.meta.env.DEV && typeof window !== 'undefined'
    ? (window.__webTourEditorDevSeed ?? null)
    : null;
