import React from 'react';
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import type {
  ArtifactArchiveEntry,
  QuizResponseAnswer,
  ResponseArtifact,
} from '@/types';
import type {
  FetchPlayback,
  PlaybackRequest,
} from '@/hooks/useQuizArtifactPlayback';

vi.mock('@/config/firebase', () => ({ functions: {} }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/components/quiz/whiteboard/WhiteboardReplayView', () => ({
  WhiteboardReplayView: (props: {
    pictureUrl: string | null;
    log: unknown;
    audioSrc?: string | null;
  }) => (
    <div data-testid="replay">
      {props.pictureUrl}|{props.log ? 'log' : 'nolog'}|
      {props.audioSrc ?? 'silent'}
    </div>
  ),
}));

import { ResponsePlaybackCard } from '@/components/quiz/recording/ResponsePlaybackCard';

const artifact = (
  id: string,
  over: Partial<ResponseArtifact>
): ResponseArtifact => ({
  id,
  slot: 'primary',
  kind: 'whiteboard',
  uploadState: 'uploaded',
  ...over,
});

const whiteboardAnswers = (withAudio = true): QuizResponseAnswer[] => [
  {
    questionId: 'q1',
    answer: '',
    answeredAt: 1,
    takeIndex: 0,
    artifacts: [
      artifact('pic', { part: 'picture' }),
      artifact('log', { part: 'log' }),
      ...(withAudio
        ? [artifact('aud', { kind: 'audio', durationMs: 4000 })]
        : []),
    ],
  },
];

const archived: ArtifactArchiveEntry = {
  archiveStatus: 'archived',
  driveFileId: 'drive-1',
};
const allArchived = { pic: archived, log: archived, aud: archived };

const LOG_JSON = JSON.stringify({
  v: 1,
  page: { w: 1600, h: 1200 },
  startingPageId: 'p',
  events: [{ t: 6000, op: 'undo' }],
});

function fetcher(calls: PlaybackRequest[]): FetchPlayback {
  return (req) => {
    calls.push(req);
    return Promise.resolve({
      status: 'ready',
      artifactId: req.part ?? 'audio',
      takeIndex: 0,
      mimeType: req.part === 'log' ? 'application/json' : 'image/png',
      data: btoa(req.part === 'log' ? LOG_JSON : 'bytes'),
      durationMs: 4000,
    });
  };
}

let urlCount = 0;
beforeAll(() => {
  URL.createObjectURL = vi.fn(() => `blob:${++urlCount}`);
  URL.revokeObjectURL = vi.fn();
});

describe('ResponsePlaybackCard with a whiteboard take', () => {
  it('fetches nothing until the student asks, then loads picture, log and audio', async () => {
    const calls: PlaybackRequest[] = [];
    render(
      <ResponsePlaybackCard
        sessionId="s1"
        responseKey="r1"
        questionId="q1"
        answers={whiteboardAnswers()}
        artifactArchive={allArchived}
        whiteboardEnabled
        fetchPlayback={fetcher(calls)}
      />
    );
    expect(calls).toHaveLength(0);
    await userEvent.click(
      screen.getByRole('button', {
        name: 'quizMediaResponse.whiteboardPlayback.show',
      })
    );
    await waitFor(() => expect(screen.getByTestId('replay')).toBeVisible());
    expect(calls.map((c) => c.part).sort()).toEqual([
      'audio',
      'log',
      'picture',
    ]);
    expect(screen.getByTestId('replay')).toHaveTextContent(/\|log\|/);
    expect(screen.getByTestId('replay')).not.toHaveTextContent('silent');
  });

  it('plays a draw-only take on a silent timeline without asking for audio', async () => {
    const calls: PlaybackRequest[] = [];
    render(
      <ResponsePlaybackCard
        sessionId="s1"
        responseKey="r1"
        questionId="q1"
        answers={whiteboardAnswers(false)}
        artifactArchive={allArchived}
        whiteboardEnabled
        fetchPlayback={fetcher(calls)}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByTestId('replay')).toBeVisible());
    expect(calls.map((c) => c.part).sort()).toEqual(['log', 'picture']);
    expect(screen.getByTestId('replay')).toHaveTextContent('silent');
  });

  it('renders nothing for a whiteboard take when the whiteboard is off', () => {
    const { container } = render(
      <ResponsePlaybackCard
        sessionId="s1"
        responseKey="r1"
        questionId="q1"
        answers={whiteboardAnswers()}
        artifactArchive={allArchived}
        fetchPlayback={fetcher([])}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the saving state without a fetch while the picture archives', () => {
    const calls: PlaybackRequest[] = [];
    render(
      <ResponsePlaybackCard
        sessionId="s1"
        responseKey="r1"
        questionId="q1"
        answers={whiteboardAnswers()}
        artifactArchive={{ pic: { archiveStatus: 'syncing' } }}
        whiteboardEnabled
        fetchPlayback={fetcher(calls)}
      />
    );
    expect(
      screen.getByText('quizMediaResponse.whiteboardPlayback.archiving')
    ).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('still shows the picture when the log fails to load', async () => {
    const base = fetcher([]);
    const failingLog: FetchPlayback = (req) =>
      req.part === 'log' ? Promise.reject(new Error('boom')) : base(req);
    render(
      <ResponsePlaybackCard
        sessionId="s1"
        responseKey="r1"
        questionId="q1"
        answers={whiteboardAnswers()}
        artifactArchive={allArchived}
        whiteboardEnabled
        fetchPlayback={failingLog}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(screen.getByTestId('replay')).toHaveTextContent('nolog')
    );
  });

  it('shows the honest state when the server refuses the picture', async () => {
    const refused: FetchPlayback = () =>
      Promise.resolve({ status: 'not-available', reason: 'deleted' });
    render(
      <ResponsePlaybackCard
        sessionId="s1"
        responseKey="r1"
        questionId="q1"
        answers={whiteboardAnswers()}
        artifactArchive={allArchived}
        whiteboardEnabled
        fetchPlayback={refused}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(
      await screen.findByText('quizMediaResponse.whiteboardPlayback.deleted')
    ).toBeVisible();
  });
});
