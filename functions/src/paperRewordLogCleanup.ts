// Removes a response's paper reword log when the response is deleted, since Firestore doesn't cascade.
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from './firebaseAdmin';
import './functionsInit';

export async function deletePaperRewordLog(
  db: admin.firestore.Firestore,
  sessionId: string,
  responseKey: string
): Promise<void> {
  await db.recursiveDelete(
    db
      .collection('quiz_sessions')
      .doc(sessionId)
      .collection('responses')
      .doc(responseKey)
      .collection('paper_reword_log')
  );
}

export const cleanupPaperRewordLog = onDocumentDeleted(
  {
    document: 'quiz_sessions/{sessionId}/responses/{responseKey}',
    memory: '256MiB',
    maxInstances: 5,
  },
  async (event) => {
    const { sessionId, responseKey } = event.params;
    try {
      await deletePaperRewordLog(admin.firestore(), sessionId, responseKey);
    } catch (err) {
      logger.error('paperRewordLogCleanup: failed', {
        sessionId,
        responseKey,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
);
