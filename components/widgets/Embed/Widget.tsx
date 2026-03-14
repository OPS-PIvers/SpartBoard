import React, { useState, useEffect } from 'react';
import { WidgetData, EmbedConfig } from '../../../types';
import { Globe, ExternalLink, Code, XCircle } from 'lucide-react';
import { ScaledEmptyState } from '../../common/ScaledEmptyState';
import { convertToEmbedUrl, ensureProtocol } from '../../../utils/urlHelpers';
import { WidgetLayout } from '../WidgetLayout';

export const EmbedWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const config = widget.config as EmbedConfig;
  const {
    mode = 'url',
    url = '',
    html = '',
    refreshInterval = 0,
    isEmbeddable = true,
    blockedReason = '',
  } = config;
  const sanitizedUrl = ensureProtocol(url);
  const embedUrl = convertToEmbedUrl(sanitizedUrl);
  const [refreshKey, setRefreshKey] = useState(0);

  const isActuallyEmbeddable = React.useMemo(() => {
    if (isEmbeddable) return true;
    try {
      const parsedUrl = new URL(embedUrl);
      const hostname = parsedUrl.hostname.toLowerCase();
      const allowListedDomains = new Set([
        'www.carriderpro.com',
        'carriderpro.com',
      ]);
      return allowListedDomains.has(hostname);
    } catch (_e) {
      return isEmbeddable;
    }
  }, [isEmbeddable, embedUrl]);

  useEffect(() => {
    if (refreshInterval <= 0) return;

    const interval = setInterval(
      () => {
        setRefreshKey((prev) => prev + 1);
      },
      refreshInterval * 60 * 1000
    );

    return () => clearInterval(interval);
  }, [refreshInterval]);

  const sandbox = React.useMemo(() => {
    let base = 'allow-scripts allow-forms allow-popups';
    if (mode === 'url') {
      base += ' allow-modals';
      try {
        const parsedUrl = new URL(embedUrl);
        const hostname = parsedUrl.hostname.toLowerCase();
        const allowSameOriginHosts = new Set([
          'docs.google.com',
          'drive.google.com',
          'vids.google.com',
          'www.youtube.com',
          'youtube.com',
          'www.carriderpro.com',
          'carriderpro.com',
        ]);
        if (allowSameOriginHosts.has(hostname)) {
          base += ' allow-same-origin';
        }
      } catch (_e) {
        // Fallback for malformed URLs
      }
    }
    return base;
  }, [mode, embedUrl]);

  if (mode === 'url' && !url) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={Globe}
            title="No URL Provided"
            subtitle="Flip this widget to add a link to a website, video, or document."
          />
        }
      />
    );
  }

  if (mode === 'code' && !html) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={Code}
            title="No Code Provided"
            subtitle="Flip this widget and paste your HTML/CSS/JS code to run it here."
          />
        }
      />
    );
  }

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div className="w-full h-full bg-transparent flex flex-col overflow-hidden relative group/embed-content">
          {mode === 'url' && url && (
            <a
              href={sanitizedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-2 right-2 z-10 bg-white/80 backdrop-blur-sm hover:bg-white text-slate-500 hover:text-blue-500 shadow-sm border border-slate-200/50 rounded-lg p-1.5 transition-colors"
              title="Open in new tab"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink
                style={{
                  width: 'min(12px, 2.5cqmin)',
                  height: 'min(12px, 2.5cqmin)',
                }}
              />
            </a>
          )}
          {mode === 'url' && isActuallyEmbeddable === false ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-slate-50">
              <div className="bg-amber-100 p-4 rounded-full mb-4">
                <XCircle className="w-12 h-12 text-amber-600" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-2">
                Embedding Blocked
              </h3>
              <p className="text-xxs text-slate-500 mb-6 max-w-[200px] leading-relaxed">
                {blockedReason ||
                  "This website's security policy prevents it from being displayed here."}
              </p>
              <a
                href={sanitizedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xxs font-bold hover:bg-blue-700 transition-all shadow-sm active:scale-95"
              >
                OPEN IN NEW TAB <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ) : (
            <iframe
              key={refreshKey}
              title="Embed Content"
              src={mode === 'url' ? embedUrl : undefined}
              srcDoc={mode === 'code' ? html : undefined}
              className="flex-1 w-full h-full border-none"
              sandbox={sandbox}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          )}
        </div>
      }
    />
  );
};
