/**
 * Stimulus renderers for the quiz student app, teacher monitor, preview,
 * and post-submit review.
 *
 * House idiom: media elements are keyed by STIMULUS id, never by question
 * id, so a stimulus shared across consecutive questions does not remount
 * (and audio/video does not restart) as the student advances within its
 * question set (see GuidedLearningPlayer's unkeyed-media precedent).
 *
 * `cqScaled`: set only by callers mounted inside a widget's own container-
 * query scope (the `quiz` monitor and preview views). Left unset (default
 * false) by every other consumer — the full-page `/quiz` student route
 * (`QuizStudentApp.tsx`), the teacher grading UI (`FreeResponseGrader.tsx`),
 * and the Present paced-answering view (`PresentPacedAnswering.tsx`, which
 * mounts into a `window.open()` popup document via `PresentWindow.tsx`) —
 * none of which sits inside a `container-type: size` ancestor. `cqmin`
 * would compute to zero there, so those three keep the fixed Tailwind sizing.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
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
import { chunkReadAloudText } from '@/utils/quizReadAloudApi';
import { ReadAloudButton } from './readAloud/ReadAloudButton';
import type { ReadAloudStatus } from './readAloud/useQuizReadAloud';
import { READ_ALOUD_HIGHLIGHT_CLASS } from './readAloud/readAloudHighlight';
import {
  YT_PLAYER_STATE,
  extractYouTubeId,
  loadYouTubeApi,
  type YTPlayer,
} from '@/utils/youtube';

/** Read-aloud controls for an image/pdf stimulus with reviewed text (plan §6.2). */
export interface StimulusReadAloud {
  text: string;
  status: ReadAloudStatus;
  highlighted: boolean;
  chunkIndex: number | null;
  onPlay: () => void;
  onStop: () => void;
}

export interface StimulusRendererProps {
  stimulus: QuizStimulus;
  /** Present only when the student is flagged and the stimulus has reviewed text. */
  readAloud?: StimulusReadAloud;
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
  /** Set only inside a widget's own CSS container-query scope — see file header. */
  cqScaled?: boolean;
}

/** `min(Xpx, Ycqmin)`, only meaningful when the caller passes `cqScaled`. */
const mm = (px: number, cqmin: number) => `min(${px}px, ${cqmin}cqmin)`;

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
  cqScaled?: boolean;
}> = ({ light, onRetry, cqScaled }) => (
  <div
    className={`flex items-center rounded-xl ${cqScaled ? '' : 'gap-3 px-4 py-3 text-sm'} ${
      light
        ? 'bg-amber-50 border border-amber-200 text-amber-800'
        : 'bg-amber-500/15 border border-amber-500/40 text-amber-200'
    }`}
    style={
      cqScaled
        ? {
            gap: mm(12, 3),
            padding: `${mm(12, 3)} ${mm(16, 4)}`,
            fontSize: mm(14, 5.5),
          }
        : undefined
    }
    role="alert"
  >
    <AlertTriangle
      className={cqScaled ? 'shrink-0' : 'w-4 h-4 shrink-0'}
      style={cqScaled ? { width: mm(16, 4), height: mm(16, 4) } : undefined}
      aria-hidden
    />
    <span className="flex-1">
      This attachment didn&apos;t load. You can keep answering.
    </span>
    <button
      type="button"
      onClick={onRetry}
      className={`inline-flex items-center rounded-lg font-bold transition-colors ${
        cqScaled ? '' : 'gap-1.5 px-2.5 py-1.5 text-xs'
      } ${
        light
          ? 'bg-white border border-amber-300 hover:bg-amber-100'
          : 'bg-slate-800 border border-amber-500/50 hover:bg-slate-700'
      }`}
      style={
        cqScaled
          ? {
              gap: mm(6, 1.5),
              padding: `${mm(6, 1.5)} ${mm(10, 2.5)}`,
              fontSize: mm(11, 4),
            }
          : undefined
      }
    >
      <RefreshCw
        className={cqScaled ? undefined : 'w-3.5 h-3.5'}
        style={
          cqScaled ? { width: mm(14, 3.5), height: mm(14, 3.5) } : undefined
        }
        aria-hidden
      />
      Reload
    </button>
  </div>
);

const PlayLimitCard: React.FC<{
  light: boolean;
  limit: number;
  cqScaled?: boolean;
}> = ({ light, limit, cqScaled }) => (
  <div
    className={`rounded-xl font-medium ${cqScaled ? '' : 'px-4 py-3 text-sm'} ${surfaceCls(light)} ${mutedTextCls(light)}`}
    style={
      cqScaled
        ? { padding: `${mm(12, 3)} ${mm(16, 4)}`, fontSize: mm(14, 5.5) }
        : undefined
    }
  >
    Play limit reached ({limit} {limit === 1 ? 'play' : 'plays'}).
  </div>
);

const PlaysRemainingNote: React.FC<{
  light: boolean;
  remaining: number;
  cqScaled?: boolean;
}> = ({ light, remaining, cqScaled }) => (
  <p
    className={`${cqScaled ? '' : 'text-xs mt-1'} ${mutedTextCls(light)}`}
    style={cqScaled ? { fontSize: mm(11, 4), marginTop: mm(4, 1) } : undefined}
  >
    {remaining} {remaining === 1 ? 'play' : 'plays'} remaining
  </p>
);

// ─── Image ───────────────────────────────────────────────────────────────────

const ImageStimulus: React.FC<
  StimulusRendererProps & { retryNonce: number }
> = ({ stimulus, onLoadError, retryNonce, cqScaled }) => {
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
      className={`max-w-full rounded-xl object-contain ${cqScaled ? '' : 'max-h-[50vh]'}`}
      style={cqScaled ? { maxHeight: 'min(50vh, 60cqh)' } : undefined}
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
  cqScaled,
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
    return (
      <PlayLimitCard light={light} limit={limit ?? 0} cqScaled={cqScaled} />
    );
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
          className={`w-full rounded-xl bg-black ${cqScaled ? '' : 'max-h-[50vh]'}`}
          style={cqScaled ? { maxHeight: 'min(50vh, 60cqh)' } : undefined}
          preload="metadata"
          playsInline
        />
      )}
      {remaining !== null && (
        <PlaysRemainingNote
          light={light}
          remaining={remaining}
          cqScaled={cqScaled}
        />
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
  cqScaled,
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
  if (exhausted)
    return (
      <PlayLimitCard light={light} limit={limit ?? 0} cqScaled={cqScaled} />
    );
  if (failed) return null;
  return (
    <div>
      <div
        ref={containerRef}
        className="w-full aspect-video rounded-xl overflow-hidden bg-black"
      />
      {remaining !== null && (
        <PlaysRemainingNote
          light={light}
          remaining={remaining}
          cqScaled={cqScaled}
        />
      )}
    </div>
  );
};

// ─── Google Doc / Slides embed ───────────────────────────────────────────────

const GdocStimulus: React.FC<
  StimulusRendererProps & { retryNonce: number }
> = ({ stimulus, retryNonce, cqScaled }) => (
  <iframe
    key={retryNonce}
    src={convertToEmbedUrl(stimulus.url)}
    title="Question stimulus document"
    className={`w-full h-full rounded-xl bg-white ${cqScaled ? '' : 'min-h-[320px]'}`}
    style={cqScaled ? { minHeight: mm(320, 60) } : undefined}
    sandbox="allow-scripts allow-same-origin allow-popups"
  />
);

// ─── Text passage ────────────────────────────────────────────────────────────

/**
 * A passage the student reads (D16). No file, no network: the text travels
 * on the stimulus itself, so there is nothing here that can fail to load.
 * Whitespace is preserved because a passage's line breaks are the author's.
 */
const TextStimulus: React.FC<StimulusRendererProps> = ({
  stimulus,
  light = false,
  cqScaled,
}) => (
  <div
    className={`w-full h-full overflow-auto rounded-xl leading-relaxed whitespace-pre-wrap ${
      cqScaled ? '' : 'min-h-[120px] p-4 text-base'
    } ${light ? 'bg-white text-slate-800' : 'bg-slate-800/60 text-slate-100'}`}
    style={
      cqScaled
        ? { minHeight: mm(120, 30), padding: mm(16, 4), fontSize: mm(16, 6) }
        : undefined
    }
  >
    {stimulus.text ?? ''}
  </div>
);

// ─── PDF (pdf.js with Drive-preview fallback) ────────────────────────────────

type PdfPageRender = { pageNumber: number; canvas: HTMLCanvasElement };

const PDF_ZOOM_STEPS = [0.6, 0.8, 1, 1.25, 1.5, 2];

const PdfStimulus: React.FC<StimulusRendererProps & { retryNonce: number }> = ({
  stimulus,
  light = false,
  onLoadError,
  cqScaled,
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
        className={`w-full h-full rounded-xl bg-white ${cqScaled ? '' : 'min-h-[320px]'}`}
        style={cqScaled ? { minHeight: mm(320, 60) } : undefined}
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    );
  }
  if (state === 'error') return null;

  return (
    <div
      className={`flex flex-col h-full rounded-xl overflow-hidden ${cqScaled ? '' : 'min-h-[320px]'} ${surfaceCls(light)}`}
      style={cqScaled ? { minHeight: mm(320, 60) } : undefined}
    >
      <div
        className={`flex items-center border-b font-bold ${
          cqScaled ? '' : 'gap-2 px-3 py-1.5 text-xs'
        } ${light ? 'border-slate-200 text-slate-600' : 'border-slate-700 text-slate-300'}`}
        style={
          cqScaled
            ? {
                gap: mm(8, 2),
                padding: `${mm(6, 1.5)} ${mm(12, 3)}`,
                fontSize: mm(11, 4),
              }
            : undefined
        }
      >
        <FileText
          className={cqScaled ? undefined : 'w-3.5 h-3.5'}
          style={
            cqScaled ? { width: mm(14, 3.5), height: mm(14, 3.5) } : undefined
          }
          aria-hidden
        />
        <span className="flex-1 truncate">
          PDF{pageCount > 0 ? ` · ${pageCount} pages` : ''}
        </span>
        <button
          type="button"
          aria-label="Zoom out"
          disabled={zoomIdx === 0}
          onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
          className={`rounded hover:bg-slate-500/20 disabled:opacity-30 ${cqScaled ? '' : 'p-1'}`}
          style={cqScaled ? { padding: mm(4, 1) } : undefined}
        >
          <Minus
            className={cqScaled ? undefined : 'w-3.5 h-3.5'}
            style={
              cqScaled ? { width: mm(14, 3.5), height: mm(14, 3.5) } : undefined
            }
          />
        </button>
        <span
          className={`tabular-nums text-center ${cqScaled ? '' : 'w-10'}`}
          style={cqScaled ? { width: mm(40, 10) } : undefined}
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={zoomIdx === PDF_ZOOM_STEPS.length - 1}
          onClick={() =>
            setZoomIdx((i) => Math.min(PDF_ZOOM_STEPS.length - 1, i + 1))
          }
          className={`rounded hover:bg-slate-500/20 disabled:opacity-30 ${cqScaled ? '' : 'p-1'}`}
          style={cqScaled ? { padding: mm(4, 1) } : undefined}
        >
          <Plus
            className={cqScaled ? undefined : 'w-3.5 h-3.5'}
            style={
              cqScaled ? { width: mm(14, 3.5), height: mm(14, 3.5) } : undefined
            }
          />
        </button>
      </div>
      <div
        className={`relative flex-1 overflow-auto bg-slate-500/10 ${cqScaled ? '' : 'p-2'}`}
        style={cqScaled ? { padding: mm(8, 2) } : undefined}
      >
        {state === 'loading' && (
          <div
            className={`absolute inset-0 flex items-center justify-center ${mutedTextCls(light)}`}
          >
            <Loader2
              className={cqScaled ? 'animate-spin' : 'w-6 h-6 animate-spin'}
              style={
                cqScaled ? { width: mm(24, 6), height: mm(24, 6) } : undefined
              }
              aria-label="Loading PDF"
            />
          </div>
        )}
        <div
          ref={pagesHostRef}
          className={`quiz-pdf-pages flex flex-col items-center ${cqScaled ? '' : 'gap-2'}`}
          style={{
            ['--pdf-zoom' as string]: zoom,
            ...(cqScaled ? { gap: mm(8, 2) } : undefined),
          }}
        />
        {/* Page canvases are appended imperatively; scale via CSS so zoom
            doesn't force a re-render of every page. */}
        <style>{`.quiz-pdf-pages .quiz-pdf-page { width: calc(100% * var(--pdf-zoom, 1)); max-width: none; height: auto; background: white; border-radius: 6px; box-shadow: 0 1px 4px rgba(0,0,0,0.15); }`}</style>
      </div>
    </div>
  );
};

// ─── Per-type dispatcher with the scoped retry wrapper ──────────────────────

const StimulusReadAloudHeader: React.FC<{
  readAloud: StimulusReadAloud;
  light: boolean;
  cqScaled?: boolean;
}> = ({ readAloud, light, cqScaled }) => {
  const { t } = useTranslation();
  return (
    <div
      className={`flex items-center rounded-2xl transition-colors ${
        cqScaled ? '' : 'gap-2 pr-3'
      } ${readAloud.highlighted ? READ_ALOUD_HIGHLIGHT_CLASS : ''}`}
      style={cqScaled ? { gap: mm(8, 2), paddingRight: mm(12, 3) } : undefined}
    >
      <ReadAloudButton
        label={t('quizReadAloud.readPassage', 'Read passage aloud')}
        status={readAloud.status}
        onClick={readAloud.onPlay}
        onStop={readAloud.onStop}
        variant="ghost"
      />
      <span
        className={`font-bold ${cqScaled ? '' : 'text-xs'} ${light ? 'text-slate-600' : 'text-slate-300'}`}
        style={cqScaled ? { fontSize: mm(11, 4) } : undefined}
      >
        {t('quizReadAloud.passage', 'Passage')}
      </span>
    </div>
  );
};

const StimulusReadAloudPane: React.FC<{
  readAloud: StimulusReadAloud;
  light: boolean;
  cqScaled?: boolean;
}> = ({ readAloud, light, cqScaled }) => {
  const chunks = useMemo(
    () => chunkReadAloudText(readAloud.text),
    [readAloud.text]
  );
  return (
    <div
      data-testid="stimulus-read-aloud-pane"
      className={`rounded-xl border leading-relaxed ${cqScaled ? '' : 'p-3 text-sm'} ${
        light
          ? 'border-slate-200 bg-white text-slate-800'
          : 'border-slate-700 bg-slate-800/60 text-slate-100'
      }`}
      style={
        cqScaled ? { padding: mm(12, 3), fontSize: mm(14, 5.5) } : undefined
      }
    >
      {chunks.map((chunk, i) => (
        <p
          key={i}
          className={`whitespace-pre-line rounded-lg transition-colors ${
            cqScaled ? '' : 'px-2 py-1'
          } ${i === readAloud.chunkIndex ? READ_ALOUD_HIGHLIGHT_CLASS : ''}`}
          style={cqScaled ? { padding: `${mm(4, 1)} ${mm(8, 2)}` } : undefined}
        >
          {chunk}
        </p>
      ))}
    </div>
  );
};

export const StimulusRenderer: React.FC<StimulusRendererProps> = (props) => {
  const { stimulus, light = false, readAloud, cqScaled } = props;
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
    case 'text':
      body = <TextStimulus {...inner} />;
      break;
  }

  return (
    <div
      className={`flex flex-col h-full ${cqScaled ? '' : 'gap-2'}`}
      style={cqScaled ? { gap: mm(8, 2) } : undefined}
      data-stimulus-id={stimulus.id}
    >
      {readAloud && (
        <StimulusReadAloudHeader
          readAloud={readAloud}
          light={light}
          cqScaled={cqScaled}
        />
      )}
      {failed && (
        <StimulusErrorCard
          light={light}
          onRetry={handleRetry}
          cqScaled={cqScaled}
        />
      )}
      {body}
      {readAloud && readAloud.status !== 'idle' && (
        <StimulusReadAloudPane
          readAloud={readAloud}
          light={light}
          cqScaled={cqScaled}
        />
      )}
    </div>
  );
};

// ─── Collapsible wrapper (monitor + review contexts) ─────────────────────────

export const CollapsibleStimuli: React.FC<{
  stimuli: QuizStimulus[];
  light?: boolean;
  /** Optional label override, e.g. "Stimuli". */
  label?: string;
  /** Set only inside a widget's own CSS container-query scope — see file header. */
  cqScaled?: boolean;
}> = ({ stimuli, light = true, label, cqScaled }) => {
  const [open, setOpen] = useState(false);
  if (stimuli.length === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center font-bold rounded-lg transition-colors ${
          cqScaled ? '' : 'gap-1.5 text-xs px-2 py-1'
        } ${
          light
            ? 'text-slate-600 hover:bg-slate-100'
            : 'text-slate-300 hover:bg-slate-700/50'
        }`}
        style={
          cqScaled
            ? {
                gap: mm(6, 1.5),
                fontSize: mm(11, 4),
                padding: `${mm(4, 1)} ${mm(8, 2)}`,
              }
            : undefined
        }
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown
            className={cqScaled ? undefined : 'w-3.5 h-3.5'}
            style={
              cqScaled ? { width: mm(14, 3.5), height: mm(14, 3.5) } : undefined
            }
            aria-hidden
          />
        ) : (
          <ChevronRight
            className={cqScaled ? undefined : 'w-3.5 h-3.5'}
            style={
              cqScaled ? { width: mm(14, 3.5), height: mm(14, 3.5) } : undefined
            }
            aria-hidden
          />
        )}
        <Paperclip
          className={cqScaled ? undefined : 'w-3.5 h-3.5'}
          style={
            cqScaled ? { width: mm(14, 3.5), height: mm(14, 3.5) } : undefined
          }
          aria-hidden
        />
        {label ??
          `${stimuli.length} ${stimuli.length === 1 ? 'attachment' : 'attachments'}`}
      </button>
      {open && (
        <div
          className={`flex flex-col ${cqScaled ? '' : 'mt-2 space-y-3'}`}
          style={cqScaled ? { marginTop: mm(8, 2), gap: mm(12, 3) } : undefined}
        >
          {stimuli.map((s) => (
            <StimulusRenderer
              key={s.id}
              stimulus={s}
              light={light}
              enforcePlayLimit={false}
              cqScaled={cqScaled}
            />
          ))}
        </div>
      )}
    </div>
  );
};
