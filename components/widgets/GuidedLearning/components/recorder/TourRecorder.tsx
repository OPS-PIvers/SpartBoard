import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Circle, Flag, Pause, Play, Square, Trash2 } from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';
import {
  useTourCapture,
  type CaptureError,
  type TourRecording,
} from './useTourCapture';
import type { NameMatcher } from './redaction';

const ERROR_KEYS: Record<CaptureError, string> = {
  unsupported: 'glRecorder.unsupported',
  'not-chrome': 'glRecorder.notChrome',
  cancelled: 'glRecorder.cancelled',
  'not-this-tab': 'glRecorder.notThisTab',
};

interface TourRecorderProps {
  /** Roster names blurred into every frame. */
  matcher: NameMatcher | null;
  onFinish: (recording: TourRecording) => void;
  onDiscard: () => void;
}

const btn =
  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-slate-100 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-50';

/** Floating recorder pill; the capture never sees it and anchor resolution skips it. */
export const TourRecorder: React.FC<TourRecorderProps> = ({
  matcher,
  onFinish,
  onDiscard,
}) => {
  const { t } = useTranslation();
  const pillRef = useRef<HTMLDivElement>(null);
  const capture = useTourCapture({ chromeRef: pillRef, matcher });
  const [finishing, setFinishing] = useState(false);
  const { status, stepCount } = capture;
  const live = status === 'recording' || status === 'paused';
  const message = capture.error ? t(ERROR_KEYS[capture.error]) : null;

  return createPortal(
    <div
      ref={pillRef}
      role="toolbar"
      aria-label={t('glRecorder.label')}
      data-tour-ignore=""
      data-testid="tour-recorder"
      className="fixed bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 rounded-2xl bg-slate-900/90 px-2 py-1.5 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-xl"
      style={{ zIndex: Z_INDEX.tour }}
    >
      <div className="flex items-center gap-1">
        {live ? (
          <span role="status" className="px-2 text-sm font-semibold">
            {t(
              status === 'recording'
                ? 'glRecorder.recording'
                : 'glRecorder.paused',
              { count: stepCount }
            )}
          </span>
        ) : (
          <button
            type="button"
            className={btn}
            disabled={status === 'starting'}
            onClick={() => void capture.start()}
          >
            <Circle className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            {t('glRecorder.record')}
          </button>
        )}
        {status === 'recording' && (
          <>
            <button type="button" className={btn} onClick={capture.pause}>
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              {t('glRecorder.pause')}
            </button>
            <button
              type="button"
              className={btn}
              title={t('glRecorder.markStepHint')}
              onClick={capture.markStep}
            >
              <Flag className="h-3.5 w-3.5" aria-hidden="true" />
              {t('glRecorder.markStep')}
            </button>
          </>
        )}
        {status === 'paused' && (
          <button type="button" className={btn} onClick={capture.resume}>
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            {t('glRecorder.resume')}
          </button>
        )}
        {live && (
          <button
            type="button"
            className={btn}
            disabled={stepCount === 0 || finishing}
            onClick={() => {
              setFinishing(true);
              void capture.finish().then(onFinish);
            }}
          >
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
            {t('glRecorder.finish')}
          </button>
        )}
        <button
          type="button"
          className={btn}
          onClick={() => {
            capture.discard();
            onDiscard();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t('glRecorder.discard')}
        </button>
      </div>
      {message && (
        <p role="alert" className="px-2 pb-0.5 text-xs text-slate-200">
          {message}
        </p>
      )}
    </div>,
    document.body
  );
};
