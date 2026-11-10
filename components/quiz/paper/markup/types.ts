import type { ReactNode } from 'react';
import type { PaperMarkupItem } from '@/types';
import type { PaperAnswerBoxState } from './usePaperAnswerBox';

/** What the grader hands the crop panel to turn the markup editor on. */
export interface PaperMarkupBinding {
  items: readonly PaperMarkupItem[];
  onChange: (next: PaperMarkupItem[]) => void;
  /** Where the answer printed; the editor stays disabled until it is ready. */
  box: PaperAnswerBoxState;
  /** Any press in the editor, so the grader can hold off auto-advance. */
  onActivity?: () => void;
  /** Marks are drawn but the grade needs a score before they save. */
  needsScore?: boolean;
  /** Shown above the image, for the earlier-scan notice. */
  notice?: ReactNode;
  /** The teacher's saved comments; omitted, the editor has no snippets. */
  savedComments?: SavedMarkupComments;
  /** Marks made on an earlier scan: the editor shows the notice with these actions. */
  earlierScan?: { onLooksRight: () => void };
}

/** The teacher's reusable comments, kept on their profile and never on a grade. */
export interface SavedMarkupComments {
  list: readonly string[];
  max: number;
  /** False when the text is empty, already saved, or the list is full. */
  add: (text: string) => boolean;
  remove: (text: string) => void;
  /** Puts a removed comment back where it was. */
  restore: (text: string, index: number) => void;
}

export type MarkupTool =
  'select' | 'highlight' | 'rect' | 'ellipse' | 'stamp' | 'pin';

export type DrawTool = Extract<MarkupTool, 'highlight' | 'rect' | 'ellipse'>;
