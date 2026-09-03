import type { ReactNode } from 'react';
import type { WallCardStyle, WallImageSize } from './imageSize';
import type {
  ActivityWallAppearance,
  ActivityWallSession,
  ActivityWallSubmission,
} from '@/types';

/** Where the wall is being rendered; drives sizing units and teacher affordances. */
export type WallRenderMode = 'widget' | 'gallery' | 'teacher' | 'student';

/** Placement a hover-plus spot pre-fills for the composer; empty for layouts without structure. */
export interface WallPlacement {
  sectionId?: string;
  cellKey?: string;
  order?: number;
  lat?: number;
  lng?: number;
}

/** Placement fields a teacher drag can change; `null` clears the field and consumers must translate it to `deleteField()`. */
export interface WallMovePatch {
  sectionId?: string | null;
  cellKey?: string | null;
  order?: number;
}

/** Teacher callbacks; supplying one enables its affordance in `widget` and `teacher` mode, never in `gallery`. */
export interface WallRenderActions {
  onMove?: (submissionId: string, patch: WallMovePatch) => void;
  onPin?: (submissionId: string, pinned: boolean) => void;
  onEdit?: (submissionId: string) => void;
  onDelete?: (submissionId: string) => void;
  onApprove?: (submissionId: string) => void;
  onReject?: (submissionId: string) => void;
  /** Hover-plus spots render when supplied (student and widget modes); receives the spot's placement. */
  onAddAt?: (placement: WallPlacement) => void;
  /** Viewer uid; own posts get student affordances (pending badge, edit/delete) in student mode. */
  viewerUid?: string;
  /** Fired when a submission's media (photo/video/file) fails to load, in any mode. */
  onMediaError?: (submission: ActivityWallSubmission) => void;
  /** Gallery-only footer rendered inside each card (likes / comments). */
  renderFooter?: (submission: ActivityWallSubmission) => ReactNode;
}

/** Props shared by `LayoutRouter` and every layout component. */
export interface WallRenderProps extends WallRenderActions {
  session: ActivityWallSession;
  submissions: ActivityWallSubmission[];
  mode: WallRenderMode;
  appearance?: ActivityWallAppearance;
  showNames: boolean;
  /** Photo cap on submission cards; defaults to medium. */
  imageSize?: WallImageSize;
  /** Teacher-chosen card surface and text color; widget face only. */
  cardStyle?: WallCardStyle;
}
