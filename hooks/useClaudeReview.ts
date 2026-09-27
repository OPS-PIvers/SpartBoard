/** "Review before assigning" for Claude-made items: badge, clear-on-open and a confirm before students see it. */
import { useEffect, useMemo, useState } from 'react';
import { deleteField, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  CLAUDE_REVIEW_REMINDERS_SETTINGS_DOC,
  DEFAULT_CLAUDE_REVIEW_REMINDERS_SETTINGS,
  normalizeClaudeReviewRemindersSettings,
} from '@/config/claudeReviewReminders';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useInSubShare } from '@/hooks/useShareContent';
import type { LibraryBadge } from '@/components/common/library/types';
import {
  CLAUDE_REVIEW_FIELD,
  isClaudeReviewPending,
  type ClaudeReviewable,
} from '@/utils/claudeReview';

export type ClaudeReviewCollection =
  | 'quizzes'
  | 'video_activities'
  | 'flashcard_sets'
  | 'activity_wall_activities'
  | 'miniapps';

export function useClaudeReviewRemindersEnabled(active: boolean): boolean {
  const [enabled, setEnabled] = useState(
    DEFAULT_CLAUDE_REVIEW_REMINDERS_SETTINGS.enabled
  );
  useEffect(() => {
    if (!active) return;
    return onSnapshot(
      doc(db, 'admin_settings', CLAUDE_REVIEW_REMINDERS_SETTINGS_DOC),
      (snap) =>
        setEnabled(normalizeClaudeReviewRemindersSettings(snap.data()).enabled),
      // Unreadable doc: keep the safe default (reminders on).
      () => setEnabled(DEFAULT_CLAUDE_REVIEW_REMINDERS_SETTINGS.enabled)
    );
  }, [active]);
  return enabled;
}

export function useClaudeReview(collection: ClaudeReviewCollection) {
  const { user, canAccessFeature } = useAuth();
  const { showConfirm } = useDialog();
  // A substitute's shared view opens no teacher listeners and never shows the mark.
  const inShare = useInSubShare();
  const connector = !inShare && canAccessFeature('claude-connector');
  const reminders = useClaudeReviewRemindersEnabled(connector);
  const active = connector && reminders;
  const uid = user?.uid;

  return useMemo(() => {
    const needsReview = (item: ClaudeReviewable) =>
      active && isClaudeReviewPending(item);
    const confirmUse = async (
      item: ClaudeReviewable & { title?: string },
      confirmLabel = 'Assign anyway'
    ): Promise<boolean> => {
      if (!needsReview(item)) return true;
      return showConfirm(
        `Claude made or changed "${item.title ?? 'this item'}" and you haven't opened it since. Check it before students see it.`,
        { title: 'Review before assigning', variant: 'warning', confirmLabel }
      );
    };
    return {
      needsReview,
      badge: (
        item: ClaudeReviewable,
        onOpen?: () => void
      ): LibraryBadge | null =>
        needsReview(item)
          ? {
              label: 'Review before assigning',
              tone: 'warn',
              ...(onOpen
                ? { actionLabel: 'Open to review', onClick: onOpen }
                : {}),
            }
          : null,
      /** Resolves true when the item may go to students now. */
      confirmUse,
      /** Runs `go` right away for an unmarked item, or after the teacher confirms a marked one. */
      whenReviewed: (
        item: ClaudeReviewable & { title?: string },
        go: () => void,
        confirmLabel?: string
      ): void => {
        if (!needsReview(item)) {
          go();
          return;
        }
        void confirmUse(item, confirmLabel).then((ok) => {
          if (ok) go();
        });
      },
      /** Clears the mark when the teacher opens the item's editor. */
      markReviewed: (item: ClaudeReviewable & { id: string }) => {
        if (!uid || !isClaudeReviewPending(item)) return;
        updateDoc(doc(db, 'users', uid, collection, item.id), {
          [CLAUDE_REVIEW_FIELD]: deleteField(),
        }).catch((err: unknown) =>
          console.warn('[claudeReview] could not clear mark', err)
        );
      },
    };
  }, [active, uid, collection, showConfirm]);
}
