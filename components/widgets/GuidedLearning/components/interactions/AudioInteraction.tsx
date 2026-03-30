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
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ padding: 'min(16px, 4cqmin)' }}
    >
      <div
        className="bg-slate-800/95 border border-white/20 rounded-2xl w-full shadow-xl"
        style={{ maxWidth: 'min(320px, 80cqw)', padding: 'min(20px, 5cqmin)' }}
      >
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
        <div
          className="flex items-center"
          style={{
            gap: 'min(12px, 3cqmin)',
            marginBottom: 'min(12px, 3cqmin)',
          }}
        >
          <div
            className="rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0"
            style={{
              width: 'min(40px, 10cqmin)',
              height: 'min(40px, 10cqmin)',
            }}
          >
            <Volume2
              className="text-white"
              style={{
                width: 'min(20px, 5cqmin)',
                height: 'min(20px, 5cqmin)',
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-white font-bold truncate"
              style={{ fontSize: 'min(14px, 3.5cqmin)' }}
            >
              {step.label ?? 'Audio'}
            </p>
            {step.text && (
              <p
                className="text-slate-400 font-medium truncate"
                style={{ fontSize: 'min(11px, 2.8cqmin)' }}
              >
                {step.text}
              </p>
            )}
          </div>
          <button
            onClick={togglePlay}
            className="rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
            style={{ width: 'min(36px, 9cqmin)', height: 'min(36px, 9cqmin)' }}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <Pause
                className="text-white"
                style={{
                  width: 'min(16px, 4cqmin)',
                  height: 'min(16px, 4cqmin)',
                }}
              />
            ) : (
              <Play
                className="text-white"
                style={{
                  width: 'min(16px, 4cqmin)',
                  height: 'min(16px, 4cqmin)',
                  marginLeft: 'min(2px, 0.5cqmin)',
                }}
              />
            )}
          </button>
        </div>
        {/* Progress bar */}
        <div
          className="relative bg-slate-700 rounded-full overflow-hidden"
          style={{ height: 'min(6px, 1.5cqmin)' }}
        >
          <div
            className="absolute left-0 top-0 h-full bg-indigo-500 rounded-full transition-all"
            style={{
              width: duration > 0 ? `${(progress / duration) * 100}%` : '0%',
            }}
          />
        </div>
        <div
          className="flex justify-between text-slate-500 font-mono mt-1"
          style={{ fontSize: 'min(10px, 2.5cqmin)' }}
        >
          <span>{formatTime(progress)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};
