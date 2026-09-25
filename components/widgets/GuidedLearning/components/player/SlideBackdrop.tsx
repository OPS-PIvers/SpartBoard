import React, { useEffect, useRef } from 'react';

const BACKDROP_STYLE: React.CSSProperties = {
  filter: 'blur(24px) brightness(0.45)',
  transform: 'scale(1.15)',
};

/** Longest side of the video still; it is blurred, so a small canvas is enough. */
const STILL_PX = 160;

interface SlideBackdropProps {
  url: string;
  kind: 'image' | 'video';
  /** The stage's mounted video, drawn once as the still behind it. */
  video: HTMLVideoElement | null;
}

/** Blurred, dimmed copy of the slide filling the letterbox around the contained media. */
export const SlideBackdrop: React.FC<SlideBackdropProps> = ({
  url,
  kind,
  video,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (kind !== 'video' || !video || !canvas) return;
    const draw = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return;
      const k = STILL_PX / Math.max(w, h);
      canvas.width = Math.max(1, Math.round(w * k));
      canvas.height = Math.max(1, Math.round(h * k));
      try {
        canvas
          .getContext('2d')
          ?.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch {
        // No 2D canvas (tests, old browsers): the letterbox stays plain.
      }
    };
    if (video.readyState >= 2) draw();
    video.addEventListener('loadeddata', draw);
    video.addEventListener('seeked', draw, { once: true });
    return () => {
      video.removeEventListener('loadeddata', draw);
      video.removeEventListener('seeked', draw);
    };
  }, [kind, video, url]);

  return (
    <div
      aria-hidden="true"
      data-testid="gl-slide-backdrop"
      className="absolute inset-0 overflow-hidden pointer-events-none"
    >
      {kind === 'video' ? (
        <canvas
          key={url}
          ref={canvasRef}
          className="h-full w-full object-cover"
          style={BACKDROP_STYLE}
        />
      ) : (
        // A CSS background adds no <img> to the stage and reuses the slide's cached image.
        <div
          className="h-full w-full bg-cover bg-center"
          style={{
            ...BACKDROP_STYLE,
            backgroundImage: `url(${JSON.stringify(url)})`,
          }}
        />
      )}
    </div>
  );
};
