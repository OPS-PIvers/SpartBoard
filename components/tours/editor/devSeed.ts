import type { TourPublishStatus } from '@/components/tours/tourSnapshot';

/** Header states the dummy backend can't reach, set by screenshot scripts before the editor opens. */
export interface TourEditorDevSeed {
  publish?: TourPublishStatus;
  checkNeeded?: boolean;
}

declare global {
  interface Window {
    __tourEditorDevSeed?: TourEditorDevSeed;
  }
}

/** Dev builds only; always null in production. */
export const tourEditorDevSeed = (): TourEditorDevSeed | null =>
  import.meta.env.DEV && typeof window !== 'undefined'
    ? (window.__tourEditorDevSeed ?? null)
    : null;
