/**
 * Student published-results playback (Brief 3.6). Covers the honest states for
 * a take that isn't playable, and that the bytes are fetched lazily — only on
 * the student's own press, never on render.
 */
import React from 'react';
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import type { ArtifactArchiveEntry, QuizResponseAnswer } from '@/types';

vi.mock('@/config/firebase', () => ({
  functions: {},
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { ResponsePlaybackCard } from '@/components/quiz/recording/ResponsePlaybackCard';
import type { FetchPlayback } from '@/hooks/useQuizArtifactPlayback';

const answers = (takes: number[] = [1]): QuizResponseAnswer[] =>
  takes.map((takeIndex) => ({
    questionId: 'q1',
    answer: '',
    answeredAt: 1_700_000_000_000 + takeIndex,
    takeIndex,
    artifacts: [
      {
        id: `artifact-${takeIndex}`,
        slot: 'primary' as const,
        kind: 'audio' as const,
        durationMs: 5000,
        uploadState: 'uploaded' as const,
      },
    ],
  }));

const archived: ArtifactArchiveEntry = {
  archiveStatus: 'archived',
  driveFileId: 'drive-1',
};

const ready: FetchPlayback = () =>
  Promise.resolve({
    status: 'ready',
    artifactId: 'artifact-1',
    takeIndex: 1,
    mimeType: 'audio/mp4',
    data: btoa('bytes'),
    durationMs: 5000,
  });

function renderCard(
  archive: Record<string, ArtifactArchiveEntry>,
  fetchPlayback: FetchPlayback = ready,
  takes: number[] = [1]
) {
  return render(
    <ResponsePlaybackCard
      sessionId="s1"
      responseKey="r1"
      questionId="q1"
      answers={answers(takes)}
      artifactArchive={archive}
      fetchPlayback={fetchPlayback}
    />
  );
}

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:take');
  URL.revokeObjectURL = vi.fn();
});

describe('ResponsePlaybackCard', () => {
  it('renders nothing when the question has no audio take', () => {
    const { container } = render(
      <ResponsePlaybackCard
        sessionId="s1"
        responseKey="r1"
        questionId="q1"
        answers={[]}
        artifactArchive={{}}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('fetches nothing until the student presses play', async () => {
    const fetchPlayback = vi.fn(ready);
    renderCard({ 'artifact-1': archived }, fetchPlayback);
    expect(fetchPlayback).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole('button', { name: 'quizMediaResponse.playback.play' })
    );
    await waitFor(() => expect(fetchPlayback).toHaveBeenCalledTimes(1));
    expect(fetchPlayback).toHaveBeenCalledWith({
      sessionId: 's1',
      responseKey: 'r1',
      questionId: 'q1',
      slot: 'primary',
    });
  });

  it('shows the player once the bytes arrive', async () => {
    renderCard({ 'artifact-1': archived });
    await userEvent.click(
      screen.getByRole('button', { name: 'quizMediaResponse.playback.play' })
    );
    await waitFor(() =>
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    );
  });

  it('shows an archiving state, and no player, mid-archive', () => {
    const fetchPlayback = vi.fn(ready);
    renderCard({ 'artifact-1': { archiveStatus: 'syncing' } }, fetchPlayback);
    expect(
      screen.getByText('quizMediaResponse.playback.archiving')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(fetchPlayback).not.toHaveBeenCalled();
  });

  it('shows a failed state for an archive that never finished', () => {
    renderCard({ 'artifact-1': { archiveStatus: 'failed' } });
    expect(
      screen.getByText('quizMediaResponse.playback.failed')
    ).toBeInTheDocument();
  });

  it('shows a deleted state for every tombstoned status', () => {
    for (const archiveStatus of [
      'deleting',
      'deleted',
      'delete-failed',
    ] as const) {
      const { unmount } = renderCard({ 'artifact-1': { archiveStatus } });
      expect(
        screen.getByText('quizMediaResponse.playback.deleted')
      ).toBeInTheDocument();
      unmount();
    }
  });

  it('surfaces a server "not available" answer without a broken player', async () => {
    renderCard({ 'artifact-1': archived }, () =>
      Promise.resolve({ status: 'not-available', reason: 'deleted' })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'quizMediaResponse.playback.play' })
    );
    await waitFor(() =>
      expect(
        screen.getByText('quizMediaResponse.playback.deleted')
      ).toBeInTheDocument()
    );
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('offers a retry after a failed fetch', async () => {
    renderCard({ 'artifact-1': archived }, () =>
      Promise.reject(new Error('x'))
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'quizMediaResponse.playback.play' })
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'quizMediaResponse.playback.retry' })
      ).toBeInTheDocument()
    );
  });

  it('asks for the take the teacher graded, not the newest one', async () => {
    const fetchPlayback = vi.fn(ready);
    render(
      <ResponsePlaybackCard
        sessionId="s1"
        responseKey="r1"
        questionId="q1"
        answers={answers([1, 2])}
        artifactArchive={{
          'artifact-1': archived,
          'artifact-2': { archiveStatus: 'syncing' },
        }}
        gradedTakeIndex={1}
        fetchPlayback={fetchPlayback}
      />
    );
    // Take 2 is still syncing; pinning take 1 must yield a playable control.
    await userEvent.click(
      screen.getByRole('button', { name: 'quizMediaResponse.playback.play' })
    );
    await waitFor(() => expect(fetchPlayback).toHaveBeenCalledTimes(1));
  });
});
