import { useEffect, useState } from 'react';
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import type { QuizSession } from '@/types';
import { getServerNow, syncServerTime } from '@/utils/serverTime';
import { logError } from '@/utils/logError';
import { DEFAULT_GAME_MINUTES } from '@/utils/reviewLaunch';
import {
  addGameTimePatch,
  readGameClock,
  resumedEndsAt,
  startGamePatch,
} from '@/utils/quizGame';

/** Start, Pause/Resume and +1 min for a self-paced Review game (plan D22). */
export function useGameClockControls(
  session: QuizSession,
  enabled: boolean,
  onError: (message: string) => void
) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (enabled) syncServerTime(auth.currentUser?.uid);
  }, [enabled]);

  const write = async (patch: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'quiz_sessions', session.id), patch);
    } catch (err) {
      logError('useGameClockControls.write', err, { sessionId: session.id });
      onError('Could not update the game clock. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    write(
      startGamePatch(session, getServerNow(), DEFAULT_GAME_MINUTES * 60_000)
    );
  const togglePause = async () => {
    const at = getServerNow();
    if (readGameClock(session, at).phase !== 'paused') {
      await write({ gamePausedAt: at });
      return;
    }
    const endsAt = resumedEndsAt(session, at);
    if (endsAt !== null)
      await write({ gameEndsAt: endsAt, gamePausedAt: deleteField() });
  };
  const addMinute = async () => {
    const patch = addGameTimePatch(session, getServerNow());
    if (patch) await write(patch);
  };

  return { busy, start, togglePause, addMinute };
}
