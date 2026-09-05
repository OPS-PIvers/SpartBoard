import { describe, it, expect } from 'vitest';
import { makeTestArtifact } from '@/tests/testHelpers/responseArtifacts';
import {
  artifactCountsAsTake,
  isArtifactPlayable,
  resolveArtifactPlaybackState,
  responseHasArtifacts,
  selectPlaybackTake,
} from '@/utils/responseArtifacts';
import { gradingKey, hasUngradedRecording } from '@/utils/mediaGrading';
import type {
  ArtifactArchiveEntry,
  ArtifactArchiveStatus,
  ArtifactKind,
  ArtifactUploadState,
  QuizResponse,
  QuizResponseAnswer,
  ResponseArtifact,
} from '@/types';

// Brief 2.1: schema-only. These assert the shape the later capture/archival
// briefs code against, and that legacy docs without the fields stay valid.
describe('ResponseArtifact shape', () => {
  it('accepts every ArtifactKind', () => {
    const kinds: ArtifactKind[] = ['text', 'audio', 'video', 'whiteboard'];
    const artifacts = kinds.map((kind, i) =>
      makeTestArtifact({ id: `a-${i}`, kind })
    );
    expect(artifacts.map((a) => a.kind)).toEqual(kinds);
  });

  it('accepts every ArtifactUploadState, with pending as a normal value', () => {
    const states: ArtifactUploadState[] = ['pending', 'uploaded', 'failed'];
    const artifacts = states.map((uploadState) =>
      makeTestArtifact({ uploadState })
    );
    expect(artifacts.map((a) => a.uploadState)).toEqual(states);
  });

  it('models an inline text addendum with no storagePath', () => {
    const textArtifact: ResponseArtifact = {
      id: 'a-text',
      slot: 'addendum',
      kind: 'text',
      text: 'Because the graph slopes down after week three.',
      uploadState: 'uploaded',
    };
    expect(textArtifact.storagePath).toBeUndefined();
    expect(textArtifact.text).toContain('week three');
  });

  it('carries a plain Storage path, never a resolved download URL', () => {
    const artifact = makeTestArtifact();
    expect(artifact.storagePath).not.toMatch(/^https?:/);
  });

  it('keeps the archival fields off the artifact itself (RR-03 amendment)', () => {
    const artifact = makeTestArtifact();
    expect(artifact).not.toHaveProperty('driveFileId');
    expect(artifact).not.toHaveProperty('archiveStatus');
    expect(artifact).not.toHaveProperty('archivedAt');
    expect(artifact).not.toHaveProperty('archiveError');
  });
});

describe('artifactArchive shape', () => {
  it('accepts every ArtifactArchiveStatus, including 4.1 delete states', () => {
    const statuses: ArtifactArchiveStatus[] = [
      'syncing',
      'archived',
      'failed',
      'deleting',
      'deleted',
      'delete-failed',
    ];
    const entries: ArtifactArchiveEntry[] = statuses.map((archiveStatus) => ({
      archiveStatus,
    }));
    expect(entries.map((e) => e.archiveStatus)).toEqual(statuses);
  });

  it('is playable only when archived with a driveFileId', () => {
    expect(
      isArtifactPlayable({ archiveStatus: 'archived', driveFileId: 'd1' })
    ).toBe(true);
    expect(isArtifactPlayable({ archiveStatus: 'archived' })).toBe(false);
    expect(
      isArtifactPlayable({ archiveStatus: 'syncing', driveFileId: 'd1' })
    ).toBe(false);
    expect(
      isArtifactPlayable({ archiveStatus: 'deleted', driveFileId: 'd1' })
    ).toBe(false);
    expect(
      isArtifactPlayable({ archiveStatus: 'delete-failed', driveFileId: 'd1' })
    ).toBe(false);
    expect(
      isArtifactPlayable({ archiveStatus: 'deleting', driveFileId: 'd1' })
    ).toBe(false);
    expect(
      isArtifactPlayable({ archiveStatus: 'lost', driveFileId: 'd1' })
    ).toBe(false);
    expect(isArtifactPlayable(undefined)).toBe(false);
  });

  it('carries 4.1 delete-tracking fields keyed by artifact id', () => {
    const archive: Record<string, ArtifactArchiveEntry> = {
      'artifact-1': {
        archiveStatus: 'deleted',
        driveFileId: 'drive-1',
        archivedAt: 200,
        deletedAt: 300,
        deletedBy: 'admin-uid',
        deleteAttemptedAt: 290,
      },
    };
    expect(archive['artifact-1'].deletedBy).toBe('admin-uid');
  });
});

describe('backward compatibility', () => {
  it('leaves a production answer without artifacts valid and unchanged', () => {
    const legacy: QuizResponseAnswer = {
      questionId: 'q1',
      answer: 'A',
      answeredAt: 100,
    };
    expect(legacy.artifacts).toBeUndefined();
    expect(Object.keys(legacy)).toEqual(['questionId', 'answer', 'answeredAt']);
  });

  it('leaves a production response without artifactArchive valid', () => {
    const legacy: QuizResponse = {
      studentUid: 'student-uid-1',
      joinedAt: 100,
      status: 'completed',
      answers: [{ questionId: 'q1', answer: 'A', answeredAt: 100 }],
      score: null,
      submittedAt: 200,
    };
    expect(legacy.artifactArchive).toBeUndefined();
    expect(Object.keys(legacy)).not.toContain('artifactArchive');
  });
});

// Brief 3.6: take resolution + the honest-state mapping the student view uses.
describe('playback helpers', () => {
  const take = (
    takeIndex: number,
    slot: 'primary' | 'addendum' = 'primary'
  ): QuizResponseAnswer => ({
    questionId: 'q1',
    answer: '',
    answeredAt: 100 + takeIndex,
    takeIndex,
    artifacts: [makeTestArtifact({ id: `a${takeIndex}`, kind: 'audio', slot })],
  });

  it('selects the highest takeIndex when no grade pins one', () => {
    expect(
      selectPlaybackTake([take(1), take(3), take(2)], 'q1')?.takeIndex
    ).toBe(3);
  });

  it('selects the graded take when the teacher pinned one', () => {
    expect(
      selectPlaybackTake([take(1), take(2)], 'q1', 'primary', 1)?.takeIndex
    ).toBe(1);
  });

  it('falls back to the highest take when the pinned take is gone', () => {
    expect(
      selectPlaybackTake([take(1), take(2)], 'q1', 'primary', 7)?.takeIndex
    ).toBe(2);
  });

  it('ignores other slots and questions', () => {
    expect(selectPlaybackTake([take(4, 'addendum')], 'q1')).toBeNull();
    expect(selectPlaybackTake([take(1)], 'other')).toBeNull();
  });

  it('maps every archive status to an honest playback state', () => {
    const state = (
      archiveStatus: ArtifactArchiveStatus,
      driveFileId?: string
    ) => resolveArtifactPlaybackState({ archiveStatus, driveFileId });
    expect(state('archived', 'd1')).toBe('playable');
    expect(state('archived')).toBe('archiving');
    expect(state('syncing')).toBe('archiving');
    expect(state('failed')).toBe('failed');
    expect(state('lost')).toBe('lost');
    expect(state('deleting')).toBe('deleted');
    expect(state('deleted')).toBe('deleted');
    expect(state('delete-failed')).toBe('deleted');
    expect(resolveArtifactPlaybackState(undefined)).toBe('archiving');
  });

  it('keys grading by question for the primary slot only', () => {
    expect(gradingKey('q1', 'primary')).toBe('q1');
    expect(gradingKey('q1', 'addendum')).toBe('q1::addendum');
  });

  it('treats a recording with no grade entry as provisional', () => {
    expect(hasUngradedRecording([take(1)], undefined, ['q1'])).toBe(true);
    expect(
      hasUngradedRecording([take(1)], { q1: { pointsAwarded: 3 } }, ['q1'])
    ).toBe(false);
    expect(hasUngradedRecording([], undefined, ['q1'])).toBe(false);
  });
});

// INT-B: the archive map is authoritative over the client's `uploadState`.
describe('artifactCountsAsTake', () => {
  const failed = { uploadState: 'failed' as const };
  const uploaded = { uploadState: 'uploaded' as const };

  it('counts a failed upload the sweep rescued into Drive', () => {
    expect(
      artifactCountsAsTake(failed, {
        archiveStatus: 'archived',
        driveFileId: 'd1',
      })
    ).toBe(true);
  });

  it('drops a failed upload with no archive entry', () => {
    expect(artifactCountsAsTake(failed, undefined)).toBe(false);
  });

  it('drops a failed upload whose archive also failed or was lost', () => {
    expect(artifactCountsAsTake(failed, { archiveStatus: 'failed' })).toBe(
      false
    );
    expect(artifactCountsAsTake(failed, { archiveStatus: 'lost' })).toBe(false);
  });

  it('keeps a failed upload the archive is still working on', () => {
    expect(artifactCountsAsTake(failed, { archiveStatus: 'syncing' })).toBe(
      true
    );
  });

  it('keeps any upload that did not fail, archive entry or not', () => {
    expect(artifactCountsAsTake(uploaded, undefined)).toBe(true);
    expect(artifactCountsAsTake({ uploadState: 'pending' }, undefined)).toBe(
      true
    );
  });
});

describe('selectPlaybackTake honours the archive map', () => {
  const answer = (
    takeIndex: number,
    uploadState: ArtifactUploadState
  ): QuizResponseAnswer => ({
    questionId: 'q1',
    answer: '',
    answeredAt: 100 + takeIndex,
    takeIndex,
    artifacts: [
      makeTestArtifact({ id: `a${takeIndex}`, kind: 'audio', uploadState }),
    ],
  });

  it('plays a rescued take the client marked failed', () => {
    const picked = selectPlaybackTake(
      [answer(1, 'uploaded'), answer(2, 'failed')],
      'q1',
      'primary',
      undefined,
      { a2: { archiveStatus: 'archived', driveFileId: 'd2' } }
    );
    expect(picked?.takeIndex).toBe(2);
  });

  it('skips a failed take with no archive entry and falls back', () => {
    const picked = selectPlaybackTake(
      [answer(1, 'uploaded'), answer(2, 'failed')],
      'q1',
      'primary',
      undefined,
      {}
    );
    expect(picked?.takeIndex).toBe(1);
  });

  it('numbers takes by position, not by raw takeIndex', () => {
    const picked = selectPlaybackTake(
      [answer(2, 'uploaded'), answer(5, 'uploaded')],
      'q1'
    );
    // takeIndex 5 is the SECOND visible take, so the student reads "Take 2".
    expect(picked?.takeIndex).toBe(5);
    expect(picked?.displayIndex).toBe(2);
  });
});

describe('responseHasArtifacts', () => {
  it('is true only when some answer carries an artifact', () => {
    expect(
      responseHasArtifacts({
        answers: [{ questionId: 'q1' }, { questionId: 'q2', artifacts: [{}] }],
      })
    ).toBe(true);
    expect(responseHasArtifacts({ answers: [{ questionId: 'q1' }] })).toBe(
      false
    );
    expect(responseHasArtifacts(undefined)).toBe(false);
    expect(responseHasArtifacts({ answers: 'nope' })).toBe(false);
  });
});
