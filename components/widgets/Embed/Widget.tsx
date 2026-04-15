import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { Z_INDEX } from '@/config/zIndex';

import { applyAutoplay } from './applyAutoplay';

const NEW_WIDGET_SPACING = 20;
const TOOLBAR_GAP = 6;
const ESTIMATED_TOOLBAR_HEIGHT = 44;

export const EmbedWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { addWidget, addToast, updateWidget } = useDashboard();
  const { canAccessFeature } = useAuth();
  const buildingId = useWidgetBuildingId(widget);
  const { config: globalConfig } = useEmbedConfig(buildingId);
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
    autoplay = false,
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

  // Track the outer widget element so we can anchor the floating toolbar
  // just outside the widget's frame (bottom-left). The toolbar lives in a
  // portal under <body> so it never overlaps full-bleed iframe content
  // (Google Docs tabs, YouTube chrome, etc.).
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [widgetEl, setWidgetEl] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [isHot, setIsHot] = useState(false);
  const [focusCount, setFocusCount] = useState(0);
  // Delayed-hide timer so the pointer can cross the small gap between the
  // widget and the portaled toolbar without the toolbar flickering off.
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const el =
      contentRef.current?.closest<HTMLElement>(
        `[data-widget-id="${widget.id}"]`
      ) ?? null;
    setWidgetEl(el);
    if (el) setRect(el.getBoundingClientRect());
  }, [widget.id]);

  const updateRect = useCallback(() => {
    if (!widgetEl) return;
    setRect(widgetEl.getBoundingClientRect());
  }, [widgetEl]);

  useEffect(() => {
    if (!widgetEl) return;
    updateRect();

    const resizeObserver = new ResizeObserver(() => updateRect());
    resizeObserver.observe(widgetEl);

    const mutationObserver = new MutationObserver(() => updateRect());
    mutationObserver.observe(widgetEl, {
      attributes: true,
      attributeFilter: ['style'],
    });

    const onScrollOrResize = () => updateRect();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [widgetEl, updateRect]);

  const cancelPendingHide = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const showToolbar = useCallback(() => {
    cancelPendingHide();
    setIsHot(true);
  }, [cancelPendingHide]);

  const scheduleHide = useCallback(() => {
    cancelPendingHide();
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setIsHot(false);
    }, 150);
  }, [cancelPendingHide]);

  useEffect(() => () => cancelPendingHide(), [cancelPendingHide]);

  useEffect(() => {
    if (!widgetEl) return;
    widgetEl.addEventListener('pointerenter', showToolbar);
    widgetEl.addEventListener('pointerleave', scheduleHide);
    return () => {
      widgetEl.removeEventListener('pointerenter', showToolbar);
      widgetEl.removeEventListener('pointerleave', scheduleHide);
    };
  }, [widgetEl, showToolbar, scheduleHide]);

  const sanitizedUrl = ensureProtocol(url);
  const embedUrl = convertToEmbedUrl(sanitizedUrl);

  // When autoplay is enabled, append ?autoplay=1 for supported hosts
  const finalEmbedUrl = React.useMemo(
    () => applyAutoplay(embedUrl, autoplay),
    [embedUrl, autoplay]
  );

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

  const hasContent =
    (displayMode === 'url' && url.trim().length > 0) ||
    (displayMode === 'code' && html.trim().length > 0);
  const toolbarVisible = !widget.minimized && (isHot || focusCount > 0);
  const flipAbove =
    rect != null &&
    rect.bottom + ESTIMATED_TOOLBAR_HEIGHT + TOOLBAR_GAP > window.innerHeight;

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          ref={contentRef}
          className="w-full h-full bg-transparent flex flex-col overflow-hidden relative"
        >
          {hasContent &&
            rect &&
            typeof document !== 'undefined' &&
            createPortal(
              <div
                data-settings-exclude
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onPointerEnter={showToolbar}
                onPointerLeave={scheduleHide}
                onFocus={() => {
                  cancelPendingHide();
                  setFocusCount((c) => c + 1);
                }}
                onBlur={() => setFocusCount((c) => (c > 0 ? c - 1 : 0))}
                style={{
                  position: 'fixed',
                  left: rect.left,
                  top: flipAbove
                    ? rect.top - TOOLBAR_GAP
                    : rect.bottom + TOOLBAR_GAP,
                  transform: flipAbove ? 'translateY(-100%)' : undefined,
                  zIndex: Z_INDEX.popover,
                  opacity: toolbarVisible ? 1 : 0,
                  pointerEvents: toolbarVisible ? 'auto' : 'none',
                  transition: 'opacity 150ms ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <div className="flex items-center bg-white/80 backdrop-blur-sm shadow-sm border border-slate-200/50 rounded-lg overflow-hidden">
                  <button
                    onClick={handleZoomOut}
                    disabled={!canZoomOut}
                    className="p-2 text-slate-500 hover:text-blue-500 hover:bg-slate-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Zoom out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span title={isDefaultZoom ? 'Current zoom' : undefined}>
                    <button
                      onClick={handleZoomReset}
                      disabled={isDefaultZoom}
                      className="px-1 text-xs font-mono font-bold text-slate-600 select-none hover:text-blue-500 hover:bg-slate-50 transition-colors disabled:cursor-default disabled:hover:text-slate-600 disabled:hover:bg-transparent"
                      style={{ minWidth: '3em' }}
                      title={isDefaultZoom ? undefined : 'Reset to 100%'}
                    >
                      {Math.round(effectiveZoom * 100)}%
                    </button>
                  </span>
                  <button
                    onClick={handleZoomIn}
                    disabled={!canZoomIn}
                    className="p-2 text-slate-500 hover:text-blue-500 hover:bg-slate-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Zoom in"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  {!isDefaultZoom && (
                    <button
                      onClick={handleZoomReset}
                      className="p-2 text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition-colors border-l border-slate-200/50"
                      title="Reset zoom to 100%"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {canAccessFeature('embed-mini-app') && (
                  <button
                    onClick={handleGenerateMiniApp}
                    disabled={isGeneratingApp}
                    className="p-2 bg-white/80 backdrop-blur-sm hover:bg-indigo-50 text-indigo-500 shadow-sm border border-indigo-200/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    title="Generate Interactive Mini App"
                    aria-label="Generate Interactive Mini App"
                  >
                    {isGeneratingApp ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wand2 className="w-4 h-4" />
                    )}
                  </button>
                )}
                {displayMode === 'url' && sanitizedUrl && (
                  <a
                    href={sanitizedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 bg-white/80 backdrop-blur-sm hover:bg-white text-slate-500 hover:text-blue-500 shadow-sm border border-slate-200/50 rounded-lg transition-colors flex items-center justify-center"
                    title="Open in new tab"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>,
              document.body
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
                src={displayMode === 'url' ? finalEmbedUrl : undefined}
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
