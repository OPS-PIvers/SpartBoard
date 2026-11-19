// The question prompt's recorded audio: the toolbar mic button and the row under the prompt box.
import React, { useState } from 'react';
import { Loader2, Mic, Play, RotateCcw, Square, Trash2 } from 'lucide-react';
import type { QuestionAudio } from '@/types';
import { tourTypeAttr } from '@/config/tourAnchors';
import { formatAudioDuration, questionAudioUrl } from '@/utils/questionAudio';
import { usePromptAudio } from './usePromptAudio';

export type PromptAudioState = ReturnType<typeof usePromptAudio>;

/** Mounts the recorder only where audio can be recorded or already exists. */
export const PromptAudioHost: React.FC<{
  audio: QuestionAudio | undefined;
  onChange: (audio: QuestionAudio | undefined) => void;
  children: (state: PromptAudioState) => React.ReactNode;
}> = ({ audio, onChange, children }) => (
  <>{children(usePromptAudio(audio, onChange))}</>
);

/** The mic button at the end of the prompt toolbar. */
export const PromptAudioMicButton: React.FC<{
  state: PromptAudioState;
  disabled?: boolean;
}> = ({ state, disabled }) => {
  const { recorder, saving } = state;
  const recording = recorder.phase !== 'idle';
  return (
    <button
      type="button"
      aria-label={recording ? 'Stop' : 'Record audio'}
      aria-pressed={recording}
      title={recording ? 'Stop' : 'Record audio'}
      disabled={(disabled ?? false) || saving}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => (recording ? recorder.stop() : void recorder.start())}
      className={`rounded p-1 transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-brand-blue-primary ${
        recording
          ? 'bg-brand-red-primary text-white'
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
      }`}
      {...tourTypeAttr('quiz-editor.prompt-record-audio', 'quiz')}
    >
      <Mic className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
};

const rowButton =
  'inline-flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-blue-primary disabled:opacity-40';

/** Recording, saving or recorded state, shown under the prompt box. */
export const PromptAudioRow: React.FC<{
  state: PromptAudioState;
  canRecord: boolean;
}> = ({ state, canRecord }) => {
  const { audio, onChange, saving, recorder } = state;
  const [playing, setPlaying] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  if (recorder.phase !== 'idle') {
    return (
      <div className="mt-2 flex items-center gap-3 border-y border-slate-200 py-1.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-brand-red-primary">
          <span
            className="h-2.5 w-2.5 rounded-full bg-brand-red-primary"
            aria-hidden
          />
          Recording{' '}
          <span className="tabular-nums">
            {formatAudioDuration(recorder.elapsed)}
          </span>
        </span>
        <button
          type="button"
          onClick={recorder.stop}
          className={`${rowButton} ml-auto`}
          {...tourTypeAttr('quiz-editor.prompt-audio-stop', 'quiz')}
        >
          <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
          Stop
        </button>
      </div>
    );
  }
  if (saving) {
    return (
      <div className="mt-2 flex items-center gap-2 border-y border-slate-200 py-2 text-sm text-slate-600">
        <Loader2
          className="h-4 w-4 animate-spin motion-reduce:animate-none"
          aria-hidden
        />
        Saving audio
      </div>
    );
  }
  if (!audio) return null;

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    el.currentTime = 0;
    setPlaying(true);
    el.play().catch(() => setPlaying(false));
  };

  return (
    <div className="mt-2 flex items-center gap-1 border-y border-slate-200 py-1">
      <span className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap text-sm font-semibold text-slate-800">
        <Mic className="h-4 w-4 text-slate-500" aria-hidden />
        Question audio
        <span className="font-normal tabular-nums text-slate-500">
          {formatAudioDuration(audio.durationSec)}
        </span>
      </span>
      <button
        type="button"
        onClick={togglePlay}
        className={rowButton}
        {...tourTypeAttr('quiz-editor.prompt-audio-play', 'quiz')}
      >
        {playing ? (
          <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
        ) : (
          <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
        )}
        {playing ? 'Stop' : 'Play'}
      </button>
      {canRecord && (
        <button
          type="button"
          onClick={() => {
            audioRef.current?.pause();
            setPlaying(false);
            void recorder.start();
          }}
          className={rowButton}
          {...tourTypeAttr('quiz-editor.prompt-audio-rerecord', 'quiz')}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Record again
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          audioRef.current?.pause();
          setPlaying(false);
          onChange(undefined);
        }}
        className={`${rowButton} hover:text-brand-red-primary`}
        {...tourTypeAttr('quiz-editor.prompt-audio-remove', 'quiz')}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        Remove
      </button>
      <audio
        ref={audioRef}
        src={questionAudioUrl(audio)}
        preload="none"
        className="hidden"
        onEnded={() => setPlaying(false)}
        onError={() => setPlaying(false)}
      />
    </div>
  );
};
