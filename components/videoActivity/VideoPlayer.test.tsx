import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { YTPlayer } from '@/utils/youtube';
import { VideoPlayer } from './VideoPlayer';

const mockLoadYouTubeApi = vi.fn<(callback: () => void) => void>();
const mockExtractYouTubeId = vi.fn<(url: string) => string | null>();

vi.mock('@/utils/youtube', () => ({
  loadYouTubeApi: (callback: () => void) => mockLoadYouTubeApi(callback),
  loadYouTubeApiIn: (_win: Window, callback: () => void) =>
    mockLoadYouTubeApi(callback),
  extractYouTubeId: (url: string) => mockExtractYouTubeId(url),
  YT_PLAYER_STATE: {
    UNSTARTED: -1,
    ENDED: 0,
    PLAYING: 1,
    PAUSED: 2,
    BUFFERING: 3,
    CUED: 5,
  },
}));

interface MockPlayerOptions {
  events?: {
    onReady?: () => void;
  };
}

const createMockPlayer = (): YTPlayer => ({
  playVideo: vi.fn(),
  pauseVideo: vi.fn(),
  stopVideo: vi.fn(),
  seekTo: vi.fn(),
  getCurrentTime: vi.fn(() => 0),
  getDuration: vi.fn(() => 120),
  getPlayerState: vi.fn(() => -1),
  destroy: vi.fn(),
});

class MockYTPlayer {
  constructor(_elementId: string, options: MockPlayerOptions) {
    options.events?.onReady?.();
    return mockPlayerInstance;
  }
}

let mockPlayerInstance: YTPlayer;

describe('VideoPlayer', () => {
  const youtubeUrl = 'https://www.youtube.com/watch?v=abc123def45';
  const defaultProps = {
    youtubeUrl,
    questions: [],
    answeredQuestionIds: new Set<string>(),
    onQuestionTrigger: vi.fn(),
    onVideoEnd: vi.fn(),
    questionVisible: false,
    allowSkipping: false,
    autoPlay: false,
    seekRequest: null,
  };

  let player: YTPlayer;

  beforeEach(() => {
    vi.clearAllMocks();

    player = createMockPlayer();
    mockPlayerInstance = player;
    mockLoadYouTubeApi.mockImplementation((callback) => callback());
    mockExtractYouTubeId.mockReturnValue('abc123def45');

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1)
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    window.YT = {
      Player: MockYTPlayer as unknown as NonNullable<Window['YT']>['Player'],
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.YT;
  });

  it('does not replay the same seek request when question visibility changes', () => {
    const seekRequest = { time: 12, nonce: 101 };
    const { rerender } = render(
      <VideoPlayer
        {...defaultProps}
        questionVisible={true}
        seekRequest={seekRequest}
      />
    );

    expect(player.seekTo).toHaveBeenCalledTimes(1);
    expect(player.seekTo).toHaveBeenCalledWith(12, true);
    expect(player.playVideo).not.toHaveBeenCalled();

    rerender(
      <VideoPlayer
        {...defaultProps}
        questionVisible={false}
        seekRequest={seekRequest}
      />
    );

    expect(player.seekTo).toHaveBeenCalledTimes(1);
  });

  it('handles a fresh seek nonce as a new rewind request', () => {
    const { rerender } = render(
      <VideoPlayer {...defaultProps} seekRequest={{ time: 8, nonce: 201 }} />
    );

    rerender(
      <VideoPlayer {...defaultProps} seekRequest={{ time: 3, nonce: 202 }} />
    );

    expect(player.seekTo).toHaveBeenCalledTimes(2);
    expect(player.seekTo).toHaveBeenNthCalledWith(1, 8, true);
    expect(player.seekTo).toHaveBeenNthCalledWith(2, 3, true);
  });

  describe('RAF generation guard', () => {
    /**
     * Controllable RAF mock: queued callbacks are stored so the test can flush
     * them on demand, mimicking a frame that fires after polling was stopped.
     */
    let rafQueue: Array<{ id: number; cb: FrameRequestCallback }>;
    let nextRafId: number;

    beforeEach(() => {
      rafQueue = [];
      nextRafId = 1;
      vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn((cb: FrameRequestCallback) => {
          const id = nextRafId++;
          rafQueue.push({ id, cb });
          return id;
        })
      );
      vi.stubGlobal(
        'cancelAnimationFrame',
        vi.fn((id: number) => {
          rafQueue = rafQueue.filter((entry) => entry.id !== id);
        })
      );
    });

    // Flush every currently-queued callback once (drains the queue, but
    // callbacks may enqueue follow-up frames).
    const flushFrame = (timestamp: number) => {
      const pending = rafQueue;
      rafQueue = [];
      for (const { cb } of pending) cb(timestamp);
    };

    it('stops rescheduling once polling is stopped, even for a frame that fires after cancellation', () => {
      player.getPlayerState = vi.fn(() => 1); // PLAYING

      const { unmount } = render(<VideoPlayer {...defaultProps} />);

      // onReady scheduled the first tick.
      expect(rafQueue).toHaveLength(1);

      // Simulate the cancellation racing with an already-fired frame: requeue the
      // pending tick so it survives the cleanup's cancelAnimationFrame, then unmount.
      const orphaned = rafQueue[0].cb;
      unmount(); // cleanup calls stopPolling → bumps generation, cancels RAF
      expect(rafQueue).toHaveLength(0);

      // The orphaned tick fires after stop; the generation guard must make it bail
      // out without enqueuing another frame.
      orphaned(1000);
      expect(rafQueue).toHaveLength(0);
    });

    it('keeps a remounted player running while the previous loop stays dormant', () => {
      player.getPlayerState = vi.fn(() => 1); // PLAYING

      const { unmount } = render(<VideoPlayer {...defaultProps} />);
      const staleTick = rafQueue[0].cb;
      unmount();

      // Fresh mount starts a new generation/loop.
      const secondPlayer = createMockPlayer();
      secondPlayer.getPlayerState = vi.fn(() => 1);
      mockPlayerInstance = secondPlayer;
      render(<VideoPlayer {...defaultProps} />);
      expect(rafQueue).toHaveLength(1);

      // The stale tick from the unmounted instance must not resurrect itself.
      staleTick(1000);
      expect(rafQueue).toHaveLength(1);

      // The live loop keeps polling across frames (timestamp past the 250 ms
      // poll interval so the throttle lets it read player state).
      flushFrame(1000);
      expect(rafQueue).toHaveLength(1);
      expect(secondPlayer.getPlayerState).toHaveBeenCalled();
    });

    it('teacher mode reports ticks and never seeks back or triggers questions', () => {
      player.getPlayerState = vi.fn(() => 1); // PLAYING
      player.getCurrentTime = vi.fn(() => 50);
      const onTick = vi.fn();
      const onQuestionTrigger = vi.fn();
      render(
        <VideoPlayer
          {...defaultProps}
          questions={[{ id: 'q1', timestamp: 10, text: 'Q', type: 'MC' }]}
          onQuestionTrigger={onQuestionTrigger}
          teacherMode
          onTick={onTick}
        />
      );
      flushFrame(1000);
      expect(onTick).toHaveBeenCalledWith(50, 120, true);
      expect(player.seekTo).not.toHaveBeenCalled();
      expect(onQuestionTrigger).not.toHaveBeenCalled();
    });

    it('ends the video once at the clip end and stops polling', () => {
      player.getPlayerState = vi.fn(() => 1); // PLAYING
      player.getCurrentTime = vi.fn(() => 60);
      const onVideoEnd = vi.fn();
      render(
        <VideoPlayer
          {...defaultProps}
          onVideoEnd={onVideoEnd}
          clip={{ start: 10, end: 60 }}
        />
      );
      flushFrame(1000);
      expect(player.pauseVideo).toHaveBeenCalled();
      expect(onVideoEnd).toHaveBeenCalledTimes(1);
      expect(rafQueue).toHaveLength(0);
    });

    it('does not end at the clip end while a question is still unanswered', () => {
      player.getPlayerState = vi.fn(() => 1); // PLAYING
      player.getCurrentTime = vi.fn(() => 61);
      const onVideoEnd = vi.fn();
      render(
        <VideoPlayer
          {...defaultProps}
          allowSkipping
          questions={[{ id: 'q1', timestamp: 61, text: 'Q', type: 'MC' }]}
          onVideoEnd={onVideoEnd}
          clip={{ end: 60 }}
        />
      );
      flushFrame(1000);
      expect(onVideoEnd).not.toHaveBeenCalled();
    });

    it('pauses on a note it has just reached and shows it once', () => {
      player.getPlayerState = vi.fn(() => 1); // PLAYING
      player.getCurrentTime = vi.fn(() => 20.2);
      const onNoteTrigger = vi.fn();
      const note = { id: 'n1', timestamp: 20, text: 'Look here' };
      render(
        <VideoPlayer
          {...defaultProps}
          notes={[note]}
          onNoteTrigger={onNoteTrigger}
        />
      );
      flushFrame(1000);
      flushFrame(2000);
      expect(player.pauseVideo).toHaveBeenCalledTimes(1);
      expect(onNoteTrigger).toHaveBeenCalledTimes(1);
      expect(onNoteTrigger).toHaveBeenCalledWith(note);
    });

    it('skips a note well behind a resumed playhead', () => {
      player.getPlayerState = vi.fn(() => 1); // PLAYING
      player.getCurrentTime = vi.fn(() => 90);
      const onNoteTrigger = vi.fn();
      render(
        <VideoPlayer
          {...defaultProps}
          allowSkipping
          notes={[{ id: 'n1', timestamp: 20, text: 'Look here' }]}
          onNoteTrigger={onNoteTrigger}
        />
      );
      flushFrame(1000);
      expect(onNoteTrigger).not.toHaveBeenCalled();
    });

    it('moves a playhead before the clip start up to the start', () => {
      player.getPlayerState = vi.fn(() => 1); // PLAYING
      player.getCurrentTime = vi.fn(() => 2);
      render(<VideoPlayer {...defaultProps} clip={{ start: 30 }} />);
      flushFrame(1000);
      expect(player.seekTo).toHaveBeenCalledWith(30, true);
    });
  });
});
