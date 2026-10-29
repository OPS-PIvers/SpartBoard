import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  fullscreenSupported,
  isFullscreenNow,
  subscribeFullscreen,
  useClipboardBlock,
  usePrintBlock,
} from '@/hooks/usePageProtections';
import { Maximize } from 'lucide-react';
import type { PageProtections } from '@/utils/pageProtections';

/** Covers the page until the student is in fullscreen; skipped where fullscreen isn't available. */
export const FullscreenCover: React.FC<{ required: boolean }> = ({
  required,
}) => {
  const isFullscreen = useSyncExternalStore(
    subscribeFullscreen,
    isFullscreenNow,
    () => false
  );
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const enteredRef = useRef(false);

  // Leave the fullscreen we opened once it's no longer required (submitted, ended).
  useEffect(() => {
    if (!required) return;
    return () => {
      if (!enteredRef.current) return;
      enteredRef.current = false;
      if (document.fullscreenElement)
        document.exitFullscreen().catch(() => undefined);
    };
  }, [required]);

  if (!required || isFullscreen || !fullscreenSupported()) return null;

  const enter = () => {
    setFailed(false);
    document.documentElement
      .requestFullscreen()
      .then(() => {
        enteredRef.current = true;
        setStarted(true);
      })
      .catch(() => setFailed(true));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fullscreen-cover-title"
      className="fixed inset-0 z-overlay flex flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center"
    >
      <Maximize className="h-12 w-12 text-brand-blue-primary" aria-hidden />
      <h2
        id="fullscreen-cover-title"
        className="text-2xl font-black text-slate-800"
      >
        {started ? 'Return to fullscreen' : 'This activity uses fullscreen'}
      </h2>
      <p className="max-w-sm text-sm text-slate-600">
        {started
          ? 'Your teacher asked for fullscreen during this activity.'
          : 'Select Start to open it in fullscreen.'}
      </p>
      {failed && (
        <p className="text-sm font-semibold text-brand-red-primary">
          Fullscreen didn&apos;t open. Try again.
        </p>
      )}
      {/* no-tour-anchor: student page; live tours run in the teacher app */}
      <button
        type="button"
        onClick={enter}
        className="rounded-xl bg-brand-blue-primary px-8 py-3 font-bold text-white transition-transform active:scale-95"
      >
        {started ? 'Return to fullscreen' : 'Start'}
      </button>
    </div>
  );
};

/** Print block and fullscreen cover for a quiz or video activity page; `wholePage` also blocks the clipboard everywhere. */
export const PageProtectionGuards: React.FC<{
  protections: PageProtections;
  wholePage?: boolean;
}> = ({ protections, wholePage = false }) => {
  useClipboardBlock(wholePage && protections.blockClipboard);
  usePrintBlock(protections.blockPrint);
  return <FullscreenCover required={protections.fullscreen} />;
};
