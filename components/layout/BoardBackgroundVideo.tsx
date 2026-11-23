import React, { useCallback, useEffect, useState } from 'react';
import {
  buildBackgroundVideoSrc,
  loadYouTubeApi,
  YT_PLAYER_STATE,
} from '@/utils/youtube';

interface BoardBackgroundVideoProps {
  videoId: string;
  ref: React.Ref<HTMLIFrameElement>;
}

/** Full-viewport ambient YouTube background that loops by seeking, so quality holds. */
export const BoardBackgroundVideo: React.FC<BoardBackgroundVideoProps> = ({
  videoId,
  ref,
}) => {
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null);
  const [apiFailed, setApiFailed] = useState(false);

  useEffect(() => {
    if (!iframe || apiFailed) return;
    let cancelled = false;
    loadYouTubeApi(
      () => {
        if (cancelled || !window.YT) return;
        const player = new window.YT.Player(iframe, {
          events: {
            onStateChange: (event) => {
              if (cancelled || event.data !== YT_PLAYER_STATE.ENDED) return;
              player.seekTo(0, true);
              player.playVideo();
            },
          },
        });
      },
      () => {
        if (!cancelled) setApiFailed(true);
      }
    );
    // No destroy(): it removes the iframe React owns. The key below retires it instead.
    return () => {
      cancelled = true;
    };
  }, [iframe, apiFailed]);

  const setRefs = useCallback(
    (node: HTMLIFrameElement | null) => {
      setIframe(node);
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );

  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none bg-black">
      <iframe
        key={`${videoId}-${apiFailed ? 'playlist' : 'seek'}`}
        ref={setRefs}
        src={buildBackgroundVideoSrc(
          videoId,
          window.location.origin,
          apiFailed
        )}
        className="absolute top-1/2 left-1/2 w-screen h-[56.25vw] min-h-screen min-w-[177.78vh] -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-80"
        allow="autoplay; encrypted-media"
        title="Ambient background video"
      />
    </div>
  );
};
