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
  /** Quick-insert comments offered in the comment popover. */
  snippets?: readonly string[];
}

export type MarkupTool =
  'select' | 'highlight' | 'rect' | 'ellipse' | 'stamp' | 'pin';

export type DrawTool = Extract<MarkupTool, 'highlight' | 'rect' | 'ellipse'>;
