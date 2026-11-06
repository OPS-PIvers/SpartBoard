import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
  enterFullscreen,
  fullscreenSupported,
  isFullscreenNow,
  subscribeFullscreen,
  useClipboardBlock,
  usePrintBlock,
} from '@/hooks/usePageProtections';
import { ExternalLink, Maximize } from 'lucide-react';
import type { PageProtections } from '@/utils/pageProtections';
import {
  isFramedWindow,
  isHandedOff,
  markHandedOff,
  popOutUrl,
  subscribeHandOff,
} from '@/utils/attemptHandOff';

const COVER_CLASS =
  'fixed inset-0 flex flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center';

/** Shown once this page's attempt moved to another tab, so the old copy can't be worked in. */
export const HandedOffCover: React.FC = () => {
  const handedOff = useSyncExternalStore(
    subscribeHandOff,
    isHandedOff,
    () => false
  );
  if (!handedOff) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="handed-off-cover-title"
      className={`${COVER_CLASS} z-modal`}
    >
      <ExternalLink className="h-12 w-12 text-brand-blue-primary" aria-hidden />
      <h2
        id="handed-off-cover-title"
        className="text-2xl font-black text-slate-800"
      >
        This activity is open in another tab
      </h2>
      <p className="max-w-sm text-sm text-slate-600">
        Finish your work in that tab.
      </p>
    </div>
  );
};

/** Fullscreen can't open inside a frame without permission, so a framed page sends the student to a new tab. */
const PopOutCover: React.FC = () => (
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="pop-out-cover-title"
    className={`${COVER_CLASS} z-overlay`}
  >
    <Maximize className="h-12 w-12 text-brand-blue-primary" aria-hidden />
    <h2 id="pop-out-cover-title" className="text-2xl font-black text-slate-800">
      Open this activity in a new tab
    </h2>
    <p className="max-w-sm text-sm text-slate-600">
      Your teacher asked for fullscreen. Fullscreen does not work on this page.
    </p>
    {/* no-tour-anchor: student page; live tours run in the teacher app */}
    <a
      href={popOutUrl()}
      target="_blank"
      rel="noopener noreferrer"
      // Before the new tab takes focus, so leaving for it isn't a tab warning.
      onClick={markHandedOff}
      className="inline-flex items-center gap-2 rounded-xl bg-brand-blue-primary px-8 py-3 font-bold text-white transition-transform active:scale-95"
    >
      <ExternalLink className="h-5 w-5" aria-hidden />
      Open in a new tab
    </a>
  </div>
);

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
  // The tab warning's button can also open fullscreen, so watch for it instead of the Start click.
  if (required && isFullscreen && !started) setStarted(true);

  // Leave the page fullscreen once it's no longer required (submitted, ended).
  useEffect(() => {
    if (!required) return;
    return () => {
      if (document.fullscreenElement === document.documentElement)
        document.exitFullscreen().catch(() => undefined);
    };
  }, [required]);

  if (!required || isFullscreen) return null;
  if (!fullscreenSupported()) return isFramedWindow() ? <PopOutCover /> : null;

  const enter = () => {
    setFailed(false);
    void enterFullscreen().then((ok) => setFailed(!ok));
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
  return (
    <>
      <FullscreenCover required={protections.fullscreen} />
      <HandedOffCover />
    </>
  );
};
