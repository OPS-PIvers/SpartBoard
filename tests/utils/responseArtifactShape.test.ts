import { describe, it, expect } from 'vitest';
import { makeTestArtifact } from '../testHelpers/responseArtifacts';
import { isArtifactPlayable } from '@/utils/responseArtifacts';
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
