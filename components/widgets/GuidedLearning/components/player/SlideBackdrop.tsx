import React, { useEffect, useRef } from 'react';

const BACKDROP_STYLE: React.CSSProperties = {
  filter: 'blur(24px) brightness(0.45)',
  transform: 'scale(1.15)',
};

/** Longest side of the still; it is blurred, so a small canvas is enough. */
const STILL_PX = 160;

interface SlideBackdropProps {
  url: string;
  /** The stage's mounted image or video, drawn once as the still behind it. */
  media: HTMLImageElement | HTMLVideoElement | null;
}

/** Blurred, dimmed still of the slide filling the letterbox around the contained media. */
export const SlideBackdrop: React.FC<SlideBackdropProps> = ({ url, media }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    // The previous slide's media can still be mounted for one render; skip it.
    if (!media || !canvas || media.getAttribute('src') !== url) return;
    const isVideo = media instanceof HTMLVideoElement;
    const draw = () => {
      const w = isVideo ? media.videoWidth : media.naturalWidth;
      const h = isVideo ? media.videoHeight : media.naturalHeight;
      if (!w || !h) return;
      const k = STILL_PX / Math.max(w, h);
      canvas.width = Math.max(1, Math.round(w * k));
      canvas.height = Math.max(1, Math.round(h * k));
      try {
        canvas
          .getContext('2d')
          ?.drawImage(media, 0, 0, canvas.width, canvas.height);
      } catch {
        // No 2D canvas (tests, old browsers): the letterbox stays plain.
      }
    };
    const ready = isVideo ? media.readyState >= 2 : media.complete;
    if (ready) draw();
    const loadEvent = isVideo ? 'loadeddata' : 'load';
    media.addEventListener(loadEvent, draw);
    if (isVideo) media.addEventListener('seeked', draw, { once: true });
    return () => {
      media.removeEventListener(loadEvent, draw);
      if (isVideo) media.removeEventListener('seeked', draw);
    };
  }, [media, url]);

  return (
    <div
      aria-hidden="true"
      data-testid="gl-slide-backdrop"
      className="absolute inset-0 overflow-hidden pointer-events-none"
    >
      {/* A still, so an animated slide never re-blurs every frame. */}
      <canvas
        key={url}
        ref={canvasRef}
        className="h-full w-full object-cover"
        style={BACKDROP_STYLE}
      />
    </div>
  );
};
