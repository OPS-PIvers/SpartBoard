import React, { useState, useEffect } from 'react';
import { WidgetData, EmbedConfig, MiniAppConfig } from '@/types';
import {
  Globe,
  ExternalLink,
  Code,
  XCircle,
  Wand2,
  Loader2,
} from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { convertToEmbedUrl, ensureProtocol } from '@/utils/urlHelpers';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { useDashboard } from '@/context/useDashboard';
import { generateMiniAppCode } from '@/utils/ai';
import { useEmbedConfig } from './hooks/useEmbedConfig';

const NEW_WIDGET_SPACING = 20;

export const EmbedWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { addWidget, addToast } = useDashboard();
  const { config: globalConfig } = useEmbedConfig();
  const [isGeneratingApp, setIsGeneratingApp] = useState(false);
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
        ...(globalConfig?.whitelistUrls ?? []).map((d) => d.toLowerCase()),
      ]);
      return allowListedDomains.has(hostname);
    } catch (_e) {
      return isEmbeddable;
    }
  }, [isEmbeddable, embedUrl, globalConfig?.whitelistUrls]);

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
          ...(globalConfig?.whitelistUrls ?? []).map((d) => d.toLowerCase()),
        ]);
        if (allowSameOriginHosts.has(hostname)) {
          base += ' allow-same-origin';
        }
      } catch (_e) {
        // Fallback for malformed URLs
      }
    }
    return base;
  }, [mode, embedUrl, globalConfig?.whitelistUrls]);

  const handleGenerateMiniApp = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGeneratingApp || !url) return;

    setIsGeneratingApp(true);
    try {
      addToast('Analyzing content and generating Mini App...', 'info');

      const prompt = `Create an interactive educational mini app based on this content/resource: ${sanitizedUrl}`;
      const result = await generateMiniAppCode(prompt);

      // Create new Mini App widget next to this embed
      addWidget('miniApp', {
        x: widget.x + widget.w + NEW_WIDGET_SPACING,
        y: widget.y,
        config: {
          activeApp: {
            id: crypto.randomUUID(),
            title: result.title,
            html: result.html,
            createdAt: Date.now(),
          },
          activeAppUnsaved: true,
        } as Partial<MiniAppConfig>,
      });

      addToast('Mini App generated successfully!', 'success');
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'Failed to generate app',
        'error'
      );
    } finally {
      setIsGeneratingApp(false);
    }
  };

  const hideUrlField = globalConfig?.hideUrlField ?? false;
  const displayMode = hideUrlField ? 'code' : mode;

  if (displayMode === 'url' && !url) {
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

  if (displayMode === 'code' && !html) {
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
          {displayMode === 'url' && url && (
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover/embed-content:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                onClick={handleGenerateMiniApp}
                disabled={isGeneratingApp}
                className="bg-white/80 backdrop-blur-sm hover:bg-indigo-50 text-indigo-500 shadow-sm border border-indigo-200/50 rounded-lg p-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                title="Generate Interactive Mini App"
                aria-label="Generate Interactive Mini App"
              >
                {isGeneratingApp ? (
                  <Loader2
                    className="animate-spin"
                    style={{
                      width: 'min(12px, 2.5cqmin)',
                      height: 'min(12px, 2.5cqmin)',
                    }}
                  />
                ) : (
                  <Wand2
                    style={{
                      width: 'min(12px, 2.5cqmin)',
                      height: 'min(12px, 2.5cqmin)',
                    }}
                  />
                )}
              </button>
              <a
                href={sanitizedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white/80 backdrop-blur-sm hover:bg-white text-slate-500 hover:text-blue-500 shadow-sm border border-slate-200/50 rounded-lg p-1.5 transition-colors flex items-center justify-center"
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
            </div>
          )}
          {displayMode === 'url' && isActuallyEmbeddable === false ? (
            <div className="flex-1 flex flex-col items-center justify-center p-[6cqmin] text-center bg-slate-50">
              <div
                className="bg-amber-100 rounded-full flex items-center justify-center"
                style={{
                  padding: 'min(16px, 4cqmin)',
                  marginBottom: 'min(16px, 4cqmin)',
                }}
              >
                <XCircle
                  className="text-amber-600"
                  style={{
                    width: 'min(48px, 12cqmin)',
                    height: 'min(48px, 12cqmin)',
                  }}
                />
              </div>
              <h3
                className="font-bold text-slate-900"
                style={{
                  fontSize: 'min(14px, 3.5cqmin)',
                  marginBottom: 'min(8px, 2cqmin)',
                }}
              >
                Embedding Blocked
              </h3>
              <p
                className="text-slate-500 opacity-80 leading-relaxed"
                style={{
                  fontSize: 'min(12px, 3cqmin)',
                  marginBottom: 'min(24px, 6cqmin)',
                  maxWidth: 'min(200px, 50cqmin)',
                }}
              >
                {blockedReason ||
                  "This website's security policy prevents it from being displayed here."}
              </p>
              <a
                href={sanitizedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center bg-blue-600 text-white rounded-[2cqmin] font-bold hover:bg-blue-700 transition-all shadow-sm active:scale-95"
                style={{
                  gap: 'min(8px, 2cqmin)',
                  padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
                  fontSize: 'min(12px, 3cqmin)',
                }}
              >
                OPEN IN NEW TAB{' '}
                <ExternalLink
                  style={{
                    width: 'min(12px, 3cqmin)',
                    height: 'min(12px, 3cqmin)',
                  }}
                />
              </a>
            </div>
          ) : (
            <iframe
              key={refreshKey}
              title="Embed Content"
              src={displayMode === 'url' ? embedUrl : undefined}
              srcDoc={displayMode === 'code' ? html : undefined}
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
