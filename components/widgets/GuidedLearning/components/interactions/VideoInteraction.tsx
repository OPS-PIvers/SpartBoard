import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { GuidedLearningPublicStep } from '@/types';

interface Props {
  step: GuidedLearningPublicStep;
  onClose: () => void;
  onEnded?: () => void;
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

export const VideoInteraction: React.FC<Props> = ({
  step,
  onClose,
  onEnded,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const url = step.videoUrl ?? '';
  const youtubeId = extractYouTubeId(url);

  if (!url) return null;

  return (
    <div className="w-full h-full flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm">
      <div className="relative bg-black rounded-xl overflow-hidden shadow-2xl w-full max-w-lg">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 w-7 h-7 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
          aria-label="Close video"
        >
          <X className="w-4 h-4" />
        </button>
        {step.label && (
          <div className="px-3 py-2 bg-black/80 text-white text-sm font-semibold">
            {step.label}
          </div>
        )}
        {youtubeId ? (
          <div className="aspect-video w-full">
            <iframe
              className="w-full h-full"
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`}
              title={step.label ?? 'Video'}
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
          />
        )}
      </div>
    </div>
  );
};
