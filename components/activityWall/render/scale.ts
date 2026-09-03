import type { ActivityWallSubmission } from '@/types';
import type { WallRenderMode } from './types';

/** Font/spacing tokens per render mode: `cqmin` on the widget face, viewport units elsewhere. */
export interface WallScale {
  title: string;
  body: string;
  meta: string;
  heading: string;
  icon: string;
  gap: string;
  pad: string;
}

const WIDGET_SCALE: WallScale = {
  title: 'min(16px, 7cqmin)',
  body: 'min(14px, 5.5cqmin)',
  meta: 'min(10px, 3.5cqmin)',
  heading: 'min(12px, 4.5cqmin)',
  icon: 'min(20px, 6cqmin)',
  gap: 'min(10px, 2.5cqmin)',
  pad: 'min(10px, 2.5cqmin)',
};

const GALLERY_SCALE: WallScale = {
  title: 'clamp(16px, 1.5vw, 24px)',
  body: 'clamp(14px, 1.2vw, 20px)',
  meta: 'clamp(11px, 0.9vw, 14px)',
  heading: 'clamp(13px, 1vw, 18px)',
  icon: 'clamp(18px, 1.6vw, 28px)',
  gap: 'clamp(10px, 1vw, 18px)',
  pad: 'clamp(10px, 1vw, 18px)',
};

const TEACHER_SCALE: WallScale = {
  title: '16px',
  body: '14px',
  meta: '11px',
  heading: '13px',
  icon: '18px',
  gap: '12px',
  pad: '12px',
};

/** Sizing tokens for a render mode. */
export const wallScale = (mode: WallRenderMode): WallScale =>
  mode === 'widget'
    ? WIDGET_SCALE
    : mode === 'gallery' || mode === 'student'
      ? GALLERY_SCALE
      : TEACHER_SCALE;

/** Pending posts are teacher-only; the student page already holds only the viewer's own pending posts. */
export const visibleSubmissions = (
  submissions: ActivityWallSubmission[],
  mode: WallRenderMode
): ActivityWallSubmission[] =>
  mode === 'teacher' || mode === 'student'
    ? submissions
    : submissions.filter((submission) => submission.status !== 'pending');

/** Pinned first, then newest-last by submission time. */
export const sortForDisplay = (
  submissions: ActivityWallSubmission[]
): ActivityWallSubmission[] =>
  [...submissions].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return a.submittedAt - b.submittedAt;
  });

/** Timeline ordering: pinned first, then explicit `order`, then submission time. */
export const sortForTimeline = (
  submissions: ActivityWallSubmission[]
): ActivityWallSubmission[] =>
  [...submissions].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    const orderA = typeof a.order === 'number' ? a.order : a.submittedAt;
    const orderB = typeof b.order === 'number' ? b.order : b.submittedAt;
    return orderA - orderB;
  });

/** Prepared list for a layout: pending filtered by mode, pinned first. */
export const prepareSubmissions = (
  submissions: ActivityWallSubmission[],
  mode: WallRenderMode
): ActivityWallSubmission[] =>
  sortForDisplay(visibleSubmissions(submissions, mode));
