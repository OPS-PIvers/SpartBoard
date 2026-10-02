// Group meeting recording callables, schedules and the late-segment trigger (docs/plans/PLC_MEETING_RECORDING.md, MR-D6 to MR-D11).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import * as logger from 'firebase-functions/logger';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { assertViewAsAllowed } from './viewAsGuard';
import {
  defaultRecordingDeps,
  deleteAudioAsEditor,
  finalizeAsRecorder,
  handleLateSegments,
  parseRecordingRequest,
  parseSegmentPath,
  runFinalizeStaleRecordings,
  runSweepExpiredRecordingAudio,
} from './plcRecordingCore';
import './functionsInit';

function requireUid(request: { auth?: { uid?: string } | null }): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  return uid;
}

export const finalizePlcRecordingV1 = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 300,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    assertViewAsAllowed(request);
    const uid = requireUid(request);
    const { plcId, recordingId } = parseRecordingRequest(request.data);
    return finalizeAsRecorder(defaultRecordingDeps(), uid, plcId, recordingId);
  }
);

export const deletePlcRecordingAudioV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    assertViewAsAllowed(request);
    const uid = requireUid(request);
    const { plcId, recordingId } = parseRecordingRequest(request.data);
    return deleteAudioAsEditor(defaultRecordingDeps(), uid, plcId, recordingId);
  }
);

export const finalizeStalePlcRecordings = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'America/Chicago',
    memory: '512MiB',
    maxInstances: 1,
    timeoutSeconds: 540,
  },
  async () => {
    const counts = await runFinalizeStaleRecordings(defaultRecordingDeps());
    if (Object.values(counts).some((n) => n > 0)) {
      logger.info('[finalizeStalePlcRecordings] finalized', counts);
    }
  }
);

export const sweepPlcRecordingAudio = onSchedule(
  {
    schedule: '45 3 * * *',
    timeZone: 'America/Chicago',
    memory: '256MiB',
    maxInstances: 1,
    timeoutSeconds: 540,
  },
  async () => {
    const deleted = await runSweepExpiredRecordingAudio(defaultRecordingDeps());
    logger.info(`[sweepPlcRecordingAudio] deleted audio for ${deleted}`);
  }
);

export const onPlcMeetingSegmentUploaded = onObjectFinalized(
  {
    memory: '512MiB',
    timeoutSeconds: 300,
    maxInstances: 10,
  },
  async (event) => {
    const parsed = parseSegmentPath(event.data.name ?? '');
    if (!parsed) return;
    await handleLateSegments(
      defaultRecordingDeps(),
      parsed.plcId,
      parsed.recordingId
    );
  }
);
