import React, { useState, useEffect } from 'react';
import { WidgetData, EmbedConfig, MiniAppConfig } from '@/types';
import {
  Globe,
  ExternalLink,
  Code,
  XCircle,
  Wand2,
  Loader2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import {
  convertToEmbedUrl,
  ensureProtocol,
  extractGoogleFileId,
} from '@/utils/urlHelpers';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { useDashboard } from '@/context/useDashboard';
import { generateMiniAppCode } from '@/utils/ai';
import { useEmbedConfig } from './hooks/useEmbedConfig';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useAuth } from '@/context/useAuth';

const NEW_WIDGET_SPACING = 20;

export const EmbedWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { addWidget, addToast, updateWidget } = useDashboard();
  const { canAccessFeature } = useAuth();
  const { config: globalConfig } = useEmbedConfig();
  const { getDriveFileTextContent } = useGoogleDrive();
  const [isGeneratingApp, setIsGeneratingApp] = useState(false);
  const config = widget.config as EmbedConfig;
  const {
    mode = 'url',
    url = '',
    html = '',
    refreshInterval = 0,
    isEmbeddable = true,
    blockedReason = '',
    zoom = 1,
  } = config;

  const ZOOM_STEPS = [
    0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1.0, 1.25, 1.5, 1.75,
    2.0, 2.25, 2.5,
  ];
  const DEFAULT_ZOOM = 1.0;
  const effectiveZoom = ZOOM_STEPS.reduce((closest, step) => {
    return Math.abs(step - zoom) < Math.abs(closest - zoom) ? step : closest;
  }, DEFAULT_ZOOM);
  const currentZoomIndex = ZOOM_STEPS.indexOf(effectiveZoom);
  const canZoomOut = currentZoomIndex > 0;
  const canZoomIn = currentZoomIndex < ZOOM_STEPS.length - 1;
  const isDefaultZoom = effectiveZoom === DEFAULT_ZOOM;

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canZoomOut) return;
    updateWidget(widget.id, {
      config: { ...config, zoom: ZOOM_STEPS[currentZoomIndex - 1] },
    });
  };

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canZoomIn) return;
    updateWidget(widget.id, {
      config: { ...config, zoom: ZOOM_STEPS[currentZoomIndex + 1] },
    });
  };

  const handleZoomReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateWidget(widget.id, { config: { ...config, zoom: 1.0 } });
  };
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
    if (!canAccessFeature('embed-mini-app')) return;
    if (isGeneratingApp) return;
    if (displayMode === 'url' && !url.trim()) return;
    if (displayMode === 'code' && !html.trim()) return;

    setIsGeneratingApp(true);
    try {
      const resourceContent = displayMode === 'url' ? sanitizedUrl : html;
      let prompt = `Create an interactive educational mini app based on this content/resource: ${resourceContent}`;

      // Try to extract text from Google Drive if it's a Drive URL
      if (displayMode === 'url') {
        const fileId = extractGoogleFileId(sanitizedUrl);
        if (fileId) {
          addToast('Reading Google Drive file content...', 'info');
          const fileText = await getDriveFileTextContent(fileId);
          if (fileText) {
            // Trim to avoid hitting Gemini context limits (though Flash is generous, this keeps it focused)
            const trimmedText = fileText.substring(0, 30000);
            prompt = `Create an interactive educational mini app based on the following content extracted from a user's resource:\n\n${trimmedText}`;
          } else {
            addToast(
              'Could not access Google Drive content. Please ensure the file is shared or you have permission to read it.',
              'error'
            );
            setIsGeneratingApp(false);
            return;
          }
        }
      }

      addToast('Analyzing content and generating Mini App...', 'info');

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
          {((displayMode === 'url' && url.trim()) ||
            (displayMode === 'code' && html.trim())) && (
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1 opacity-0 group-hover/embed-content:opacity-100 focus-within:opacity-100 transition-opacity">
              <div className="flex items-center bg-white/80 backdrop-blur-sm shadow-sm border border-slate-200/50 rounded-lg overflow-hidden">
                <button
                  onClick={handleZoomOut}
                  disabled={!canZoomOut}
                  className="text-slate-500 hover:text-blue-500 hover:bg-slate-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ padding: 'min(8px, 2cqmin)' }}
                  title="Zoom out"
                >
                  <ZoomOut
                    style={{
                      width: 'clamp(14px, 4cqmin, 18px)',
                      height: 'clamp(14px, 4cqmin, 18px)',
                    }}
                  />
                </button>
                <span title={isDefaultZoom ? 'Current zoom' : undefined}>
                  <button
                    onClick={handleZoomReset}
                    disabled={isDefaultZoom}
                    className="text-slate-600 font-mono font-bold select-none hover:text-blue-500 hover:bg-slate-50 transition-colors disabled:cursor-default disabled:hover:text-slate-600 disabled:hover:bg-transparent"
                    style={{
                      fontSize: 'clamp(10px, 3cqmin, 13px)',
                      minWidth: '3em',
                      padding: '0 min(4px, 1cqmin)',
                    }}
                    title={isDefaultZoom ? undefined : 'Reset to 100%'}
                  >
                    {Math.round(effectiveZoom * 100)}%
                  </button>
                </span>
                <button
                  onClick={handleZoomIn}
                  disabled={!canZoomIn}
                  className="text-slate-500 hover:text-blue-500 hover:bg-slate-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ padding: 'min(8px, 2cqmin)' }}
                  title="Zoom in"
                >
                  <ZoomIn
                    style={{
                      width: 'clamp(14px, 4cqmin, 18px)',
                      height: 'clamp(14px, 4cqmin, 18px)',
                    }}
                  />
                </button>
                {!isDefaultZoom && (
                  <button
                    onClick={handleZoomReset}
                    className="text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition-colors border-l border-slate-200/50"
                    style={{ padding: 'min(8px, 2cqmin)' }}
                    title="Reset zoom to 100%"
                  >
                    <RotateCcw
                      style={{
                        width: 'clamp(12px, 3.5cqmin, 15px)',
                        height: 'clamp(12px, 3.5cqmin, 15px)',
                      }}
                    />
                  </button>
                )}
              </div>
              {canAccessFeature('embed-mini-app') && (
                <button
                  onClick={handleGenerateMiniApp}
                  disabled={isGeneratingApp}
                  className="bg-white/80 backdrop-blur-sm hover:bg-indigo-50 text-indigo-500 shadow-sm border border-indigo-200/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  style={{ padding: 'min(8px, 2cqmin)' }}
                  title="Generate Interactive Mini App"
                  aria-label="Generate Interactive Mini App"
                >
                  {isGeneratingApp ? (
                    <Loader2
                      className="animate-spin"
                      style={{
                        width: 'clamp(14px, 4cqmin, 18px)',
                        height: 'clamp(14px, 4cqmin, 18px)',
                      }}
                    />
                  ) : (
                    <Wand2
                      style={{
                        width: 'clamp(14px, 4cqmin, 18px)',
                        height: 'clamp(14px, 4cqmin, 18px)',
                      }}
                    />
                  )}
                </button>
              )}
              {displayMode === 'url' && sanitizedUrl && (
                <a
                  href={sanitizedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white/80 backdrop-blur-sm hover:bg-white text-slate-500 hover:text-blue-500 shadow-sm border border-slate-200/50 rounded-lg p-2 transition-colors flex items-center justify-center"
                  title="Open in new tab"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink
                    style={{
                      width: 'clamp(14px, 4cqmin, 18px)',
                      height: 'clamp(14px, 4cqmin, 18px)',
                    }}
                  />
                </a>
              )}
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
            <div className="flex-1 relative overflow-hidden">
              <iframe
                key={refreshKey}
                title="Embed Content"
                src={displayMode === 'url' ? embedUrl : undefined}
                srcDoc={displayMode === 'code' ? html : undefined}
                className="absolute top-0 left-0 border-none block"
                style={{
                  transform: `scale(${effectiveZoom})`,
                  transformOrigin: 'top left',
                  width: `${100 / effectiveZoom}%`,
                  height: `${100 / effectiveZoom}%`,
                }}
                sandbox={sandbox}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          )}
        </div>
      }
    />
  );
};
