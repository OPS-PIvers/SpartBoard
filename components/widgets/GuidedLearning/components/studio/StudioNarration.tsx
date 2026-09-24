import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Sparkles, Square, Trash2 } from 'lucide-react';
import type { GuidedLearningNarration, GuidedLearningStep } from '@/types';
import {
  useAudioRecording,
  type AudioRecordingDeps,
} from '@/hooks/useAudioRecording';
import { TakeReviewPlayer } from '@/components/quiz/recording/TakeReviewPlayer';
import { formatClock } from '@/components/quiz/recording/formatClock';
import {
  generateNarration,
  narrationSourceText,
  narrationTextHash,
} from '../../utils/narration';
import type { GuidedLearningEditorController } from '../useGuidedLearningEditorState';

/** Longest take the Studio records, in seconds. */
const TAKE_LIMIT_SECONDS = 120;
const RECORDING_CONFIG = {
  prepSeconds: 0,
  limitSeconds: TAKE_LIMIT_SECONDS,
  prepExpiry: 'armed',
  takeLimit: null,
} as const;

const btn =
  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary disabled:cursor-not-allowed disabled:opacity-50';
const secondaryBtn = `${btn} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
const primaryBtn = `${btn} border-brand-blue-primary bg-brand-blue-primary text-white hover:bg-brand-blue-dark`;

/** Whether a take's text hash no longer matches the step; null while hashing. */
function useIsStale(
  narration: GuidedLearningNarration | undefined,
  sourceText: string
): boolean | null {
  const key = `${narration?.textHash ?? ''}|${sourceText}`;
  const [result, setResult] = useState<{ key: string; stale: boolean }>({
    key: '',
    stale: false,
  });
  // Web Crypto is async, so the hash is compared outside render.
  useEffect(() => {
    const expected = narration?.textHash;
    if (!expected) return;
    let live = true;
    void narrationTextHash(sourceText).then((hash) => {
      if (live) setResult({ key, stale: hash !== expected });
    });
    return () => {
      live = false;
    };
  }, [key, narration?.textHash, sourceText]);
  if (!narration?.textHash) return false;
  return result.key === key ? result.stale : null;
}

interface RecorderProps {
  onSave: (blob: Blob, mimeType: string, durationMs: number) => Promise<void>;
  onCancel: () => void;
  deps?: AudioRecordingDeps;
}

/** Record, review and keep one take, on the quiz recorder's state machine. */
const NarrationRecorder: React.FC<RecorderProps> = ({
  onSave,
  onCancel,
  deps,
}) => {
  const { t } = useTranslation();
  const rec = useAudioRecording({
    config: RECORDING_CONFIG,
    enabled: true,
    deps,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const take = rec.take;
    if (!take) return;
    setSaving(true);
    setError('');
    try {
      await onSave(take.blob, take.mimeType, take.durationMs);
      rec.commit();
    } catch (err) {
      console.error('[GuidedLearningStudio] Saving a recording failed:', err);
      setError(t('glStudio.narrationSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="gl-narration-recorder"
      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5"
    >
      {rec.phase === 'capture-unavailable' ? (
        <p className="text-xs text-slate-700">{t('glStudio.recUnavailable')}</p>
      ) : rec.phase === 'reviewing' && rec.takeUrl && rec.take ? (
        <TakeReviewPlayer src={rec.takeUrl} durationMs={rec.take.durationMs} />
      ) : null}
      {error && (
        <p role="alert" className="text-xs font-bold text-brand-red-primary">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {rec.phase === 'recording' ? (
          <button type="button" onClick={rec.stop} className={primaryBtn}>
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
            {t('glStudio.recStop', {
              time: formatClock(rec.recordSecondsLeft ?? 0),
            })}
          </button>
        ) : rec.phase === 'reviewing' ? (
          <>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className={primaryBtn}
            >
              {saving ? t('glStudio.recSaving') : t('glStudio.recSave')}
            </button>
            <button
              type="button"
              onClick={rec.discard}
              disabled={saving}
              className={secondaryBtn}
            >
              {t('glStudio.recDiscard')}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void rec.start()}
            disabled={rec.phase === 'requesting-permission'}
            className={primaryBtn}
          >
            <Mic className="h-3.5 w-3.5" aria-hidden="true" />
            {rec.phase === 'requesting-permission'
              ? t('glStudio.recRequesting')
              : t('glStudio.recStart')}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className={secondaryBtn}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
};

interface StudioNarrationProps {
  state: GuidedLearningEditorController;
  step: GuidedLearningStep;
  /** Injected by tests; defaults to the real microphone. */
  recorderDeps?: AudioRecordingDeps;
}

/** The selected step's narration: generate it, record your own, preview, or remove. */
export const StudioNarration: React.FC<StudioNarrationProps> = ({
  state,
  step,
  recorderDeps,
}) => {
  const { t } = useTranslation();
  const { setStepNarration, uploadNarrationTake } = state;
  const [generating, setGenerating] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const narration = step.narration;
  const sourceText = narrationSourceText(step);
  const stale = useIsStale(narration, sourceText);

  const generate = async () => {
    setGenerating(true);
    setError('');
    try {
      setStepNarration(step.id, await generateNarration(sourceText));
    } catch (err) {
      console.error('[GuidedLearningStudio] Narration failed:', err);
      setError(t('glStudio.narrationFailed'));
    } finally {
      setGenerating(false);
    }
  };

  const saveTake = async (blob: Blob, mimeType: string, durationMs: number) => {
    const [{ url, storagePath }, textHash] = await Promise.all([
      uploadNarrationTake(blob, mimeType),
      narrationTextHash(sourceText),
    ]);
    setStepNarration(step.id, {
      source: 'recorded',
      url,
      storagePath,
      durationMs,
      textHash,
    });
    setRecording(false);
  };

  const duration = narration ? formatClock(narration.durationMs / 1000) : '';

  return (
    <section
      aria-labelledby="gl-narration-heading"
      data-testid="gl-studio-narration"
      className="flex flex-col gap-2"
    >
      <h3
        id="gl-narration-heading"
        className="text-xxs font-bold uppercase tracking-wider text-slate-500"
      >
        {t('glStudio.narration')}
      </h3>
      {narration ? (
        <>
          <p className="text-xs font-bold text-slate-700">
            {narration.source === 'recorded'
              ? t('glStudio.narrationRecorded', { duration })
              : t('glStudio.narrationGenerated', { duration })}
          </p>
          {stale && (
            <p
              data-testid="gl-narration-stale"
              className="rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-900"
            >
              {narration.source === 'recorded'
                ? t('glStudio.narrationRecordedStale')
                : t('glStudio.narrationStale')}
            </p>
          )}
          <TakeReviewPlayer
            key={narration.url}
            src={narration.url}
            durationMs={narration.durationMs}
          />
        </>
      ) : (
        <p className="text-xs text-slate-600">{t('glStudio.narrationNone')}</p>
      )}
      {error && (
        <p role="alert" className="text-xs font-bold text-brand-red-primary">
          {error}
        </p>
      )}
      {recording ? (
        <NarrationRecorder
          onSave={saveTake}
          onCancel={() => setRecording(false)}
          deps={recorderDeps}
        />
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating || !sourceText}
            title={sourceText ? undefined : t('glStudio.narrationNoText')}
            className={secondaryBtn}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {generating
              ? t('glStudio.narrationGenerating')
              : narration?.source === 'generated'
                ? t('glStudio.narrationRegenerate')
                : t('glStudio.narrationGenerate')}
          </button>
          <button
            type="button"
            onClick={() => setRecording(true)}
            disabled={generating}
            className={secondaryBtn}
          >
            <Mic className="h-3.5 w-3.5" aria-hidden="true" />
            {narration?.source === 'recorded'
              ? t('glStudio.narrationRerecord')
              : t('glStudio.narrationRecord')}
          </button>
          {narration && (
            <button
              type="button"
              onClick={() => setStepNarration(step.id, undefined)}
              disabled={generating}
              className={secondaryBtn}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t('glStudio.narrationRemove')}
            </button>
          )}
        </div>
      )}
      {!sourceText && !narration && (
        <p className="text-xs text-slate-500">
          {t('glStudio.narrationNoText')}
        </p>
      )}
    </section>
  );
};

/** Set-level "Generate all": sequential, skips recorded takes and narration that is still current. */
export const StudioNarrationBatch: React.FC<{
  state: GuidedLearningEditorController;
}> = ({ state }) => {
  const { t } = useTranslation();
  const { steps, setStepNarration } = state;
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [message, setMessage] = useState('');

  const run = async () => {
    setMessage('');
    const todo: { id: string; text: string }[] = [];
    for (const s of steps) {
      if (s.narration?.source === 'recorded') continue;
      const text = narrationSourceText(s);
      if (!text) continue;
      if (
        s.narration?.textHash &&
        (await narrationTextHash(text)) === s.narration.textHash
      )
        continue;
      todo.push({ id: s.id, text });
    }
    if (todo.length === 0) {
      setMessage(t('glStudio.narrationAllNothing'));
      return;
    }
    let done = 0;
    try {
      for (const item of todo) {
        setProgress({ current: done + 1, total: todo.length });
        setStepNarration(item.id, await generateNarration(item.text));
        done++;
      }
      setMessage(t('glStudio.narrationAllDone', { count: done }));
    } catch (err) {
      console.error('[GuidedLearningStudio] Narration failed:', err);
      setMessage(t('glStudio.narrationAllFailed', { count: done }));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="flex flex-col gap-1.5" data-testid="gl-narration-batch">
      <span className="text-xs font-bold text-slate-600">
        {t('glStudio.narration')}
      </span>
      <button
        type="button"
        onClick={() => void run()}
        disabled={progress !== null || steps.length === 0}
        className={`${secondaryBtn} self-start`}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        {progress
          ? t('glStudio.narrationAllProgress', progress)
          : t('glStudio.narrationAll')}
      </button>
      <p className="text-xs text-slate-500" aria-live="polite">
        {message || t('glStudio.narrationAllHint')}
      </p>
    </div>
  );
};
