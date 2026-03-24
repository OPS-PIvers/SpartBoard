import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';
import { GuidedLearningPublicStep } from '@/types';

interface Props {
  step: GuidedLearningPublicStep;
  autoPlay?: boolean;
  onEnded?: () => void;
}

export const AudioInteraction: React.FC<Props> = ({
  step,
  autoPlay,
  onEnded,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (autoPlay && audioRef.current) {
      void audioRef.current.play().catch(() => {
        /* autoplay blocked; user can press play */
      });
    }
  }, [autoPlay]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      void audioRef.current.play().catch(() => {
        /* autoplay blocked; user can press play */
      });
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (!step.audioUrl) return null;

  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <div className="bg-slate-800/95 border border-white/20 rounded-2xl p-5 max-w-xs w-full shadow-xl">
        <audio
          ref={audioRef}
          src={step.audioUrl}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            onEnded?.();
          }}
          onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        />
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <Volume2 className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate">
              {step.label ?? 'Audio'}
            </p>
            {step.text && (
              <p className="text-slate-400 text-xs truncate">{step.text}</p>
            )}
          </div>
          <button
            onClick={togglePlay}
            className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center flex-shrink-0 transition-colors"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <Pause className="w-4 h-4 text-white" />
            ) : (
              <Play className="w-4 h-4 text-white ml-0.5" />
            )}
          </button>
        </div>
        {/* Progress bar */}
        <div className="relative h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full bg-indigo-500 rounded-full transition-all"
            style={{
              width: duration > 0 ? `${(progress / duration) * 100}%` : '0%',
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>{formatTime(progress)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};
