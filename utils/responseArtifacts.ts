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

// `'lost'` is added by the sibling archive-status PR; guarded as a literal.
const DEAD_ARCHIVE_STATUSES = new Set<string>(['failed', 'lost']);

/**
 * Does this artifact count as a real take? The server-owned archive map is
 * authoritative: an archived entry counts whatever the client wrote, and a
 * failed upload is dropped only when no archive entry rescued it.
 */
export function artifactCountsAsTake(
  artifact: { uploadState?: string } | undefined,
  entry: { archiveStatus?: string; driveFileId?: string } | undefined
): boolean {
  if (!artifact) return false;
  if (entry?.archiveStatus === 'archived' && !!entry.driveFileId) return true;
  if (artifact.uploadState !== 'failed') return true;
  const status = entry?.archiveStatus;
  if (!status) return false;
  return !DEAD_ARCHIVE_STATUSES.has(status);
}

/** What the student sees instead of a player when a take can't be played. */
export type ArtifactPlaybackState =
  | 'playable'
  | 'archiving'
  | 'failed'
  | 'lost'
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
  // `'lost'` is the sibling PR's terminal status; guarded as a literal.
  if ((status as string) === 'lost') return 'lost';
  if (status === 'failed') return 'failed';
  return 'archiving';
}

export interface PlaybackTakeSelection {
  artifact: ResponseArtifact;
  takeIndex: number;
  /** 1-based position among the takes that are visible on both sides. */
  displayIndex: number;
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
  gradedTakeIndex?: number,
  archive?: Record<string, ArtifactArchiveEntry>
): PlaybackTakeSelection | null {
  const candidates: PlaybackTakeSelection[] = [];
  for (const answer of answers) {
    if (answer.questionId !== questionId) continue;
    const artifact = (answer.artifacts ?? []).find(
      (a) => a.kind === 'audio' && (a.slot ?? 'primary') === slot
    );
    if (!artifact) continue;
    if (!artifactCountsAsTake(artifact, archive?.[artifact.id])) continue;
    candidates.push({
      artifact,
      takeIndex: answer.takeIndex ?? 0,
      displayIndex: 0,
    });
  }
  if (candidates.length === 0) return null;
  // Numbering is positional, so a rescued or dropped take never leaves a hole.
  candidates.sort((a, b) => a.takeIndex - b.takeIndex);
  candidates.forEach((c, i) => {
    c.displayIndex = i + 1;
  });
  if (typeof gradedTakeIndex === 'number') {
    const pinned = candidates.find((c) => c.takeIndex === gradedTakeIndex);
    if (pinned) return pinned;
  }
  return candidates[candidates.length - 1];
}

/** Does this response doc carry any recorded artifact at all? Shape-tolerant. */
export function responseHasArtifacts(data: unknown): boolean {
  const answers = (data as { answers?: unknown } | undefined)?.answers;
  if (!Array.isArray(answers)) return false;
  return answers.some((a) => {
    const artifacts = (a as { artifacts?: unknown } | undefined)?.artifacts;
    return Array.isArray(artifacts) && artifacts.length > 0;
  });
}
