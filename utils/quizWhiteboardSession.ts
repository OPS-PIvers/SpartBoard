import {
  isFreeResponseType,
  type QuizPublicQuestion,
  type QuizSession,
  type RecordingConfig,
  type ResponseArtifact,
} from '@/types';
import type { WhiteboardTake } from '@/hooks/useWhiteboardRecording';
import type { RecordingNoticeDrawing } from '@/components/quiz/recording/recordingNoticeDrawing';
import {
  isWhiteboardRecording,
  whiteboardUsesMic,
} from '@/config/quizRecordingDefaults';

type SessionGates = Pick<
  QuizSession,
  'mediaResponseEnabled' | 'whiteboardResponseEnabled'
>;

/** The recording block `/quiz` may honour; a whiteboard block needs its own session stamp. */
export function studentRecordingFor(
  question: Pick<QuizPublicQuestion, 'type' | 'recording'> | undefined,
  session: SessionGates
): RecordingConfig | undefined {
  if (session.mediaResponseEnabled !== true || !question) return undefined;
  if (!isFreeResponseType(question.type)) return undefined;
  const recording = question.recording;
  if (!recording) return undefined;
  if (
    isWhiteboardRecording(recording) &&
    session.whiteboardResponseEnabled !== true
  )
    return undefined;
  return recording;
}

/** Which version of the one-per-assignment notice this session needs (D11). */
export function noticeDrawingForSession(
  session: SessionGates,
  questions: readonly Pick<QuizPublicQuestion, 'type' | 'recording'>[]
): RecordingNoticeDrawing {
  let drawing = false;
  let voice = false;
  for (const q of questions) {
    const recording = studentRecordingFor(q, session);
    if (!recording) continue;
    if (isWhiteboardRecording(recording)) {
      drawing = true;
      if (whiteboardUsesMic(recording)) voice = true;
    } else {
      voice = true;
    }
  }
  if (!drawing) return null;
  return voice ? 'narrated' : 'draw-only';
}

/** One take's artifacts in upload order: picture, log, then audio (D19). */
export function buildWhiteboardTakeArtifacts(
  take: WhiteboardTake,
  storagePathFor: (artifactId: string, mimeType: string) => string,
  newId: () => string = () => crypto.randomUUID()
): { artifact: ResponseArtifact; blob: Blob }[] {
  const make = (
    blob: Blob,
    mimeType: string,
    durationMs: number,
    part?: 'picture' | 'log'
  ) => {
    const id = newId();
    const artifact: ResponseArtifact = {
      id,
      slot: 'primary',
      kind: part ? 'whiteboard' : 'audio',
      ...(part ? { part } : {}),
      storagePath: storagePathFor(id, mimeType),
      mimeType,
      bytes: blob.size,
      durationMs,
      uploadState: 'pending',
    };
    return { artifact, blob };
  };
  return [
    make(take.picture, 'image/png', take.durationMs, 'picture'),
    make(take.log, 'application/json', take.durationMs, 'log'),
    ...(take.audio
      ? [make(take.audio.blob, take.audio.mimeType, take.durationMs)]
      : []),
  ];
}

export type { WhiteboardTake };
