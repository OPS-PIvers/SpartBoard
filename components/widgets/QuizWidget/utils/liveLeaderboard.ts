import { deleteField, doc, writeBatch } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { QuizLeaderboardEntry } from '@/types';
import {
  LIVE_LEADERBOARD_COLLECTION,
  LIVE_LEADERBOARD_DOC,
  splitLeaderboardNames,
} from '@/utils/quizLeaderboardNames';

const refs = (sessionId: string) => ({
  session: doc(db, 'quiz_sessions', sessionId),
  names: doc(
    db,
    'quiz_sessions',
    sessionId,
    LIVE_LEADERBOARD_COLLECTION,
    LIVE_LEADERBOARD_DOC
  ),
});

/** Ranks and scores go on the session doc; names go where only seated students read them. */
export function publishLiveLeaderboard(
  sessionId: string,
  entries: QuizLeaderboardEntry[]
): Promise<void> {
  const { session, names } = refs(sessionId);
  const split = splitLeaderboardNames(entries);
  return writeBatch(db)
    .update(session, { liveLeaderboard: split.entries })
    .set(names, { names: split.names })
    .commit();
}

export function clearLiveLeaderboard(sessionId: string): Promise<void> {
  const { session, names } = refs(sessionId);
  return writeBatch(db)
    .update(session, { liveLeaderboard: deleteField() })
    .delete(names)
    .commit();
}
