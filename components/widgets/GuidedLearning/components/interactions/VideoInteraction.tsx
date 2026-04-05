import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { GuidedLearningPublicStep } from '@/types';
import { extractYouTubeId } from '@/utils/youtube';

interface Props {
  step: GuidedLearningPublicStep;
  onClose: () => void;
  onEnded?: () => void;
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
          aria-label="Close video"
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
        {youtubeId ? (
          <div className="aspect-video w-full">
            <iframe
              className="w-full h-full border-0"
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
