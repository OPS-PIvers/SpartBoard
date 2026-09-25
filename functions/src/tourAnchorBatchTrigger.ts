// Wakes the tour-anchor-mapper routine once per saved recording with untagged clicks (LIVE_TOURS_V2.md D10).
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { CLAUDE_TOUR_ROUTINE_TRIGGER_TOKEN } from './secrets';
import { TOUR_ANCHOR_BATCHES } from './tourAnchorQueue';
import './functionsInit';

// The routine's API trigger; the id is not secret, only the token is.
export const TOUR_ROUTINE_FIRE_URL =
  'https://api.anthropic.com/v1/claude_code/routines/trig_01CxtJ5NT4RpYTLhxWuHTs1n/fire';

export interface RoutineFireRequest {
  url: string;
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
  };
}

/** Builds the routine fire call. Exported for test coverage. */
export function buildRoutineFire(
  token: string,
  project: string,
  batchId: string,
  fingerprintCount: number
): RoutineFireRequest {
  return {
    url: TOUR_ROUTINE_FIRE_URL,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'experimental-cc-routine-2026-04-01',
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: JSON.stringify({ project, batchId, fingerprintCount }),
      }),
    },
  };
}

export const tourAnchorBatchTrigger = onDocumentCreated(
  {
    document: `${TOUR_ANCHOR_BATCHES}/{batchId}`,
    secrets: [CLAUDE_TOUR_ROUTINE_TRIGGER_TOKEN],
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (event) => {
    const { batchId } = event.params;
    const data = event.data?.data() as { fingerprints?: unknown } | undefined;
    const count = Array.isArray(data?.fingerprints)
      ? data.fingerprints.length
      : 0;
    const project = process.env.GCLOUD_PROJECT ?? 'unknown';
    const { url, init } = buildRoutineFire(
      CLAUDE_TOUR_ROUTINE_TRIGGER_TOKEN.value(),
      project,
      batchId,
      count
    );
    // Failures are logged, not retried: the routine's nightly run is the backstop.
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        logger.warn('[tourAnchorBatchTrigger] routine fire refused', {
          batchId,
          status: res.status,
        });
        return;
      }
      logger.info('[tourAnchorBatchTrigger] routine fired', {
        batchId,
        count,
      });
    } catch (err) {
      logger.warn('[tourAnchorBatchTrigger] routine fire failed', {
        batchId,
        err,
      });
    }
  }
);
