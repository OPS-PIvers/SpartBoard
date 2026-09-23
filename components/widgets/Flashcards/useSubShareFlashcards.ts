import { useInSubShare, useShareContent } from '@/hooks/useShareContent';
import type {
  SubShareFlashcardPayload,
  SubShareFlashcardSetView,
} from '@/types';

export interface SubShareFlashcards {
  /** False everywhere but `/subs`, where the caller must use this instead. */
  active: boolean;
  set: SubShareFlashcardSetView | null;
  loading: boolean;
}

/**
 * The set a Flashcards widget was presenting, inside a sub share.
 *
 * The sets live in the teacher's `users/` tree, so a substitute can read
 * neither the set nor the library listing it came from. The presented set is
 * bundled at share time; assigning it to students waits for the launch work
 * in PR 4 (D8).
 */
export function useSubShareFlashcards(
  setId: string | null | undefined
): SubShareFlashcards {
  const inShare = useInSubShare();
  const bundled = useShareContent<SubShareFlashcardPayload>(
    'flashcards',
    setId
  );
  return {
    active: inShare,
    set: bundled.payload?.set ?? null,
    loading: bundled.status === 'loading',
  };
}
