import type {
  ArtifactArchiveEntry,
  QuizResponseAnswer,
  ResponseArtifact,
  ArtifactSlot,
} from '@/types';

// Playable only once archival finished and Drive has the file.
export function isArtifactPlayable(
  entry: ArtifactArchiveEntry | undefined
): boolean {
  return entry?.archiveStatus === 'archived' && !!entry.driveFileId;
}

/** What the student sees instead of a player when a take can't be played. */
export type ArtifactPlaybackState =
  | 'playable'
  | 'archiving'
  | 'failed'
  | 'deleted';

/**
 * Client twin of the playback callable's own check. Every archive status other
 * than `'archived'` with a `driveFileId` renders an honest state, never a
 * broken player.
 */
export function resolveArtifactPlaybackState(
  entry: ArtifactArchiveEntry | undefined
): ArtifactPlaybackState {
  if (isArtifactPlayable(entry)) return 'playable';
  const status = entry?.archiveStatus;
  if (
    status === 'deleting' ||
    status === 'deleted' ||
    status === 'delete-failed'
  ) {
    return 'deleted';
  }
  // A terminal 'lost' is an honest failure, never a stuck 'archiving'.
  if (status === 'failed' || status === 'lost') return 'failed';
  return 'archiving';
}

export interface PlaybackTakeSelection {
  artifact: ResponseArtifact;
  takeIndex: number;
}

/**
 * The take a grade is about: the teacher's `gradedTakeIndex` when one is
 * pinned, else the highest `takeIndex` — which is what scoring reads. Mirrors
 * `selectPlaybackTake` in `functions/src/getQuizArtifactPlaybackUrl.ts`; the
 * server resolves it again and is the authority.
 */
export function selectPlaybackTake(
  answers: readonly QuizResponseAnswer[],
  questionId: string,
  slot: ArtifactSlot = 'primary',
  gradedTakeIndex?: number
): PlaybackTakeSelection | null {
  const candidates: PlaybackTakeSelection[] = [];
  for (const answer of answers) {
    if (answer.questionId !== questionId) continue;
    const artifact = (answer.artifacts ?? []).find(
      (a) => a.kind === 'audio' && (a.slot ?? 'primary') === slot
    );
    if (!artifact) continue;
    candidates.push({ artifact, takeIndex: answer.takeIndex ?? 0 });
  }
  if (candidates.length === 0) return null;
  if (typeof gradedTakeIndex === 'number') {
    const pinned = candidates.find((c) => c.takeIndex === gradedTakeIndex);
    if (pinned) return pinned;
  }
  return candidates.reduce((best, c) =>
    c.takeIndex > best.takeIndex ? c : best
  );
}

/**
 * Composite grading key; the unsuffixed key is the primary slot, matching
 * every `grading` entry written before slots existed.
 */
export function artifactGradingKey(
  questionId: string,
  slot: ArtifactSlot = 'primary'
): string {
  return slot === 'primary' ? questionId : `${questionId}::${slot}`;
}

/**
 * Interim provisional detector for recording slots: a committed audio take
 * with no `grading` entry is still owed a teacher grade. Replace with Brief
 * 3.4's per-slot `GradeResult` computation once that lands.
 */
export function hasUngradedRecording(
  answers: readonly QuizResponseAnswer[],
  grading: Record<string, unknown> | undefined,
  questionIds: readonly string[]
): boolean {
  return questionIds.some((questionId) => {
    const take = selectPlaybackTake(answers, questionId);
    if (!take) return false;
    return (
      grading?.[artifactGradingKey(questionId, take.artifact.slot)] == null
    );
  });
}
