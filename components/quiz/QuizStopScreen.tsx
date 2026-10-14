import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Octagon } from 'lucide-react';

interface QuizStopScreenProps {
  /** The part the student waits to start. */
  nextPart: number;
  /** The teacher opened `nextPart`; the student taps to continue. */
  ready: boolean;
  onStart: () => Promise<void>;
  /** Empty for SSO joiners. */
  pin: string;
}

/** A self-paced student at a Stop section (QUIZ_IMPORT_VERSIONS.md V20). */
export const QuizStopScreen: React.FC<QuizStopScreenProps> = ({
  nextPart,
  ready,
  onStart,
  pin,
}) => {
  const { t } = useTranslation();
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const part = nextPart;
  const start = async () => {
    setStarting(true);
    setFailed(false);
    try {
      await onStart();
    } catch (err) {
      console.error('[QuizStopScreen] start part failed:', err);
      setFailed(true);
    } finally {
      setStarting(false);
    }
  };
  return (
    <div className="h-screen [height:100dvh] overflow-y-auto bg-gradient-to-b from-white to-slate-100 flex flex-col items-center justify-center p-6 text-center">
      <Octagon
        className={`w-14 h-14 mb-6 ${ready ? 'text-brand-blue-primary' : 'text-brand-red-primary'}`}
        aria-hidden
      />
      <h1 className="font-sans text-4xl font-bold text-slate-900 mb-3">
        {ready
          ? t('quizParts.open', 'Part {{part}} is open.', { part })
          : t('quizParts.stop', 'Stop.')}
      </h1>
      {ready ? (
        // no-tour-anchor: student screen, tours walk teachers
        <button
          type="button"
          onClick={() => void start()}
          disabled={starting}
          className="mt-2 mb-8 inline-flex items-center justify-center gap-2 px-8 py-4 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-50 text-white font-bold rounded-xl transition-colors"
        >
          {starting && <Loader2 className="w-5 h-5 animate-spin" aria-hidden />}
          {t('quizParts.start', 'Start Part {{part}}', { part })}
        </button>
      ) : (
        <p className="text-slate-600 text-lg font-medium mb-8 max-w-sm">
          {t(
            'quizParts.wait',
            'Wait for your teacher to start Part {{part}}.',
            {
              part,
            }
          )}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-brand-red-primary text-sm mb-4">
          {t(
            'quizParts.startFailed',
            "Couldn't start Part {{part}}. Try again.",
            {
              part,
            }
          )}
        </p>
      )}
      {pin && (
        <p className="text-slate-500 text-sm">
          Joined as PIN{' '}
          <span className="font-semibold text-slate-800 font-mono">{pin}</span>
        </p>
      )}
    </div>
  );
};
