import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type {
  VideoActivityLiveState,
  VideoActivityQuestion,
  VideoActivityResponse,
  VideoActivitySession,
} from '@/types';
import { VideoActivityLivePlayer } from './VideoActivityLivePlayer';

const flags = { anonymousJoin: true };
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    orgId: 'org',
    canAccessFeature: (id: string) =>
      id === 'anonymous-join' ? flags.anonymousJoin : false,
  }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    addToast: vi.fn(),
    rosters: [
      {
        id: 'r1',
        name: 'Period 1',
        students: [
          { id: 's1', firstName: 'Ada', lastName: 'Lovelace', pin: '01' },
          { id: 's2', firstName: 'Bo', lastName: 'Diddley', pin: '02' },
          { id: 's3', firstName: 'Cy', lastName: 'Young', pin: '03' },
        ],
      },
    ],
  }),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: () => Promise.resolve(true) }),
}));

vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({ byStudentUid: new Map() }),
}));

vi.mock('@/hooks/useLtiSessionNames', () => ({
  useLtiSessionNames: () => new Map(),
}));

const KEY: VideoActivityQuestion[] = [
  {
    id: 'q1',
    timestamp: 10,
    text: 'Pick A',
    type: 'MC',
    correctAnswer: 'A',
    incorrectAnswers: ['B'],
    timeLimit: 0,
  },
  {
    id: 'q2',
    timestamp: 20,
    text: 'Second',
    type: 'MC',
    correctAnswer: 'C',
    incorrectAnswers: ['D'],
    timeLimit: 0,
  },
  {
    id: 'q3',
    timestamp: 30,
    text: 'Third',
    type: 'MC',
    correctAnswer: 'E',
    incorrectAnswers: ['F'],
    timeLimit: 0,
  },
];
vi.mock('@/hooks/useVideoActivityKeyQuestions', () => ({
  useVideoActivityKeyQuestions: () => ({
    questions: KEY,
    loading: false,
    failed: false,
  }),
}));

const controls = {
  start: vi.fn(() => Promise.resolve()),
  openQuestion: vi.fn(() => Promise.resolve()),
  resume: vi.fn(() => Promise.resolve()),
  showResults: vi.fn(() => Promise.resolve()),
  revealAnswer: vi.fn(() => Promise.resolve()),
  skip: vi.fn(() => Promise.resolve()),
  end: vi.fn(() => Promise.resolve()),
};
vi.mock('@/hooks/useVideoActivityLiveControls', () => ({
  useVideoActivityLiveControls: () => controls,
}));

interface PlayerProps {
  onTick: (s: number, d: number, playing: boolean) => void;
  paused: boolean;
  seekRequest: { time: number; nonce: number } | null;
  startSeconds?: number;
}
const player: { props: PlayerProps | null } = { props: null };
vi.mock('@/components/videoActivity/VideoPlayer', () => ({
  VideoPlayer: (props: PlayerProps) => {
    player.props = props;
    return <div data-testid="video-player" />;
  },
}));

const baseLive: VideoActivityLiveState = {
  currentQuestionId: null,
  questionPhase: 'closed',
  resultsShown: false,
  answerRevealed: false,
  askedQuestionIds: [],
  skippedQuestionIds: [],
  playheadSeconds: 0,
  updatedAt: 0,
};

const makeSession = (
  status: VideoActivitySession['status'],
  live: Partial<VideoActivityLiveState> = {}
): VideoActivitySession => ({
  id: 'sess-1',
  activityId: 'a1',
  activityTitle: 'Cells',
  assignmentName: 'Cells - Oct 1',
  teacherUid: 't1',
  youtubeUrl: 'https://youtube.com/watch?v=abc',
  questions: [],
  publicQuestions: KEY.map((q) => ({
    id: q.id,
    timestamp: q.timestamp,
    text: q.text,
    type: q.type,
    options: [q.correctAnswer, ...q.incorrectAnswers],
  })),
  settings: {
    autoPlay: false,
    requireCorrectAnswer: false,
    allowSkipping: true,
  },
  status,
  sessionMode: 'teacher',
  live: { ...baseLive, ...live },
  allowedPins: [],
  createdAt: 0,
  periodNames: ['Period 1'],
  rosterIds: ['r1'],
});

const response = (
  pin: string,
  answers: { questionId: string; answer: string }[]
): VideoActivityResponse =>
  ({
    pin,
    studentUid: `u-${pin}`,
    joinedAt: 0,
    answers: answers.map((a) => ({ ...a, answeredAt: 1 })),
    completedAt: null,
    score: null,
  }) as unknown as VideoActivityResponse;

const renderPlayer = (
  session: VideoActivitySession,
  responses: VideoActivityResponse[] = [],
  onEnd = vi.fn(() => Promise.resolve())
) => {
  render(
    <VideoActivityLivePlayer
      session={session}
      responses={responses}
      onEnd={onEnd}
      onBack={vi.fn()}
    />
  );
  return { onEnd };
};

beforeEach(() => {
  vi.clearAllMocks();
  flags.anonymousJoin = true;
  player.props = null;
});

describe('VideoActivityLivePlayer lobby', () => {
  it('shows the join link, class, joined count and starts the session', () => {
    renderPlayer(makeSession('waiting'), [response('01', [])]);
    const lobby = screen.getByTestId('va-live-lobby');
    expect(within(lobby).getByAltText('Join QR code')).toBeInTheDocument();
    expect(screen.getByTestId('va-live-join-url')).toHaveTextContent(
      '/activity/sess-1'
    );
    expect(screen.getByText('Period 1')).toBeInTheDocument();
    expect(within(lobby).getByText('1')).toBeInTheDocument();
    expect(screen.queryByTestId('video-player')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    expect(controls.start).toHaveBeenCalledOnce();
  });

  it('hides the link and QR without anonymous join', () => {
    flags.anonymousJoin = false;
    renderPlayer(makeSession('waiting'));
    expect(screen.queryByAltText('Join QR code')).not.toBeInTheDocument();
    expect(screen.queryByTestId('va-live-join-url')).not.toBeInTheDocument();
  });
});

describe('VideoActivityLivePlayer playback', () => {
  it('pauses and opens a question when playback crosses its timestamp', () => {
    renderPlayer(makeSession('active'));
    act(() => player.props?.onTick(9.8, 60, true));
    expect(controls.openQuestion).not.toHaveBeenCalled();
    act(() => player.props?.onTick(10.05, 60, true));
    expect(controls.openQuestion).toHaveBeenCalledWith('q1', 10);
    expect(player.props?.paused).toBe(true);
  });

  it('skips questions a seek passes and never opens them', () => {
    renderPlayer(makeSession('active', { askedQuestionIds: ['q1'] }));
    act(() => player.props?.onTick(5, 60, true));
    const slider = screen.getByRole('slider', { name: /video position/i });
    fireEvent.change(slider, { target: { value: '25' } });
    fireEvent.pointerUp(slider);
    expect(controls.skip).toHaveBeenCalledWith(['q2'], 25);
    expect(player.props?.seekRequest?.time).toBe(25);
    act(() => player.props?.onTick(25, 60, true));
    act(() => player.props?.onTick(25.25, 60, true));
    expect(controls.openQuestion).not.toHaveBeenCalled();
  });

  it('opens a question from the jump list', async () => {
    renderPlayer(
      makeSession('active', { askedQuestionIds: ['q1'], playheadSeconds: 12 })
    );
    const list = screen.getByRole('complementary', { name: /questions/i });
    expect(within(list).getByText('Closed')).toBeInTheDocument();
    expect(within(list).getAllByText('Upcoming')).toHaveLength(2);
    fireEvent.click(within(list).getByText(/1\. Pick A/));
    await waitFor(() =>
      expect(controls.openQuestion).toHaveBeenCalledWith('q1', 10)
    );
    expect(controls.skip).not.toHaveBeenCalled();
  });

  it('jumping ahead skips the questions in between', async () => {
    renderPlayer(makeSession('active', { playheadSeconds: 5 }));
    const list = screen.getByRole('complementary', { name: /questions/i });
    fireEvent.click(within(list).getByText(/3\. Third/));
    await waitFor(() =>
      expect(controls.openQuestion).toHaveBeenCalledWith('q3', 30)
    );
    expect(controls.skip).toHaveBeenCalledWith(['q1', 'q2'], 30);
  });
});

describe('VideoActivityLivePlayer open question', () => {
  const openSession = (live: Partial<VideoActivityLiveState> = {}) =>
    makeSession('active', {
      currentQuestionId: 'q1',
      questionPhase: 'open',
      askedQuestionIds: ['q1'],
      ...live,
    });
  const responses = [
    response('01', [{ questionId: 'q1', answer: 'A' }]),
    response('02', []),
  ];

  it('shows the question, the counter and the pacing buttons', () => {
    renderPlayer(openSession(), responses);
    const panel = screen.getByTestId('va-live-question');
    expect(within(panel).getByText('Pick A')).toBeInTheDocument();
    expect(within(panel).getByText('1 of 2 answered')).toBeInTheDocument();
    expect(screen.getByTestId('va-live-status')).toHaveTextContent(
      'Question open'
    );
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Show results' })
    );
    expect(controls.showResults).toHaveBeenCalledWith(true);
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Reveal answer' })
    );
    expect(controls.revealAnswer).toHaveBeenCalledWith(true, 'A');
    fireEvent.click(within(panel).getByRole('button', { name: 'Resume' }));
    expect(controls.resume).toHaveBeenCalledOnce();
    expect(player.props?.paused).toBe(false);
  });

  it('lists who has not answered and who has not joined', () => {
    renderPlayer(openSession(), responses);
    fireEvent.click(screen.getByText('1 of 2 answered'));
    const pop = screen.getByRole('dialog', { name: /who hasn't answered/i });
    expect(within(pop).getByText('Bo Diddley')).toBeInTheDocument();
    expect(within(pop).getByText('Cy Young')).toBeInTheDocument();
    expect(within(pop).queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('keeps results hidden until shown', () => {
    renderPlayer(openSession(), responses);
    expect(screen.queryByTestId('va-live-aggregate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('answer-distribution-count')).toBeNull();
  });

  it('shows the distribution without marking the answer before reveal', () => {
    renderPlayer(openSession({ resultsShown: true }), responses);
    const counts = screen
      .getAllByTestId('answer-distribution-count')
      .map((n) => n.textContent);
    expect(counts).toEqual(['1', '0']);
    expect(screen.queryByText('Correct')).not.toBeInTheDocument();
  });

  it('marks the answer with a label on reveal', () => {
    renderPlayer(
      openSession({ resultsShown: true, answerRevealed: true }),
      responses
    );
    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(screen.getByLabelText('Correct answer')).toBeInTheDocument();
  });

  it('reveals with the key so students can see it', () => {
    renderPlayer(openSession(), responses);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
    expect(controls.revealAnswer).toHaveBeenCalledWith(true, 'A');
  });

  it('ends the live state before the finalize path', async () => {
    const { onEnd } = renderPlayer(openSession(), responses);
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    await waitFor(() => expect(onEnd).toHaveBeenCalledOnce());
    expect(controls.end).toHaveBeenCalledOnce();
  });
});

describe('VideoActivityLivePlayer present window', () => {
  const openPopup = () => {
    const popupDoc = document.implementation.createHTMLDocument('present');
    const popup = {
      document: popupDoc,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(),
    };
    const open = vi
      .spyOn(window, 'open')
      .mockReturnValue(popup as unknown as Window);
    return { popup, popupDoc, open };
  };

  it('moves the one player into the popup and back at the same playhead', () => {
    const { popup, popupDoc, open } = openPopup();
    renderPlayer(makeSession('active', { playheadSeconds: 3 }));
    act(() => player.props?.onTick(7, 60, true));
    expect(screen.getByTestId('video-player')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Present to class' }));
    expect(open).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('video-player')).not.toBeInTheDocument();
    expect(screen.getByTestId('va-live-presenting')).toBeInTheDocument();
    expect(
      popupDoc.querySelectorAll('[data-testid="video-player"]')
    ).toHaveLength(1);
    expect(player.props?.startSeconds).toBe(7);

    act(() => player.props?.onTick(12, 60, true));
    fireEvent.click(screen.getByRole('button', { name: 'Stop presenting' }));
    expect(popup.close).toHaveBeenCalledOnce();
    expect(
      popupDoc.querySelectorAll('[data-testid="video-player"]')
    ).toHaveLength(0);
    expect(screen.getByTestId('video-player')).toBeInTheDocument();
    expect(player.props?.startSeconds).toBe(12);
    open.mockRestore();
  });

  it('projects the open question and, when shown, the results', () => {
    const { popupDoc, open } = openPopup();
    renderPlayer(
      makeSession('active', {
        currentQuestionId: 'q1',
        questionPhase: 'open',
        askedQuestionIds: ['q1'],
        resultsShown: true,
      }),
      [response('01', [{ questionId: 'q1', answer: 'B' }])]
    );
    fireEvent.click(screen.getByRole('button', { name: 'Present to class' }));
    const projected = popupDoc.querySelector(
      '[data-testid="va-present-question"]'
    );
    expect(projected?.textContent).toContain('Pick A');
    expect(
      projected?.querySelector('[data-testid="va-live-aggregate"]')
    ).not.toBeNull();
    expect(projected?.textContent).not.toContain('Resume');
    open.mockRestore();
  });

  it('stays on the board when the popup is blocked', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderPlayer(makeSession('active'));
    fireEvent.click(screen.getByRole('button', { name: 'Present to class' }));
    expect(screen.getByTestId('video-player')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Present to class' })
    ).toBeInTheDocument();
    open.mockRestore();
  });
});
