import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { QuizLiveLogEntry, QuizLiveState, QuizNudgeNoteId } from '@/types';
import { LIVE_VIEW_STAMP_MS } from '@/utils/quizLiveView';
import { getServerNow } from '@/utils/serverTime';

const responseRef = (sessionId: string, responseKey: string) =>
  doc(db, 'quiz_sessions', sessionId, 'responses', responseKey);

const logCollection = (teacherUid: string, assignmentId: string) =>
  collection(
    db,
    'users',
    teacherUid,
    'quiz_assignments',
    assignmentId,
    'live_log'
  );

/** Stamps or renews the watch; the student reports position while `until` is ahead. */
export const stampLiveView = (
  sessionId: string,
  responseKey: string,
  notify: boolean
): Promise<void> =>
  updateDoc(responseRef(sessionId, responseKey), {
    'liveView.until': getServerNow() + LIVE_VIEW_STAMP_MS,
    'liveView.notify': notify,
  });

export const clearLiveView = (
  sessionId: string,
  responseKey: string
): Promise<void> =>
  updateDoc(responseRef(sessionId, responseKey), {
    'liveView.until': deleteField(),
    'liveView.notify': deleteField(),
  });

export const sendNudge = (
  sessionId: string,
  responseKey: string,
  noteId?: QuizNudgeNoteId
): Promise<void> =>
  updateDoc(responseRef(sessionId, responseKey), {
    'liveView.nudge': { at: getServerNow(), ...(noteId ? { noteId } : {}) },
  });

/** The question a watched student is showing; null until they report one. */
export const watchLiveState = (
  sessionId: string,
  responseKey: string,
  onState: (state: QuizLiveState | null) => void
): Unsubscribe =>
  onSnapshot(
    doc(responseRef(sessionId, responseKey), 'live', 'state'),
    (snap) => onState(snap.exists() ? (snap.data() as QuizLiveState) : null),
    () => onState(null)
  );

export async function addLiveLogEntry(
  teacherUid: string,
  assignmentId: string,
  entry: Omit<QuizLiveLogEntry, 'id'>
): Promise<QuizLiveLogEntry> {
  const ref = await addDoc(logCollection(teacherUid, assignmentId), entry);
  return { ...entry, id: ref.id };
}

/** One read per entry; pass a response key for one student's entries. */
export async function loadLiveLog(
  teacherUid: string,
  assignmentId: string,
  responseKey?: string
): Promise<QuizLiveLogEntry[]> {
  const all = logCollection(teacherUid, assignmentId);
  const snap = await getDocs(
    responseKey ? query(all, where('responseKey', '==', responseKey)) : all
  );
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<QuizLiveLogEntry, 'id'>), id: d.id }))
    .sort((a, b) => a.at - b.at);
}

/** Removes a student's entries, or every entry when the assignment itself goes. Drive images stay. */
export async function deleteLiveLog(
  teacherUid: string,
  assignmentId: string,
  responseKey?: string
): Promise<void> {
  const all = logCollection(teacherUid, assignmentId);
  const snap = await getDocs(
    responseKey ? query(all, where('responseKey', '==', responseKey)) : all
  );
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/** The student's own position doc goes with their response. */
export const deleteLiveState = (
  sessionId: string,
  responseKey: string
): Promise<void> =>
  deleteDoc(doc(responseRef(sessionId, responseKey), 'live', 'state'));
