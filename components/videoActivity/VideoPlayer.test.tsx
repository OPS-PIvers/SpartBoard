import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { YTPlayer } from '@/utils/youtube';
import { VideoPlayer } from './VideoPlayer';

const mockLoadYouTubeApi = vi.fn<(callback: () => void) => void>();
const mockExtractYouTubeId = vi.fn<(url: string) => string | null>();

vi.mock('@/utils/youtube', () => ({
  loadYouTubeApi: (callback: () => void) => mockLoadYouTubeApi(callback),
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
});
