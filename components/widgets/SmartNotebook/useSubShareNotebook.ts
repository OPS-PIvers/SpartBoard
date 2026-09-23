import { useInSubShare, useShareContent } from '@/hooks/useShareContent';
import type { NotebookItem, SubShareNotebookPayload } from '@/types';

export interface SubShareNotebook {
  /** False everywhere but `/subs`, where the caller must use this instead. */
  active: boolean;
  notebook: NotebookItem | null;
  loading: boolean;
}

/**
 * The notebook a Smart Notebook widget is open on, inside a sub share.
 *
 * The sub is a different signed-in user, so the ordinary subscription reads
 * their own (empty) library and would never find the teacher's notebook.
 */
export function useSubShareNotebook(
  activeNotebookId: string | null | undefined
): SubShareNotebook {
  const inShare = useInSubShare();
  const bundled = useShareContent<SubShareNotebookPayload>(
    'notebook',
    activeNotebookId
  );
  return {
    // Not `status !== 'off'`: a widget with no notebook chosen reads 'off'
    // inside a share too, and must still not show the sub their own library.
    active: inShare,
    notebook: bundled.payload?.notebook ?? null,
    loading: bundled.status === 'loading',
  };
}
