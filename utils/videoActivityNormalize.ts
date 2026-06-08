/**
 * Read-side normalization for Video Activity question payloads and session docs.
 *
 * Pre-PR2a Drive blobs / session docs may have questions with a missing
 * `type` (always treated as MC by the V1 editor) and missing `points`.
 * Routing all reads through `normalizeQuestion` lets the rest of the
 * pipeline assume the post-PR2a shape — every call site can rely on
 * `q.type` and `q.points` being present.
 *
 * Pure functions; safe to call repeatedly.
 */

import type { VideoActivityQuestion, VideoActivitySession } from '@/types';

export function normalizeVideoActivityQuestion(
  q: VideoActivityQuestion
): VideoActivityQuestion {
  return {
    ...q,
    type: q.type ?? 'MC',
    points: q.points ?? 1,
  };
}

export function normalizeVideoActivityQuestions(
  qs: VideoActivityQuestion[] | undefined
): VideoActivityQuestion[] {
  return (qs ?? []).map(normalizeVideoActivityQuestion);
}

/**
 * Normalize a raw Firestore `video_activity_sessions` document into a
 * fully-typed `VideoActivitySession`.
 *
 * Spreads the source data first so ALL optional fields (classIds, classId,
 * sessionOptions, ltiAttachment, revealedAnswers, mode, periodNames,
 * rosterIds, classPeriodByClassId, sync, ltiNrps, etc.) are preserved.
 * Required fields are then overridden with normalized/defaulted values.
 *
 * Previously this logic lived as an unexported constant inside the hook;
 * extracting it here makes it unit-testable without mocking Firestore.
 */
export function normalizeVideoActivitySession(
  sessionId: string,
  data: Partial<VideoActivitySession>
): VideoActivitySession {
  const activityTitle = data.activityTitle ?? 'Video Activity';
  const createdAt = data.createdAt ?? Date.now();
  return {
    ...data,
    id: sessionId,
    activityId: data.activityId ?? '',
    activityTitle,
    assignmentName:
      data.assignmentName && data.assignmentName.trim().length > 0
        ? data.assignmentName
        : `${activityTitle} ${new Date(createdAt).toLocaleString()}`,
    teacherUid: data.teacherUid ?? '',
    youtubeUrl: data.youtubeUrl ?? '',
    questions: normalizeVideoActivityQuestions(data.questions),
    settings: {
      autoPlay: data.settings?.autoPlay ?? false,
      requireCorrectAnswer: data.settings?.requireCorrectAnswer ?? true,
      allowSkipping: data.settings?.allowSkipping ?? false,
    },
    status: data.status === 'ended' ? 'ended' : 'active',
    allowedPins: data.allowedPins ?? [],
    createdAt,
    ...(typeof data.endedAt === 'number' ? { endedAt: data.endedAt } : {}),
    ...(typeof data.expiresAt === 'number'
      ? { expiresAt: data.expiresAt }
      : {}),
  };
}
