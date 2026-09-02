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

  it('themes the retry button for the surface it renders on', async () => {
    for (const light of [true, false]) {
      const { unmount } = render(
        <ResponsePlaybackCard
          sessionId="s1"
          responseKey="r1"
          questionId="q1"
          answers={answers()}
          artifactArchive={{ 'artifact-1': archived }}
          light={light}
          fetchPlayback={() => Promise.reject(new Error('x'))}
        />
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'quizMediaResponse.playback.play' })
      );
      const retry = await screen.findByRole('button', {
        name: 'quizMediaResponse.playback.retry',
      });
      expect(retry.className).toContain(
        light ? 'text-slate-700' : 'text-slate-200'
      );
      expect(retry.className).not.toContain(
        light ? 'text-slate-200' : 'text-slate-700'
      );
      unmount();
    }
  });

  it('keeps the player out of the live region', async () => {
    const { container } = renderCard({ 'artifact-1': archived });
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'quizMediaResponse.playback.play' })
    );
    await waitFor(() =>
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    );
    expect(container.querySelector('[aria-live="polite"]')).toBeNull();
  });

  it('refetches when the teacher re-pins a different graded take', async () => {
    const fetchPlayback = vi.fn(ready);
    const archive = {
      'artifact-1': archived,
      'artifact-2': archived,
    };
    const { rerender } = render(
      <ResponsePlaybackCard
        sessionId="s1"
        responseKey="r1"
        questionId="q1"
        answers={answers([1, 2])}
        artifactArchive={archive}
        gradedTakeIndex={1}
        fetchPlayback={fetchPlayback}
      />
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'quizMediaResponse.playback.play' })
    );
    await waitFor(() => expect(fetchPlayback).toHaveBeenCalledTimes(1));

    rerender(
      <ResponsePlaybackCard
        sessionId="s1"
        responseKey="r1"
        questionId="q1"
        answers={answers([1, 2])}
        artifactArchive={archive}
        gradedTakeIndex={2}
        fetchPlayback={fetchPlayback}
      />
    );
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'quizMediaResponse.playback.play',
      })
    );
    await waitFor(() => expect(fetchPlayback).toHaveBeenCalledTimes(2));
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

  // INT-B7: the archive retries on its own, so the student copy must not say
  // the recording is gone. Terminal wording belongs to `'lost'` only.
  it('separates "still retrying" from the terminal lost state', () => {
    const { unmount } = renderCard({
      'artifact-1': { archiveStatus: 'failed' },
    });
    expect(
      screen.getByText('quizMediaResponse.playback.failed')
    ).toBeInTheDocument();
    expect(screen.queryByText('quizMediaResponse.playback.lost')).toBeNull();
    unmount();

    renderCard({
      'artifact-1': { archiveStatus: 'lost' as 'failed' },
    });
    expect(
      screen.getByText('quizMediaResponse.playback.lost')
    ).toBeInTheDocument();
  });

  // INT-B1: the archive map is authoritative over the client's uploadState.
  it('plays a take the client marked failed but the sweep archived', async () => {
    const failedAnswers = answers();
    const [failedArtifact] = failedAnswers[0].artifacts ?? [];
    if (failedArtifact) failedArtifact.uploadState = 'failed';
    const fetchPlayback = vi.fn(ready);
    render(
      <ResponsePlaybackCard
        sessionId="s1"
        responseKey="r1"
        questionId="q1"
        answers={failedAnswers}
        artifactArchive={{ 'artifact-1': archived }}
        fetchPlayback={fetchPlayback}
      />
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'quizMediaResponse.playback.play' })
    );
    await waitFor(() => expect(fetchPlayback).toHaveBeenCalledTimes(1));
  });

  // INT-B5: teacher timeline comments are ms offsets and must reach the
  // student somewhere; nothing rendered them before.
  describe('timeline comments', () => {
    const annotations = [
      {
        id: 'ann-1',
        from: 12_000,
        to: 12_000,
        comment: 'Good evidence here.',
        authorUid: 't1',
        createdAt: 1,
      },
    ];

    const renderWithComments = () =>
      render(
        <ResponsePlaybackCard
          sessionId="s1"
          responseKey="r1"
          questionId="q1"
          answers={answers()}
          artifactArchive={{ 'artifact-1': archived }}
          annotations={annotations}
          fetchPlayback={ready}
        />
      );

    it('renders each comment with its timecode once the take is playing', async () => {
      renderWithComments();
      await userEvent.click(
        screen.getByRole('button', { name: 'quizMediaResponse.playback.play' })
      );
      const comment = await screen.findByRole('button', {
        name: /Good evidence here/,
      });
      expect(comment.textContent).toContain('0:12');
    });

    it('seeks the player to the comment when it is pressed', async () => {
      renderWithComments();
      await userEvent.click(
        screen.getByRole('button', { name: 'quizMediaResponse.playback.play' })
      );
      const comment = await screen.findByRole('button', {
        name: /Good evidence here/,
      });
      const audio = document.querySelector('audio') as HTMLAudioElement;
      await userEvent.click(comment);
      await waitFor(() => expect(audio.currentTime).toBeCloseTo(12));
    });

    it('does not replay a stale comment seek onto a freshly re-pinned take', async () => {
      let urlCount = 0;
      (URL.createObjectURL as ReturnType<typeof vi.fn>).mockImplementation(
        () => `blob:take-${++urlCount}`
      );
      const fetchForTake: FetchPlayback = (req) =>
        Promise.resolve({
          status: 'ready',
          artifactId: req.questionId === 'q1' ? 'artifact-1' : 'artifact-2',
          takeIndex: 1,
          mimeType: 'audio/mp4',
          data: btoa('bytes'),
          durationMs: 5000,
        });
      const { rerender } = render(
        <ResponsePlaybackCard
          sessionId="s1"
          responseKey="r1"
          questionId="q1"
          answers={answers([1, 2])}
          artifactArchive={{ 'artifact-1': archived, 'artifact-2': archived }}
          annotations={annotations}
          gradedTakeIndex={1}
          fetchPlayback={fetchForTake}
        />
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'quizMediaResponse.playback.play' })
      );
      const comment = await screen.findByRole('button', {
        name: /Good evidence here/,
      });
      const firstAudio = document.querySelector('audio') as HTMLAudioElement;
      await userEvent.click(comment);
      await waitFor(() => expect(firstAudio.currentTime).toBeCloseTo(12));

      // The teacher re-pins a different take — a fresh player mounts.
      rerender(
        <ResponsePlaybackCard
          sessionId="s1"
          responseKey="r1"
          questionId="q1"
          answers={answers([1, 2])}
          artifactArchive={{ 'artifact-1': archived, 'artifact-2': archived }}
          annotations={annotations}
          gradedTakeIndex={2}
          fetchPlayback={fetchForTake}
        />
      );
      await userEvent.click(
        await screen.findByRole('button', {
          name: 'quizMediaResponse.playback.play',
        })
      );
      await waitFor(() => {
        const audio = document.querySelector('audio') as HTMLAudioElement;
        expect(audio.src).not.toBe(firstAudio.src);
      });
      const secondAudio = document.querySelector('audio') as HTMLAudioElement;
      // The stale ms=12000/nonce from the old take must not replay here.
      expect(secondAudio.currentTime).toBe(0);
    });

    it('renders no comment list when the grade carries none', async () => {
      renderCard({ 'artifact-1': archived });
      await userEvent.click(
        screen.getByRole('button', { name: 'quizMediaResponse.playback.play' })
      );
      await waitFor(() =>
        expect(screen.getByRole('progressbar')).toBeInTheDocument()
      );
      expect(
        screen.queryByText('quizMediaResponse.playback.commentsHint')
      ).toBeNull();
    });
  });
});
