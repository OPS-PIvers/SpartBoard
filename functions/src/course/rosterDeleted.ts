// Takes a deleted class out of its Course, so its students' Class page copy and an emptied Course's family page go too.
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import * as admin from '../firebaseAdmin';
import '../functionsInit';
import { dropDeletedRoster } from './saveCourse';

export const courseRosterDeleted = onDocumentDeleted(
  { document: 'users/{uid}/rosters/{rosterId}', maxInstances: 10 },
  async (event) => {
    const { uid, rosterId } = event.params;
    await dropDeletedRoster(admin.firestore(), uid, rosterId, Date.now());
  }
);
