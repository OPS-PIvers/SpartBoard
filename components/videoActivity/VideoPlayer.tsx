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

import React, { useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import {
  loadYouTubeApi,
  YT_PLAYER_STATE,
  extractYouTubeId,
} from '@/utils/youtube';
import type { YTPlayer } from '@/utils/youtube';
import { VideoActivityQuestion } from '@/types';

interface VideoPlayerProps {
  youtubeUrl: string;
  questions: VideoActivityQuestion[];
  /** IDs of already-answered questions — used for anti-skip enforcement. */
  answeredQuestionIds: Set<string>;
  /** Fired when the playhead first reaches a question's timestamp. */
  onQuestionTrigger: (question: VideoActivityQuestion) => void;
  /** Fired when the video ends (after all questions answered). */
  onVideoEnd: () => void;
  /** Whether the overlay is visible (prevents time-tracking while paused for Q). */
  questionVisible: boolean;
  /** Session setting: allow students to scrub ahead. */
  allowSkipping: boolean;
  /** Session setting: start playback automatically on ready. */
  autoPlay: boolean;
  /** Optional seek request issued by parent (e.g., rewind on incorrect answer). */
  seekRequest?: { time: number; nonce: number } | null;
}

const SEEK_TOLERANCE_SECONDS = 0.75;
/** Poll the player state every 250 ms instead of every frame to avoid unnecessary work. */
const POLL_INTERVAL_MS = 250;

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  youtubeUrl,
  questions,
  answeredQuestionIds,
  onQuestionTrigger,
  onVideoEnd,
  questionVisible,
  allowSkipping,
  autoPlay,
  seekRequest,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastPollRef = useRef<number>(0);
  const triggeredRef = useRef<Set<string>>(new Set());
  const lastSeekNonceRef = useRef<number | null>(null);

  // Derive the max time the student may seek to
  const maxAllowedTime = React.useMemo(() => {
    const sortedUnanswered = questions
      .filter((q) => !answeredQuestionIds.has(q.id))
      .sort((a, b) => a.timestamp - b.timestamp);
    const nextUnanswered = sortedUnanswered[0];
    if (nextUnanswered) {
      return nextUnanswered.timestamp + SEEK_TOLERANCE_SECONDS;
    }
    // All questions answered (or no questions at all)
    if (questions.length === 0) return Infinity;
    const maxAnswered = Math.max(
      ...questions
        .filter((q) => answeredQuestionIds.has(q.id))
        .map((q) => q.timestamp)
    );
    return maxAnswered + SEEK_TOLERANCE_SECONDS;
  }, [answeredQuestionIds, questions]);

  // Refs used inside RAF/callbacks — synced via useLayoutEffect so they are
  // always up-to-date before the next paint without triggering extra renders.
  const unansweredRef = useRef<VideoActivityQuestion[]>([]);
  const maxAllowedRef = useRef(maxAllowedTime);
  const questionVisibleRef = useRef(questionVisible);
  const allowSkippingRef = useRef(allowSkipping);
  const autoPlayRef = useRef(autoPlay);
  const onQuestionTriggerRef = useRef(onQuestionTrigger);
  const onVideoEndRef = useRef(onVideoEnd);

  useLayoutEffect(() => {
    unansweredRef.current = questions
      .filter((q) => !answeredQuestionIds.has(q.id))
      .sort((a, b) => a.timestamp - b.timestamp);
    maxAllowedRef.current = maxAllowedTime;
  }, [questions, answeredQuestionIds, maxAllowedTime]);

  useLayoutEffect(() => {
    questionVisibleRef.current = questionVisible;
  }, [questionVisible]);

  useLayoutEffect(() => {
    allowSkippingRef.current = allowSkipping;
    autoPlayRef.current = autoPlay;
  }, [allowSkipping, autoPlay]);

  useLayoutEffect(() => {
    onQuestionTriggerRef.current = onQuestionTrigger;
    onVideoEndRef.current = onVideoEnd;
  }, [onQuestionTrigger, onVideoEnd]);

  const startPolling = useCallback(() => {
    const tick = (timestamp: number) => {
      const player = playerRef.current;
      if (!player) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Throttle to ~POLL_INTERVAL_MS to avoid unnecessary 60fps work
      if (timestamp - lastPollRef.current < POLL_INTERVAL_MS) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      lastPollRef.current = timestamp;

      const state = player.getPlayerState();
      const isPlaying = state === YT_PLAYER_STATE.PLAYING;

      if (isPlaying && !questionVisibleRef.current) {
        const currentTime = player.getCurrentTime();

        // Anti-skip: if student seeked past allowed time, seek back
        if (!allowSkippingRef.current && currentTime > maxAllowedRef.current) {
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
            onQuestionTriggerRef.current(q);
            break;
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopPolling = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    const videoId = extractYouTubeId(youtubeUrl);
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
          controls: 0,
          rel: 0,
          modestbranding: 1,
          fs: 0, // disable fullscreen to prevent skip bypass
          disablekb: 1,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            if (autoPlayRef.current) {
              playerRef.current?.playVideo();
            }
            startPolling();
          },
          onStateChange: (event: { data: number }) => {
            if (event.data === YT_PLAYER_STATE.ENDED) {
              stopPolling();
              onVideoEndRef.current();
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
  }, [youtubeUrl, startPolling, stopPolling]);

  // Resume polling state when question is dismissed
  useEffect(() => {
    if (!questionVisible && playerRef.current) {
      const state = playerRef.current.getPlayerState();
      if (state === YT_PLAYER_STATE.PAUSED) {
        playerRef.current.playVideo();
      }
    }
  }, [questionVisible]);

  useEffect(() => {
    if (!seekRequest || !playerRef.current) return;
    if (lastSeekNonceRef.current === seekRequest.nonce) return;

    lastSeekNonceRef.current = seekRequest.nonce;
    triggeredRef.current.clear();
    playerRef.current.seekTo(Math.max(0, seekRequest.time), true);

    // Only auto-resume if a question overlay is not currently visible.
    if (!questionVisibleRef.current) {
      playerRef.current.playVideo();
    }
  }, [seekRequest]);

  return (
    <div className="relative w-full h-full bg-black">
      <div
        ref={containerRef}
        className="w-full h-full [&>div]:w-full [&>div]:h-full [&_iframe]:w-full [&_iframe]:h-full"
      />
    </div>
  );
};
