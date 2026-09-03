import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react';
import type { HelpResourceItem } from '@/types/helpCenter';
import type { GuidedLearningSet } from '@/types';
import { helpIframeSandbox, toHelpEmbedSrc } from '@/utils/helpEmbed';
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
const GuidedLearningViewer: React.FC<{ setId: string }> = ({ setId }) => {
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
      className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-900"
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

const EmbedViewer: React.FC<{ item: HelpResourceItem }> = ({ item }) => {
  const { t } = useTranslation();
  const url = item.url ?? '';
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

  const boxClass =
    item.embedType === 'youtube'
      ? 'relative w-full aspect-video'
      : 'relative w-full min-h-[60vh]';

  return (
    <div className={`${boxClass} overflow-hidden rounded-lg bg-slate-100`}>
      <iframe
        src={src}
        title={item.title}
        sandbox={helpIframeSandbox(item.embedType)}
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

  useEffect(() => {
    void incrementHelpOpenCount(item.id);
  }, [item.id]);

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
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-brand-blue-primary hover:underline"
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

      {item.kind === 'guided-learning' ? (
        item.setId ? (
          <GuidedLearningViewer key={item.setId} setId={item.setId} />
        ) : (
          <p className="py-16 text-center text-sm text-slate-500">
            {t('helpCenter.guides.activityUnavailable')}
          </p>
        )
      ) : (
        <EmbedViewer item={item} />
      )}
    </div>
  );
};
