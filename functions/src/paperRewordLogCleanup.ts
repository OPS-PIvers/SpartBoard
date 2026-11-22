// Removes a response's paper reword log when the response is deleted, since Firestore doesn't cascade.
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from './firebaseAdmin';
import './functionsInit';

// Retries stop after this, so a lasting failure can't retry for the 7-day default.
const MAX_EVENT_AGE_SECONDS = 3600;

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
    retry: true,
  },
  async (event) => {
    const { sessionId, responseKey } = event.params;
    const ageSeconds = (Date.now() - Date.parse(event.time)) / 1000;
    if (ageSeconds > MAX_EVENT_AGE_SECONDS) {
      logger.error('paperRewordLogCleanup: dropping event past retry budget', {
        sessionId,
        responseKey,
        ageSeconds,
      });
      return;
    }
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
