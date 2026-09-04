import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { HelpResourceItem } from '@/types/helpCenter';
import type { GuidedLearningSet } from '@/types';
import {
  helpIframeSandbox,
  inferHelpEmbedType,
  toHelpEmbedSrc,
} from '@/utils/helpEmbed';
import { incrementHelpOpenCount } from '@/hooks/useHelpResources';
import { loadBuildingSet } from '@/hooks/useGuidedLearning';
import { logError } from '@/utils/logError';

// Lazy so the Help modal never pulls the Guided Learning player for teachers who only read embeds.
const GuidedLearningPlayer = lazy(() =>
  import('@/components/widgets/GuidedLearning/components/GuidedLearningPlayer').then(
    (m) => ({ default: m.GuidedLearningPlayer })
  )
);

interface HelpResourceViewerProps {
  item: HelpResourceItem;
  onBack: () => void;
}

type GlState =
  | { status: 'loading' }
  | { status: 'ready'; set: GuidedLearningSet }
  | { status: 'missing' };

// Keyed on setId by the caller, so a different set remounts instead of resetting state in an effect.
const GuidedLearningViewer: React.FC<{ setId: string; fill: boolean }> = ({
  setId,
  fill,
}) => {
  const { t } = useTranslation();
  const [state, setState] = useState<GlState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadBuildingSet(setId)
      .then((set) => {
        if (cancelled) return;
        setState(set ? { status: 'ready', set } : { status: 'missing' });
      })
      .catch((err) => {
        logError('HelpResourceViewer loadBuildingSet', err);
        if (!cancelled) setState({ status: 'missing' });
      });
    return () => {
      cancelled = true;
    };
  }, [setId]);

  if (state.status === 'loading') {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (state.status === 'missing') {
    return (
      <p className="py-16 text-center text-sm text-slate-500">
        {t('helpCenter.guides.activityUnavailable')}
      </p>
    );
  }

  return (
    <div
      className={`relative w-full overflow-hidden bg-slate-900 ${
        fill ? 'h-full' : 'aspect-video rounded-lg'
      }`}
      style={{ containerType: 'size' }}
    >
      <Suspense
        fallback={
          <div className="absolute inset-0 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        }
      >
        <GuidedLearningPlayer set={state.set} teacherMode />
      </Suspense>
    </div>
  );
};

const EmbedViewer: React.FC<{ item: HelpResourceItem; fill: boolean }> = ({
  item,
  fill,
}) => {
  const { t } = useTranslation();
  const url = item.url ?? '';
  // The sandbox comes from the URL below; the stored embedType is only a display hint.
  const src = toHelpEmbedSrc(url);
  // Anything the converter left alone is a raw admin-entered URL: link out instead of framing it.
  const unconverted = src === url;

  if (!url || unconverted) {
    return (
      <a
        href={url || undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-sm font-semibold text-brand-blue-primary hover:bg-slate-100 transition-colors"
      >
        <ExternalLink className="w-4 h-4" />
        {t('helpCenter.guides.openExternal')}
      </a>
    );
  }

  const boxClass = fill
    ? 'relative w-full h-full'
    : item.embedType === 'youtube'
      ? 'relative w-full aspect-video rounded-lg'
      : 'relative w-full min-h-[60vh] rounded-lg';

  return (
    <div className={`${boxClass} overflow-hidden bg-slate-100`}>
      <iframe
        src={src}
        title={item.title}
        sandbox={helpIframeSandbox(inferHelpEmbedType(url))}
        referrerPolicy="strict-origin-when-cross-origin"
        allow="autoplay; fullscreen"
        className="absolute inset-0 w-full h-full border-0"
      />
    </div>
  );
};

export const HelpResourceViewer: React.FC<HelpResourceViewerProps> = ({
  item,
  onBack,
}) => {
  const { t } = useTranslation();
  const backRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canFullscreen =
    typeof document !== 'undefined' && !!document.fullscreenEnabled;

  useEffect(() => {
    void incrementHelpOpenCount(item.id);
  }, [item.id]);

  // Esc and browser chrome can exit fullscreen without us, so mirror the DOM state.
  useEffect(() => {
    const sync = () =>
      setIsFullscreen(
        !!contentRef.current &&
          document.fullscreenElement === contentRef.current
      );
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {
        /* ignore */
      });
      return;
    }
    contentRef.current?.requestFullscreen().catch((err: unknown) => {
      logError('HelpResourceViewer requestFullscreen', err);
    });
  };

  useEffect(() => {
    backRef.current?.focus();
  }, [item.id]);

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          ref={backRef}
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('helpCenter.guides.back')}
        </button>
        {canFullscreen && (
          <button
            type="button"
            onClick={toggleFullscreen}
            className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
            {t('helpCenter.guides.fullscreen')}
          </button>
        )}
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1.5 text-sm font-semibold text-brand-blue-primary hover:underline ${
              canFullscreen ? '' : 'ml-auto'
            }`}
          >
            {t('helpCenter.guides.open')}
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>

      <div className="min-w-0">
        <h3 className="text-base font-black text-slate-900">{item.title}</h3>
        {item.description && (
          <p className="mt-1 text-sm text-slate-500">{item.description}</p>
        )}
      </div>

      <div
        ref={contentRef}
        className={
          isFullscreen ? 'relative h-full w-full bg-slate-900' : 'min-w-0'
        }
      >
        {item.kind === 'guided-learning' ? (
          item.setId ? (
            <GuidedLearningViewer
              key={item.setId}
              setId={item.setId}
              fill={isFullscreen}
            />
          ) : (
            <p className="py-16 text-center text-sm text-slate-500">
              {t('helpCenter.guides.activityUnavailable')}
            </p>
          )
        ) : (
          <EmbedViewer item={item} fill={isFullscreen} />
        )}
        {isFullscreen && (
          <button
            type="button"
            onClick={toggleFullscreen}
            className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-slate-900/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm hover:bg-slate-900/90 transition-colors"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            {t('helpCenter.guides.exitFullscreen')}
          </button>
        )}
      </div>
    </div>
  );
};
