/**
 * Public-poll session orchestration: deriving the `poll_sessions` doc key,
 * aggregating the live votes subcollection client-side, and starting/stopping
 * a session (the server-enforced `active` flag). Shared by the widget
 * (Settings + board) and the phone remote so all three drive the same state.
 */

import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { PollConfig } from '@/types';

/** `poll_sessions` doc id: `{teacherUid}_{pollSessionId}`. */
export const makePollSessionId = (
  teacherUid: string,
  pollSessionId: string
): string => `${teacherUid}_${pollSessionId}`;

/** Tally raw vote docs into a count-per-option-index array. */
export const aggregateVotes = (
  votes: { optionIndex: number }[],
  optionCount: number
): number[] => {
  const tally = new Array<number>(optionCount).fill(0);
  for (const vote of votes) {
    const i = vote.optionIndex;
    if (Number.isInteger(i) && i >= 0 && i < optionCount) {
      tally[i] += 1;
    }
  }
  return tally;
};

/**
 * Open (or reopen) a public voting session. `mode: 'fresh'` mints a new id
 * (tallies start at zero); `mode: 'resume'` reuses `config.lastPollSessionId`
 * (prior votes persist). Writes/updates the session doc with `active: true`
 * and returns the config to persist via `updateWidget`.
 */
export const startPollSession = async (
  config: PollConfig,
  teacherUid: string,
  mode: 'fresh' | 'resume'
): Promise<PollConfig> => {
  const pollSessionId =
    mode === 'resume' && config.lastPollSessionId
      ? config.lastPollSessionId
      : crypto.randomUUID();
  await setDoc(
    doc(db, 'poll_sessions', makePollSessionId(teacherUid, pollSessionId)),
    {
      id: pollSessionId,
      teacherUid,
      optionCount: config.options.length,
      active: true,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  return { ...config, activePollSessionId: pollSessionId };
};

/**
 * Close the active session: flips the session doc to `active: false`
 * (blocking further votes server-side) and parks the id in
 * `lastPollSessionId` so it can be resumed.
 */
export const stopPollSession = async (
  config: PollConfig,
  teacherUid: string
): Promise<PollConfig> => {
  const active = config.activePollSessionId ?? null;
  if (active) {
    await setDoc(
      doc(db, 'poll_sessions', makePollSessionId(teacherUid, active)),
      { active: false, updatedAt: Date.now() },
      { merge: true }
    );
  }
  return {
    ...config,
    activePollSessionId: null,
    lastPollSessionId: active ?? config.lastPollSessionId ?? null,
  };
};
