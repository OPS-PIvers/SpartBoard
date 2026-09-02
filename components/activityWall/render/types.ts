import type {
  ActivityWallAppearance,
  ActivityWallSession,
  ActivityWallSubmission,
} from '@/types';

/** Where the wall is being rendered; drives sizing units and teacher affordances. */
export type WallRenderMode = 'widget' | 'gallery' | 'teacher';

/** Placement fields a teacher drag can change; `null` clears the field and consumers must translate it to `deleteField()`. */
export interface WallMovePatch {
  sectionId?: string | null;
  cellKey?: string | null;
  order?: number;
}

/** Teacher-only callbacks; ignored outside `teacher` mode. */
export interface WallRenderActions {
  onMove?: (submissionId: string, patch: WallMovePatch) => void;
  onPin?: (submissionId: string, pinned: boolean) => void;
  onEdit?: (submissionId: string) => void;
  onDelete?: (submissionId: string) => void;
  onApprove?: (submissionId: string) => void;
  onReject?: (submissionId: string) => void;
}

/** Props shared by `LayoutRouter` and every layout component. */
export interface WallRenderProps extends WallRenderActions {
  session: ActivityWallSession;
  submissions: ActivityWallSubmission[];
  mode: WallRenderMode;
  appearance?: ActivityWallAppearance;
  showNames: boolean;
}
