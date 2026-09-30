import React, { useEffect, useState } from 'react';
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { Loader2, Pause, Play, Plus } from 'lucide-react';
import { auth, db } from '@/config/firebase';
import type { QuizSession } from '@/types';
import { useServerNow } from '@/hooks/useServerNow';
import { getServerNow, syncServerTime } from '@/utils/serverTime';
import { logError } from '@/utils/logError';
import { DEFAULT_GAME_MINUTES } from '@/utils/reviewLaunch';
import {
  addGameTimePatch,
  formatGameClock,
  readGameClock,
  resumedEndsAt,
  startGamePatch,
} from '@/utils/quizGame';

interface GameClockCardProps {
  session: QuizSession;
  joined: number;
  onError: (message: string) => void;
}

const iconSize = {
  width: 'min(14px, 4.5cqmin)',
  height: 'min(14px, 4.5cqmin)',
};

/** Start, +1 min and Pause for a self-paced Review game (plan D22); PR 5's board view replaces it. */
export const GameClockCard: React.FC<GameClockCardProps> = ({
  session,
  joined,
  onError,
}) => {
  const now = useServerNow(250);
  const clock = readGameClock(session, now);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    syncServerTime(auth.currentUser?.uid);
  }, []);

  const write = async (patch: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'quiz_sessions', session.id), patch);
    } catch (err) {
      logError('GameClockCard.write', err, { sessionId: session.id });
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
    if (clock.phase !== 'paused') {
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

  const label =
    clock.phase === 'waiting'
      ? 'Ready to start'
      : clock.phase === 'paused'
        ? 'Paused'
        : clock.phase === 'over'
          ? "Time's up"
          : 'Game on';
  const buttonCls =
    'inline-flex items-center font-sans font-semibold rounded-md transition-colors disabled:opacity-60';
  const buttonStyle = {
    gap: 'min(6px, 1.5cqmin)',
    padding: 'min(8px, 2cqmin) min(14px, 3cqmin)',
    fontSize: 'min(13px, 4.5cqmin)',
  };

  return (
    <div
      data-testid="game-clock-card"
      className="bg-brand-blue-lighter rounded-xl flex flex-col"
      style={{ padding: 'min(16px, 3.5cqmin)', gap: 'min(8px, 2cqmin)' }}
    >
      <div
        className="flex items-baseline justify-between"
        style={{ gap: 'min(8px, 2cqmin)' }}
      >
        <p
          className="font-sans font-bold text-brand-blue-dark"
          style={{ fontSize: 'min(16px, 6cqmin)' }}
        >
          {label}
        </p>
        <p
          className="text-brand-gray-dark"
          style={{ fontSize: 'min(13px, 4.5cqmin)' }}
        >
          {joined} joined
        </p>
      </div>
      <p
        className="font-sans font-black tabular-nums text-brand-blue-dark"
        style={{ fontSize: 'min(40px, 14cqmin)', lineHeight: 1 }}
      >
        {formatGameClock(clock.remainingMs)}
      </p>
      {session.status !== 'ended' && (
        <div className="flex flex-wrap" style={{ gap: 'min(8px, 2cqmin)' }}>
          {clock.phase === 'waiting' ? (
            <button
              type="button"
              onClick={() => void start()}
              disabled={busy}
              className={`${buttonCls} bg-brand-blue-primary hover:bg-brand-blue-light text-white`}
              style={buttonStyle}
            >
              {busy ? (
                <Loader2 className="animate-spin" style={iconSize} />
              ) : (
                <Play style={iconSize} aria-hidden />
              )}
              Start game
            </button>
          ) : (
            <>
              {clock.phase !== 'over' && (
                <button
                  type="button"
                  onClick={() => void togglePause()}
                  disabled={busy}
                  className={`${buttonCls} bg-brand-blue-primary hover:bg-brand-blue-light text-white`}
                  style={buttonStyle}
                >
                  {clock.phase === 'paused' ? (
                    <Play style={iconSize} aria-hidden />
                  ) : (
                    <Pause style={iconSize} aria-hidden />
                  )}
                  {clock.phase === 'paused' ? 'Resume' : 'Pause'}
                </button>
              )}
              <button
                type="button"
                onClick={() => void addMinute()}
                disabled={busy}
                className={`${buttonCls} bg-white border border-brand-gray-lighter text-brand-blue-dark hover:border-brand-blue-light`}
                style={buttonStyle}
              >
                <Plus style={iconSize} aria-hidden />1 min
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
