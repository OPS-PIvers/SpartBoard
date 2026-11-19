// The question prompt's recorded audio: a toolbar mic button that opens a popover with the recording's controls.
import React, { useEffect, useRef, useState } from 'react';
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

const rowButton =
  'inline-flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-blue-primary disabled:opacity-40';

/** The mic at the end of the prompt toolbar; with a recording it shows its length and opens the controls. */
export const PromptAudioMicButton: React.FC<{
  state: PromptAudioState;
  canRecord: boolean;
}> = ({ state, canRecord }) => {
  const { audio, recorder, saving } = state;
  const recording = recorder.phase !== 'idle';
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const showPanel = open || recording || saving;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      // The app's select list and dialogs render outside the popover.
      if (target?.closest?.('[data-click-outside-ignore], [role="dialog"]'))
        return;
      if (!wrapRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!audio && !canRecord && !recording && !saving) return null;

  const onClick = () => {
    if (recording) {
      recorder.stop();
      return;
    }
    if (!audio && !saving) {
      setOpen(true);
      void recorder.start();
      return;
    }
    setOpen((o) => !o);
  };
  const label = recording ? 'Stop' : audio ? 'Question audio' : 'Record audio';

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={audio ? showPanel : undefined}
        aria-pressed={recording}
        title={label}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className={`flex items-center gap-1 rounded p-1 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-brand-blue-primary ${
          recording
            ? 'bg-brand-red-primary text-white'
            : audio
              ? 'bg-brand-blue-primary px-1.5 text-white hover:bg-brand-blue-dark'
              : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
        }`}
        {...tourTypeAttr('quiz-editor.prompt-record-audio', 'quiz')}
      >
        <Mic className="h-3.5 w-3.5" aria-hidden />
        {audio && !recording && (
          <span>{formatAudioDuration(audio.durationSec)}</span>
        )}
      </button>
      {showPanel && (
        <div
          role="dialog"
          aria-label="Question audio"
          className="absolute left-0 top-full z-popover mt-1.5 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
        >
          <PromptAudioPanel
            state={state}
            canRecord={canRecord}
            onRemoved={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
};

/** Recording, saving or recorded state, inside the mic popover. */
const PromptAudioPanel: React.FC<{
  state: PromptAudioState;
  canRecord: boolean;
  onRemoved: () => void;
}> = ({ state, canRecord, onRemoved }) => {
  const { audio, onChange, saving, recorder } = state;
  const [playing, setPlaying] = useState(false);
  const replaysId = React.useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (recorder.phase !== 'idle') {
    return (
      <div className="flex items-center gap-3 px-1">
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
      <div className="flex min-h-8 items-center gap-2 px-1 text-sm text-slate-600">
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
  const halt = () => {
    audioRef.current?.pause();
    setPlaying(false);
  };

  return (
    <div className="flex flex-col">
      <div className="flex min-h-8 items-center gap-2 px-1 text-sm font-semibold text-slate-800">
        Question audio
        <span className="font-normal tabular-nums text-slate-500">
          {formatAudioDuration(audio.durationSec)}
        </span>
      </div>
      <div className="flex items-center gap-1 border-b border-slate-200 pb-1.5">
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
              halt();
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
            halt();
            onChange(undefined);
            onRemoved();
          }}
          className={`${rowButton} hover:text-brand-red-primary`}
          {...tourTypeAttr('quiz-editor.prompt-audio-remove', 'quiz')}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Remove
        </button>
      </div>
      <div className="flex min-h-10 items-center gap-3 px-1 pt-1.5">
        <label
          htmlFor={replaysId}
          className="text-xs font-bold uppercase tracking-wider text-slate-500"
        >
          Replays
        </label>
        <select
          id={replaysId}
          value={audio.playLimit ?? ''}
          onChange={(e) => {
            const n = Number(e.target.value);
            const rest: QuestionAudio = { ...audio };
            delete rest.playLimit;
            onChange(n > 0 ? { ...rest, playLimit: n } : rest);
          }}
          className="ml-auto rounded-md border border-slate-300 bg-white py-1 pl-2 pr-7 text-sm text-slate-800 focus-visible:outline-2 focus-visible:outline-brand-blue-primary"
          {...tourTypeAttr('quiz-editor.prompt-audio-replays', 'quiz')}
        >
          <option value="">Unlimited</option>
          <option value="1">None</option>
          <option value="2">1</option>
          <option value="3">2</option>
          <option value="4">3</option>
        </select>
      </div>
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
