/**
 * VideoPlayer — YouTube IFrame player with anti-skip enforcement.
 *
 * Anti-skip mechanism:
 *  - A requestAnimationFrame loop polls getCurrentTime() every ~250 ms.
 *  - `maxAllowedTime` is the furthest point the student is allowed to seek to.
 *    It advances only when a question at that timestamp is answered.
 *  - If the player's current time exceeds maxAllowedTime by more than a small
 *    tolerance, it is seeked back to maxAllowedTime.
 *  - When the playhead reaches a question trigger point, `onQuestionTrigger` is
 *    called and the video is paused.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { loadYouTubeApi, YT_PLAYER_STATE } from '@/utils/youtube';
import type { YTPlayer } from '@/utils/youtube';
import { VideoActivityQuestion } from '@/types';

interface VideoPlayerProps {
  youtubeUrl: string;
  questions: VideoActivityQuestion[];
  /** Timestamps of already-answered questions (in seconds). */
  answeredTimestamps: number[];
  /** Fired when the playhead first reaches a question's timestamp. */
  onQuestionTrigger: (question: VideoActivityQuestion) => void;
  /** Fired when the video ends (after all questions answered). */
  onVideoEnd: () => void;
  /** Whether the overlay is visible (prevents time-tracking while paused for Q). */
  questionVisible: boolean;
}

const SEEK_TOLERANCE_SECONDS = 3;

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  youtubeUrl,
  questions,
  answeredTimestamps,
  onQuestionTrigger,
  onVideoEnd,
  questionVisible,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const rafRef = useRef<number | null>(null);
  const triggeredRef = useRef<Set<string>>(new Set());

  // Derive the max time the student may seek to
  const maxAllowedTime = React.useMemo(() => {
    if (answeredTimestamps.length === 0) {
      // Allow up to the first question's timestamp
      const firstQ = [...questions].sort(
        (a, b) => a.timestamp - b.timestamp
      )[0];
      return firstQ ? firstQ.timestamp + SEEK_TOLERANCE_SECONDS : Infinity;
    }
    const maxAnswered = Math.max(...answeredTimestamps);
    // Find the next unanswered question after the last answered one
    const unanswered = questions
      .filter((q) => !answeredTimestamps.includes(q.timestamp))
      .sort((a, b) => a.timestamp - b.timestamp);
    const next = unanswered[0];
    return next
      ? next.timestamp + SEEK_TOLERANCE_SECONDS
      : maxAnswered + SEEK_TOLERANCE_SECONDS;
  }, [answeredTimestamps, questions]);

  // Sorted unanswered questions for trigger detection
  const unansweredRef = useRef<VideoActivityQuestion[]>([]);
  unansweredRef.current = questions
    .filter((q) => !answeredTimestamps.includes(q.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  const maxAllowedRef = useRef(maxAllowedTime);
  maxAllowedRef.current = maxAllowedTime;

  const questionVisibleRef = useRef(questionVisible);
  questionVisibleRef.current = questionVisible;

  const extractVideoId = (url: string): string | null => {
    const patterns = [
      /[?&]v=([^&#]+)/,
      /youtu\.be\/([^?&#]+)/,
      /embed\/([^?&#]+)/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  };

  const startPolling = useCallback(() => {
    const tick = () => {
      const player = playerRef.current;
      if (!player) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const state = player.getPlayerState();
      const isPlaying = state === YT_PLAYER_STATE.PLAYING;

      if (isPlaying && !questionVisibleRef.current) {
        const currentTime = player.getCurrentTime();

        // Anti-skip: if student seeked past allowed time, seek back
        if (currentTime > maxAllowedRef.current + SEEK_TOLERANCE_SECONDS) {
          player.seekTo(maxAllowedRef.current, true);
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        // Question trigger detection
        for (const q of unansweredRef.current) {
          if (
            currentTime >= q.timestamp - 0.5 &&
            !triggeredRef.current.has(q.id)
          ) {
            triggeredRef.current.add(q.id);
            player.pauseVideo();
            onQuestionTrigger(q);
            break;
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [onQuestionTrigger]);

  const stopPolling = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId || !containerRef.current) return;

    let destroyed = false;

    loadYouTubeApi(() => {
      if (destroyed || !containerRef.current) return;

      const divId = `va-player-${Math.random().toString(36).slice(2)}`;
      const div = document.createElement('div');
      div.id = divId;
      containerRef.current.appendChild(div);

      if (!window.YT?.Player) return;
      playerRef.current = new window.YT.Player(divId, {
        height: '100%',
        width: '100%',
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          fs: 0, // disable fullscreen to prevent skip bypass
        },
        events: {
          onReady: () => {
            startPolling();
          },
          onStateChange: (event: { data: number }) => {
            if (event.data === YT_PLAYER_STATE.ENDED) {
              stopPolling();
              onVideoEnd();
            }
          },
        },
      });
    });

    const container = containerRef.current;
    return () => {
      destroyed = true;
      stopPolling();
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
      if (container) {
        container.innerHTML = '';
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeUrl]);

  // Resume polling state when question is dismissed
  useEffect(() => {
    if (!questionVisible && playerRef.current) {
      const state = playerRef.current.getPlayerState();
      if (state === YT_PLAYER_STATE.PAUSED) {
        playerRef.current.playVideo();
      }
    }
  }, [questionVisible]);

  return (
    <div className="relative w-full h-full bg-black">
      <div
        ref={containerRef}
        className="w-full h-full [&>div]:w-full [&>div]:h-full [&_iframe]:w-full [&_iframe]:h-full"
      />
    </div>
  );
};
