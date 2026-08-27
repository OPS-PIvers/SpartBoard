/**
 * Stimulus renderers for the quiz student app, teacher monitor, preview,
 * and post-submit review.
 *
 * House idiom: media elements are keyed by STIMULUS id, never by question
 * id, so a stimulus shared across consecutive questions does not remount
 * (and audio/video does not restart) as the student advances within its
 * question set (see GuidedLearningPlayer's unkeyed-media precedent).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Minus,
  Paperclip,
  Plus,
  RefreshCw,
} from 'lucide-react';
import type { QuizStimulus } from '@/types';
import {
  drivePreviewUrl,
  driveMediaUrl,
  stimulusMediaUrl,
} from '@/utils/quizStimuli';
import { convertToEmbedUrl } from '@/utils/urlHelpers';
import {
  YT_PLAYER_STATE,
  extractYouTubeId,
  loadYouTubeApi,
  type YTPlayer,
} from '@/utils/youtube';

export interface StimulusRendererProps {
  stimulus: QuizStimulus;
  /** Completed plays already recorded for this stimulus this attempt. */
  playsUsed?: number;
  /** Called once each time a play-limited stimulus finishes a complete play. */
  onPlayCompleted?: (stimulusId: string) => void;
  /** Called when the stimulus fails to load (once per failed load). */
  onLoadError?: (stimulusId: string) => void;
  /** False in teacher/review contexts — renders without play limits. */
  enforcePlayLimit?: boolean;
  /** Light (self-paced student / preview) vs dark (live student) surfaces. */
  light?: boolean;
}

const surfaceCls = (light: boolean) =>
  light
    ? 'bg-white border border-slate-200'
    : 'bg-slate-800 border border-slate-700';
const mutedTextCls = (light: boolean) =>
  light ? 'text-slate-500' : 'text-slate-300';

/** Inline warning card with a reload scoped to this stimulus only. */
const StimulusErrorCard: React.FC<{
  light: boolean;
  onRetry: () => void;
}> = ({ light, onRetry }) => (
  <div
    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm ${
      light
        ? 'bg-amber-50 border border-amber-200 text-amber-800'
        : 'bg-amber-500/15 border border-amber-500/40 text-amber-200'
    }`}
    role="alert"
  >
    <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
    <span className="flex-1">
      This attachment didn&apos;t load. You can keep answering.
    </span>
    <button
      type="button"
      onClick={onRetry}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
        light
          ? 'bg-white border border-amber-300 hover:bg-amber-100'
          : 'bg-slate-800 border border-amber-500/50 hover:bg-slate-700'
      }`}
    >
      <RefreshCw className="w-3.5 h-3.5" aria-hidden />
      Reload
    </button>
  </div>
);

const PlayLimitCard: React.FC<{ light: boolean; limit: number }> = ({
  light,
  limit,
}) => (
  <div
    className={`rounded-xl px-4 py-3 text-sm font-medium ${surfaceCls(light)} ${mutedTextCls(light)}`}
  >
    Play limit reached ({limit} {limit === 1 ? 'play' : 'plays'}).
  </div>
);

const PlaysRemainingNote: React.FC<{
  light: boolean;
  remaining: number;
}> = ({ light, remaining }) => (
  <p className={`text-xs mt-1 ${mutedTextCls(light)}`}>
    {remaining} {remaining === 1 ? 'play' : 'plays'} remaining
  </p>
);

// ─── Image ───────────────────────────────────────────────────────────────────

const ImageStimulus: React.FC<
  StimulusRendererProps & { retryNonce: number }
> = ({ stimulus, onLoadError, retryNonce }) => {
  const [failed, setFailed] = useState(false);
  // Reset failure state when a retry remounts the element.
  const [prevNonce, setPrevNonce] = useState(retryNonce);
  if (prevNonce !== retryNonce) {
    setPrevNonce(retryNonce);
    setFailed(false);
  }
  if (failed) return null;
  return (
    <img
      key={retryNonce}
      src={stimulusMediaUrl(stimulus)}
      alt="Question stimulus"
      className="max-w-full max-h-[50vh] rounded-xl object-contain"
      onError={() => {
        setFailed(true);
        onLoadError?.(stimulus.id);
      }}
    />
  );
};

// ─── Audio / Video (file URL or Drive-hosted bytes) ─────────────────────────

const AvStimulus: React.FC<StimulusRendererProps & { retryNonce: number }> = ({
  stimulus,
  playsUsed = 0,
  onPlayCompleted,
  onLoadError,
  enforcePlayLimit = true,
  light = false,
  retryNonce,
}) => {
  const [failed, setFailed] = useState(false);
  const [prevNonce, setPrevNonce] = useState(retryNonce);
  if (prevNonce !== retryNonce) {
    setPrevNonce(retryNonce);
    setFailed(false);
  }

  const limit = stimulus.playLimit;
  const remaining =
    enforcePlayLimit && limit && limit > 0 ? limit - playsUsed : null;
  if (remaining !== null && remaining <= 0) {
    return <PlayLimitCard light={light} limit={limit ?? 0} />;
  }
  if (failed) return null;

  const src = stimulusMediaUrl(stimulus);
  // `key` stays OUTSIDE this object — spreading a key into JSX is a React 19
  // warning; it's passed explicitly on each element below.
  const shared = {
    src,
    controls: true,
    // Completed plays only — pausing/scrubbing never burns a play.
    onEnded: () => onPlayCompleted?.(stimulus.id),
    onError: () => {
      setFailed(true);
      onLoadError?.(stimulus.id);
    },
    // Keep the file un-savable in the obvious ways when plays are limited.
    controlsList: remaining !== null ? 'nodownload' : undefined,
  } as const;

  return (
    <div>
      {stimulus.type === 'audio' ? (
        <audio
          key={retryNonce}
          {...shared}
          className="w-full"
          preload="metadata"
        />
      ) : (
        <video
          key={retryNonce}
          {...shared}
          className="w-full max-h-[50vh] rounded-xl bg-black"
          preload="metadata"
          playsInline
        />
      )}
      {remaining !== null && (
        <PlaysRemainingNote light={light} remaining={remaining} />
      )}
    </div>
  );
};

// ─── YouTube ─────────────────────────────────────────────────────────────────

const YouTubeStimulus: React.FC<
  StimulusRendererProps & { retryNonce: number }
> = ({
  stimulus,
  playsUsed = 0,
  onPlayCompleted,
  onLoadError,
  enforcePlayLimit = true,
  light = false,
  retryNonce,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [failed, setFailed] = useState(false);
  const [prevNonce, setPrevNonce] = useState(retryNonce);
  if (prevNonce !== retryNonce) {
    setPrevNonce(retryNonce);
    setFailed(false);
  }

  const videoId = extractYouTubeId(stimulus.url);
  const limit = stimulus.playLimit;
  const remaining =
    enforcePlayLimit && limit && limit > 0 ? limit - playsUsed : null;
  const exhausted = remaining !== null && remaining <= 0;

  useEffect(() => {
    if (!videoId || exhausted || failed) return;
    const host = containerRef.current;
    if (!host) return;
    // The YT API replaces the target node, so give it a child to consume.
    const target = document.createElement('div');
    const targetId = `yt-stimulus-${stimulus.id}-${retryNonce}`;
    target.id = targetId;
    host.appendChild(target);
    let cancelled = false;
    loadYouTubeApi(() => {
      if (cancelled || !window.YT?.Player) return;
      playerRef.current = new window.YT.Player(targetId, {
        height: '100%',
        width: '100%',
        videoId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onStateChange: (e) => {
            if (e.data === YT_PLAYER_STATE.ENDED) {
              onPlayCompleted?.(stimulus.id);
            }
          },
          onError: () => {
            onLoadError?.(stimulus.id);
            setFailed(true);
          },
        },
      });
    });
    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        // Player may already be gone; nothing to clean up.
      }
      playerRef.current = null;
      target.remove();
    };
    // The callbacks come from stable useCallbacks upstream, so including
    // them here doesn't churn the player in practice.
  }, [
    videoId,
    stimulus.id,
    retryNonce,
    exhausted,
    failed,
    onPlayCompleted,
    onLoadError,
  ]);

  if (!videoId) return null;
  if (exhausted) return <PlayLimitCard light={light} limit={limit ?? 0} />;
  if (failed) return null;
  return (
    <div>
      <div
        ref={containerRef}
        className="w-full aspect-video rounded-xl overflow-hidden bg-black"
      />
      {remaining !== null && (
        <PlaysRemainingNote light={light} remaining={remaining} />
      )}
    </div>
  );
};

// ─── Google Doc / Slides embed ───────────────────────────────────────────────

const GdocStimulus: React.FC<
  StimulusRendererProps & { retryNonce: number }
> = ({ stimulus, retryNonce }) => (
  <iframe
    key={retryNonce}
    src={convertToEmbedUrl(stimulus.url)}
    title="Question stimulus document"
    className="w-full h-full min-h-[320px] rounded-xl bg-white"
    sandbox="allow-scripts allow-same-origin allow-popups"
  />
);

// ─── PDF (pdf.js with Drive-preview fallback) ────────────────────────────────

type PdfPageRender = { pageNumber: number; canvas: HTMLCanvasElement };

const PDF_ZOOM_STEPS = [0.6, 0.8, 1, 1.25, 1.5, 2];

const PdfStimulus: React.FC<StimulusRendererProps & { retryNonce: number }> = ({
  stimulus,
  light = false,
  onLoadError,
  retryNonce,
}) => {
  const [state, setState] = useState<
    'loading' | 'ready' | 'fallback' | 'error'
  >('loading');
  const [zoomIdx, setZoomIdx] = useState(2);
  const [pageCount, setPageCount] = useState(0);
  const pagesHostRef = useRef<HTMLDivElement | null>(null);
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;
  const zoom = PDF_ZOOM_STEPS[zoomIdx];

  const [prevNonce, setPrevNonce] = useState(retryNonce);
  if (prevNonce !== retryNonce) {
    setPrevNonce(retryNonce);
    setState('loading');
  }

  useEffect(() => {
    if (state !== 'loading') return;
    let cancelled = false;
    const run = async () => {
      try {
        const src = stimulus.driveFileId
          ? driveMediaUrl(stimulus.driveFileId)
          : stimulus.url;
        if (!src) throw new Error('No PDF source available');
        const res = await fetch(src);
        if (!res.ok) throw new Error(`PDF fetch failed (${res.status})`);
        const bytes = await res.arrayBuffer();
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        setPageCount(doc.numPages);
        const renders: PdfPageRender[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = 'quiz-pdf-page';
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, canvas, viewport }).promise;
          renders.push({ pageNumber: n, canvas });
        }
        if (cancelled) return;
        const host = pagesHostRef.current;
        if (host) {
          host.replaceChildren(...renders.map((r) => r.canvas));
        }
        setState('ready');
      } catch (err) {
        if (cancelled) return;
        console.warn('[PdfStimulus] pdf.js render failed:', err);
        onLoadErrorRef.current?.(stimulus.id);
        // Drive-hosted PDFs degrade to the preview iframe so students are
        // never stranded; pasted non-Drive URLs show the error card.
        setState(stimulus.driveFileId ? 'fallback' : 'error');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [state, stimulus.id, stimulus.driveFileId, stimulus.url]);

  if (state === 'fallback' && stimulus.driveFileId) {
    return (
      <iframe
        src={drivePreviewUrl(stimulus.driveFileId)}
        title="Question stimulus PDF"
        className="w-full h-full min-h-[320px] rounded-xl bg-white"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    );
  }
  if (state === 'error') return null;

  return (
    <div
      className={`flex flex-col h-full min-h-[320px] rounded-xl overflow-hidden ${surfaceCls(light)}`}
    >
      <div
        className={`flex items-center gap-2 px-3 py-1.5 border-b text-xs font-bold ${
          light
            ? 'border-slate-200 text-slate-600'
            : 'border-slate-700 text-slate-300'
        }`}
      >
        <FileText className="w-3.5 h-3.5" aria-hidden />
        <span className="flex-1 truncate">
          PDF{pageCount > 0 ? ` · ${pageCount} pages` : ''}
        </span>
        <button
          type="button"
          aria-label="Zoom out"
          disabled={zoomIdx === 0}
          onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
          className="p-1 rounded hover:bg-slate-500/20 disabled:opacity-30"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="tabular-nums w-10 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={zoomIdx === PDF_ZOOM_STEPS.length - 1}
          onClick={() =>
            setZoomIdx((i) => Math.min(PDF_ZOOM_STEPS.length - 1, i + 1))
          }
          className="p-1 rounded hover:bg-slate-500/20 disabled:opacity-30"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="relative flex-1 overflow-auto bg-slate-500/10 p-2">
        {state === 'loading' && (
          <div
            className={`absolute inset-0 flex items-center justify-center ${mutedTextCls(light)}`}
          >
            <Loader2
              className="w-6 h-6 animate-spin"
              aria-label="Loading PDF"
            />
          </div>
        )}
        <div
          ref={pagesHostRef}
          className="quiz-pdf-pages flex flex-col items-center gap-2"
          style={{ ['--pdf-zoom' as string]: zoom }}
        />
        {/* Page canvases are appended imperatively; scale via CSS so zoom
            doesn't force a re-render of every page. */}
        <style>{`.quiz-pdf-pages .quiz-pdf-page { width: calc(100% * var(--pdf-zoom, 1)); max-width: none; height: auto; background: white; border-radius: 6px; box-shadow: 0 1px 4px rgba(0,0,0,0.15); }`}</style>
      </div>
    </div>
  );
};

// ─── Per-type dispatcher with the scoped retry wrapper ──────────────────────

export const StimulusRenderer: React.FC<StimulusRendererProps> = (props) => {
  const { stimulus, light = false } = props;
  const [retryNonce, setRetryNonce] = useState(0);
  const [failed, setFailed] = useState(false);

  const parentOnLoadError = props.onLoadError;
  const handleLoadError = useCallback(
    (id: string) => {
      // Show the retry card; log upstream.
      setFailed(true);
      parentOnLoadError?.(id);
    },
    [parentOnLoadError]
  );
  const handleRetry = useCallback(() => {
    // Clearing `failed` and bumping the nonce remounts/refetches ONLY this
    // stimulus; a renewed failure sets `failed` again via handleLoadError.
    setFailed(false);
    setRetryNonce((n) => n + 1);
  }, []);

  const inner = { ...props, onLoadError: handleLoadError, retryNonce };

  let body: React.ReactNode = null;
  switch (stimulus.type) {
    case 'image':
      body = <ImageStimulus {...inner} />;
      break;
    case 'audio':
    case 'video':
      body = <AvStimulus {...inner} />;
      break;
    case 'youtube':
      body = <YouTubeStimulus {...inner} />;
      break;
    case 'gdoc-embed':
      body = <GdocStimulus {...inner} />;
      break;
    case 'pdf':
      body = <PdfStimulus {...inner} />;
      break;
  }

  return (
    <div className="flex flex-col gap-2 h-full" data-stimulus-id={stimulus.id}>
      {failed && <StimulusErrorCard light={light} onRetry={handleRetry} />}
      {body}
    </div>
  );
};

// ─── Collapsible wrapper (monitor + review contexts) ─────────────────────────

export const CollapsibleStimuli: React.FC<{
  stimuli: QuizStimulus[];
  light?: boolean;
  /** Optional label override, e.g. "Stimuli". */
  label?: string;
}> = ({ stimuli, light = true, label }) => {
  const [open, setOpen] = useState(false);
  if (stimuli.length === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 text-xs font-bold rounded-lg px-2 py-1 transition-colors ${
          light
            ? 'text-slate-600 hover:bg-slate-100'
            : 'text-slate-300 hover:bg-slate-700/50'
        }`}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5" aria-hidden />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" aria-hidden />
        )}
        <Paperclip className="w-3.5 h-3.5" aria-hidden />
        {label ??
          `${stimuli.length} ${stimuli.length === 1 ? 'attachment' : 'attachments'}`}
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          {stimuli.map((s) => (
            <StimulusRenderer
              key={s.id}
              stimulus={s}
              light={light}
              enforcePlayLimit={false}
            />
          ))}
        </div>
      )}
    </div>
  );
};
