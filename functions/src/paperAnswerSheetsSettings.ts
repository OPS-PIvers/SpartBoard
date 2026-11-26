import { HttpsError } from 'firebase-functions/v2/https';
import type * as admin from './firebaseAdmin';

/** Admin kill switch; mirrors `config/paperAnswerSheets.ts`. Absent == off. */
export const PAPER_SETTINGS_PATH = 'admin_settings/paper_answer_sheets';

/** True only while an admin has the paper answer sheets rollout switched on. */
export function isPaperSheetsEnabled(
  snap: admin.firestore.DocumentSnapshot
): boolean {
  return snap.data()?.enabled === true;
}

/** Throws unless the paper answer sheets rollout switch is on. */
export async function assertPaperSheetsEnabled(
  db: admin.firestore.Firestore
): Promise<void> {
  if (!isPaperSheetsEnabled(await db.doc(PAPER_SETTINGS_PATH).get()))
    throw paperSheetsOff();
}

export const paperSheetsOff = (): HttpsError =>
  new HttpsError(
    'failed-precondition',
    'Paper response sheets are not enabled.'
  );
