import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteField, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import type { TourAnchorId } from '@/config/tourAnchors';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import {
  claudeEditStamps,
  findNewClaudeEdits,
  isFullScreenWindow,
} from '@/utils/claudeBoardActivity';
import { logError } from '@/utils/logError';
import { viewAsSuppressesBackgroundWrites } from '@/utils/viewAsTab';

const showTourId = 'board.claude-editing-show' satisfies TourAnchorId;
// One toast per board while Claude works through a run of edits.
const TOAST_REPEAT_MS = 90_000;
// Let the window settle after entering full screen before measuring it.
const SCREEN_SETTLE_MS = 1000;

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
};
const isTabVisible = () => document.visibilityState === 'visible';

/** "Claude is editing" toast, clearing the Boards list badge on open, and recording the full-screen shape (AI boards D7, D11, D24). */
export const useClaudeBoardActivity = (): void => {
  const { t } = useTranslation();
  const { user, canAccessFeature } = useAuth();
  const { dashboards, activeDashboard, loading, addToast, loadDashboard } =
    useDashboard();
  // Optional call: many useAuth test doubles leave canAccessFeature out.
  const enabled = canAccessFeature?.('ai-boards') === true;
  const uid = user?.uid;
  const canWrite =
    Boolean(uid) && !isAuthBypass && !viewAsSuppressesBackgroundWrites();
  const activeId = activeDashboard?.id ?? null;
  const visible = useSyncExternalStore(subscribeVisibility, isTabVisible);

  const stampsRef = useRef<Map<string, number> | null>(null);
  const lastToastAtRef = useRef(new Map<string, number>());
  useEffect(() => {
    if (!enabled || loading) {
      stampsRef.current = null;
      return;
    }
    const previous = stampsRef.current;
    stampsRef.current = claudeEditStamps(dashboards);
    if (!previous) return;
    const now = Date.now();
    const board = findNewClaudeEdits(previous, dashboards, activeId, now).find(
      (b) => now - (lastToastAtRef.current.get(b.id) ?? 0) > TOAST_REPEAT_MS
    );
    if (!board) return;
    lastToastAtRef.current.set(board.id, now);
    addToast(
      t('claudeBoards.editingToast', {
        name: board.name,
        defaultValue: 'Claude is editing {{name}}',
      }),
      'info',
      {
        label: t('claudeBoards.show', { defaultValue: 'Show' }),
        onClick: () => loadDashboard(board.id),
        tourId: showTourId,
      }
    );
  }, [enabled, loading, dashboards, activeId, addToast, loadDashboard, t]);

  // Opening the board is what clears its badge; keyed by stamp so a later Claude edit clears again.
  const clearedRef = useRef(new Set<string>());
  const unseenKey =
    activeDashboard?.claudeUnseen === true
      ? `${activeDashboard.id}:${activeDashboard.claudeEditedAt ?? 0}`
      : null;
  useEffect(() => {
    // A background tab hasn't shown the board to anyone yet.
    if (!enabled || !canWrite || !uid || !activeId || !unseenKey || !visible)
      return;
    if (clearedRef.current.has(unseenKey)) return;
    clearedRef.current.add(unseenKey);
    updateDoc(doc(db, 'users', uid, 'dashboards', activeId), {
      claudeUnseen: deleteField(),
    }).catch((err: unknown) => {
      clearedRef.current.delete(unseenKey);
      logError('useClaudeBoardActivity.clearUnseen', err, {
        uid,
        boardId: activeId,
      });
    });
  }, [enabled, canWrite, uid, activeId, unseenKey, visible]);

  // Last full-screen size this tab wrote, so a resize that lands on the same shape writes nothing.
  const recordedRef = useRef<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!enabled || !canWrite || !uid) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const record = () => {
      if (!isFullScreenWindow()) return;
      const w = Math.round(window.innerWidth);
      const h = Math.round(window.innerHeight);
      if (w < 320 || h < 240) return;
      const last = recordedRef.current;
      if (last?.w === w && last.h === h) return;
      recordedRef.current = { w, h };
      setDoc(
        doc(db, 'users', uid, 'userProfile', 'profile'),
        { boardScreen: { w, h, at: Date.now() } },
        { merge: true }
      ).catch((err: unknown) => {
        recordedRef.current = last;
        logError('useClaudeBoardActivity.recordScreen', err, { uid });
      });
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(record, SCREEN_SETTLE_MS);
    };
    schedule();
    document.addEventListener('fullscreenchange', schedule);
    window.addEventListener('resize', schedule);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('fullscreenchange', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [enabled, canWrite, uid]);
};
