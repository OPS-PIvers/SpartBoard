// Live view and Nudge on a Writing response (D15); the rules let only the session's teacher write `liveView`.
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { QuizNudgeNoteId } from '@/types';
import { LIVE_VIEW_STAMP_MS } from '@/utils/quizLiveView';
import { getServerNow } from '@/utils/serverTime';

const responseRef = (sessionId: string, studentUid: string) =>
  doc(db, 'writing_assignment_sessions', sessionId, 'responses', studentUid);

/** Stamps or renews the watch; the student saves faster while `until` is ahead. */
export const stampWritingLiveView = (
  sessionId: string,
  studentUid: string,
  notify: boolean
): Promise<void> =>
  updateDoc(responseRef(sessionId, studentUid), {
    'liveView.until': getServerNow() + LIVE_VIEW_STAMP_MS,
    'liveView.notify': notify,
  });

export const clearWritingLiveView = (
  sessionId: string,
  studentUid: string
): Promise<void> =>
  updateDoc(responseRef(sessionId, studentUid), {
    'liveView.until': deleteField(),
    'liveView.notify': deleteField(),
  });

export const sendWritingNudge = (
  sessionId: string,
  studentUid: string,
  noteId?: QuizNudgeNoteId
): Promise<void> =>
  updateDoc(responseRef(sessionId, studentUid), {
    'liveView.nudge': { at: getServerNow(), ...(noteId ? { noteId } : {}) },
  });
