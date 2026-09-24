import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GuidedLearningPublicStep } from '@/types';
import {
  extractYouTubeId,
  loadYouTubeApi,
  YT_PLAYER_STATE,
  type YTPlayer,
} from '@/utils/youtube';

interface Props {
  step: GuidedLearningPublicStep;
  onClose: () => void;
  onEnded?: () => void;
  /** Embed YouTube through the IFrame API so its ENDED state calls onEnded. */
  youtubeApi?: boolean;
  /** Pauses playback while set, and resumes what it paused when cleared. */
  paused?: boolean;
  onError?: () => void;
}

export const VideoInteraction: React.FC<Props> = ({
  step,
  onClose,
  onEnded,
  youtubeApi = false,
  paused = false,
  onError,
}) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const url = step.videoUrl ?? '';
  const youtubeId = extractYouTubeId(url);
  const ytHostRef = useRef<HTMLDivElement>(null);
  const onEndedRef = useRef(onEnded);
  // eslint-disable-next-line react-hooks/refs
  onEndedRef.current = onEnded;
  const onErrorRef = useRef(onError);
  // eslint-disable-next-line react-hooks/refs
  onErrorRef.current = onError;
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const heldPlayingRef = useRef(false);

  // If the API never loads, nothing fires and the step waits for Next.
  const apiVideoId = youtubeApi ? youtubeId : null;
  useEffect(() => {
    if (!apiVideoId) return;
    let cancelled = false;
    let player: YTPlayer | null = null;
    const host = ytHostRef.current;
    loadYouTubeApi(() => {
      if (cancelled || !host || !window.YT?.Player) return;
      // The API swaps this div for its iframe, so React never owns it.
      const el = document.createElement('div');
      el.id = `gl-yt-${Math.random().toString(36).slice(2)}`;
      host.appendChild(el);
      player = new window.YT.Player(el.id, {
        height: '100%',
        width: '100%',
        videoId: apiVideoId,
        playerVars: { autoplay: 1, rel: 0, playsinline: 1 },
        events: {
          onStateChange: (e) => {
            if (e.data === YT_PLAYER_STATE.ENDED) onEndedRef.current?.();
          },
          onError: () => onErrorRef.current?.(),
        },
      });
      ytPlayerRef.current = player;
    });
    return () => {
      cancelled = true;
      ytPlayerRef.current = null;
      try {
        player?.destroy();
      } catch {
        // The iframe may already be gone.
      }
      if (host) host.innerHTML = '';
    };
  }, [apiVideoId]);

  // Pausing the element or YouTube player is external-system sync.
  useEffect(() => {
    const el = videoRef.current;
    const yt = ytPlayerRef.current;
    try {
      if (paused) {
        heldPlayingRef.current =
          heldPlayingRef.current || (el ? !el.paused : yt !== null);
        el?.pause();
        yt?.pauseVideo();
      } else if (heldPlayingRef.current) {
        heldPlayingRef.current = false;
        if (el) void el.play().catch(() => undefined);
        yt?.playVideo();
      }
    } catch {
      // The YouTube player may not be ready yet.
    }
  }, [paused]);

  if (!url) return null;

  return (
    <div
      className="w-full h-full flex items-center justify-center bg-black/60 backdrop-blur-sm"
      style={{ padding: 'min(12px, 3cqmin)' }}
    >
      <div
        className="relative bg-black rounded-xl overflow-hidden shadow-2xl w-full"
        style={{ maxWidth: 'min(500px, 90cqw)' }}
      >
        <button
          onClick={onClose}
          className="absolute z-10 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-all active:scale-90"
          style={{
            top: 'min(8px, 2cqmin)',
            right: 'min(8px, 2cqmin)',
            width: 'min(28px, 7cqmin)',
            height: 'min(28px, 7cqmin)',
          }}
          aria-label={t('glPlayer.closeVideo')}
        >
          <X
            style={{
              width: 'min(16px, 4cqmin)',
              height: 'min(16px, 4cqmin)',
            }}
          />
        </button>
        {step.label && (
          <div
            className="bg-black/80 text-white font-bold truncate"
            style={{
              padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
              fontSize: 'min(12px, 3.2cqmin)',
            }}
          >
            {step.label}
          </div>
        )}
        {apiVideoId ? (
          <div className="aspect-video w-full">
            <div
              ref={ytHostRef}
              className="w-full h-full"
              data-testid="gl-youtube-player"
            />
          </div>
        ) : youtubeId ? (
          <div className="aspect-video w-full">
            <iframe
              className="w-full h-full border-0"
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`}
              title={step.label ?? t('glPlayer.video')}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <video
            ref={videoRef}
            src={url}
            controls
            autoPlay
            className="w-full aspect-video"
            onEnded={onEnded}
            onError={onError}
          />
        )}
      </div>
    </div>
  );
};
