import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Mic, MicOff, RotateCcw } from 'lucide-react';
import { RecordingConsentNotice } from './RecordingConsentNotice';

type MicStep = 'checking' | 'ask' | 'asking' | 'blocked' | 'no-mic';

export interface MicrophoneGateDeps {
  queryPermission: () => Promise<PermissionState | null>;
  watchPermission: (onGranted: () => void) => () => void;
  getStream: () => Promise<MediaStream>;
}

const defaultDeps: MicrophoneGateDeps = {
  queryPermission: async () => {
    try {
      const status = await navigator.permissions.query({
        name: 'microphone',
      });
      return status.state;
    } catch {
      // Firefox has no 'microphone' permission name; ask instead.
      return null;
    }
  },
  watchPermission: (onGranted) => {
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const onChange = () => {
      if (status?.state === 'granted') onGranted();
    };
    navigator.permissions
      ?.query({ name: 'microphone' })
      .then((s) => {
        if (cancelled) return;
        status = s;
        s.addEventListener('change', onChange);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      status?.removeEventListener('change', onChange);
    };
  },
  getStream: () => navigator.mediaDevices.getUserMedia({ audio: true }),
};

const errorName = (err: unknown): string =>
  err && typeof err === 'object' && 'name' in err ? String(err.name) : '';

/** Asks for the mic before question one, so the browser prompt never counts as a tab exit. */
export const MicrophoneGate: React.FC<{
  light: boolean;
  noticeRequired: boolean;
  noticeAckedAt: number | null;
  onAcknowledgeNotice: () => void;
  onReady: () => void;
  deps?: MicrophoneGateDeps;
}> = ({
  light,
  noticeRequired,
  noticeAckedAt,
  onAcknowledgeNotice,
  onReady,
  deps = defaultDeps,
}) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<MicStep>('checking');
  const noticePending = noticeRequired && noticeAckedAt === null;

  // The Tennessen notice comes first: the mic is never probed before it.
  useEffect(() => {
    if (noticePending) return;
    let cancelled = false;
    void deps.queryPermission().then((state) => {
      if (cancelled) return;
      if (state === 'granted') onReady();
      else setStep(state === 'denied' ? 'blocked' : 'ask');
    });
    const stopWatching = deps.watchPermission(onReady);
    return () => {
      cancelled = true;
      stopWatching();
    };
  }, [deps, noticePending, onReady]);

  const ask = useCallback(async () => {
    setStep('asking');
    try {
      const stream = await deps.getStream();
      stream.getTracks().forEach((track) => track.stop());
      onReady();
    } catch (err) {
      const name = errorName(err);
      setStep(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'blocked'
          : 'no-mic'
      );
    }
  }, [deps, onReady]);

  const page = `h-screen h-dvh overflow-y-auto ${
    light ? 'bg-linear-to-b from-white to-slate-100' : 'bg-slate-900'
  }`;

  if (noticePending) {
    return (
      <div className={page}>
        <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center p-6">
          <RecordingConsentNotice
            light={light}
            onAcknowledge={onAcknowledgeNotice}
          />
        </div>
      </div>
    );
  }

  if (step === 'checking') {
    return (
      <div className={`${page} flex items-center justify-center`}>
        <Loader2
          aria-hidden
          className={`h-8 w-8 animate-spin ${light ? 'text-brand-blue-primary' : 'text-slate-300'}`}
        />
      </div>
    );
  }

  const failed = step === 'blocked' || step === 'no-mic';
  const title =
    step === 'blocked'
      ? t('quizMediaResponse.micGate.blockedTitle', 'Microphone is blocked')
      : step === 'no-mic'
        ? t('quizMediaResponse.micGate.noMicTitle', 'No microphone found')
        : t('quizMediaResponse.micGate.title', 'Turn on your microphone');
  const body =
    step === 'blocked'
      ? t(
          'quizMediaResponse.micGate.blockedBody',
          'Click the icon at the left of the address bar, turn on Microphone, then try again.'
        )
      : step === 'no-mic'
        ? t(
            'quizMediaResponse.micGate.noMicBody',
            'Plug in a microphone or headset, then try again.'
          )
        : step === 'asking'
          ? t(
              'quizMediaResponse.micGate.askingBody',
              'Choose Allow in the box your browser shows.'
            )
          : t(
              'quizMediaResponse.micGate.body',
              'This quiz has questions you answer out loud. Allow the microphone to start.'
            );

  return (
    <div className={page}>
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center p-6">
        <section
          aria-labelledby="mic-gate-heading"
          aria-live="polite"
          className={`rounded-3xl border p-6 shadow-xs backdrop-blur-xs ${
            light
              ? 'border-slate-200 bg-white/90'
              : 'border-slate-700 bg-slate-800/60'
          }`}
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                failed
                  ? light
                    ? 'bg-brand-red-primary/10 text-brand-red-primary'
                    : 'bg-brand-red-primary/25 text-red-200'
                  : light
                    ? 'bg-brand-blue-primary/10 text-brand-blue-primary'
                    : 'bg-brand-blue-light/25 text-brand-blue-lighter'
              }`}
            >
              {failed ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </span>
            <div>
              <h3
                id="mic-gate-heading"
                className={`text-lg font-bold leading-snug ${
                  light ? 'text-slate-900' : 'text-white'
                }`}
              >
                {title}
              </h3>
              <p
                className={`mt-1 text-sm ${light ? 'text-slate-600' : 'text-slate-300'}`}
              >
                {body}
              </p>
            </div>
          </div>
          <button
            // no-tour-anchor: student quiz app, outside teacher tours
            type="button"
            onClick={() => void ask()}
            disabled={step === 'asking'}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-blue-primary px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-blue-dark focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {step === 'asking' ? (
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            ) : failed ? (
              <RotateCcw aria-hidden className="h-4 w-4" />
            ) : (
              <Mic aria-hidden className="h-4 w-4" />
            )}
            {failed
              ? t('quizMediaResponse.micGate.retry', 'Try again')
              : t('quizMediaResponse.micGate.allow', 'Allow microphone')}
          </button>
        </section>
      </div>
    </div>
  );
};
