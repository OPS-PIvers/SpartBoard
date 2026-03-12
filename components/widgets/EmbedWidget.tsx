import React, { useState, useEffect } from 'react';
import { useDashboard } from '../../context/useDashboard';
import { WidgetData, EmbedConfig } from '../../types';
import {
  Globe,
  ExternalLink,
  AlertCircle,
  Code,
  Link2,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { ScaledEmptyState } from '../common/ScaledEmptyState';
import { convertToEmbedUrl } from '../../utils/urlHelpers';
import { SettingsLabel } from '../common/SettingsLabel';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';

import { WidgetLayout } from './WidgetLayout';

const ensureProtocol = (url: string) => {
  if (!url) return '';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

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

interface CompatibilityResult {
  isEmbeddable: boolean;
  reason?: string;
  error?: string;
  uncertain?: boolean;
}

export const EmbedSettings: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as EmbedConfig;
  const {
    mode = 'url',
    url = '',
    html = '',
    refreshInterval = 0,
    isEmbeddable = true,
  } = config;

  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<
    'idle' | 'success' | 'blocked' | 'error'
  >('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const isActuallyEmbeddable = React.useMemo(() => {
    if (isEmbeddable) return true;
    try {
      const parsedUrl = new URL(ensureProtocol(url));
      const hostname = parsedUrl.hostname.toLowerCase();
      const allowListedDomains = new Set([
        'www.carriderpro.com',
        'carriderpro.com',
      ]);
      return allowListedDomains.has(hostname);
    } catch (_e) {
      return isEmbeddable;
    }
  }, [isEmbeddable, url]);

  const handleVerify = async () => {
    if (!url) return;
    setIsVerifying(true);
    setVerifyStatus('idle');

    // Skip verification for allow-listed domains
    try {
      const parsedUrl = new URL(ensureProtocol(url));
      const hostname = parsedUrl.hostname.toLowerCase();
      const allowListedDomains = new Set([
        'www.carriderpro.com',
        'carriderpro.com',
      ]);

      if (allowListedDomains.has(hostname)) {
        setVerifyStatus('success');
        updateWidget(widget.id, {
          config: {
            ...config,
            isEmbeddable: true,
            blockedReason: '',
          },
        });
        setIsVerifying(false);
        return;
      }
    } catch (_e) {
      // Proceed to normal verification if URL parsing fails
    }

    try {
      const checkCompatibility = httpsCallable<
        { url: string },
        CompatibilityResult
      >(functions, 'checkUrlCompatibility');
      const result = await checkCompatibility({ url });
      const data = result.data;

      if (data.isEmbeddable) {
        setVerifyStatus('success');
        updateWidget(widget.id, {
          config: {
            ...config,
            isEmbeddable: true,
            blockedReason: '',
          },
        });
      } else {
        setVerifyStatus('blocked');
        setErrorMsg(data.reason ?? 'Embedding is blocked by this site.');
        updateWidget(widget.id, {
          config: {
            ...config,
            isEmbeddable: false,
            blockedReason: data.reason,
          },
        });
      }
    } catch (err) {
      console.error('Verify error:', err);
      setVerifyStatus('error');
      setErrorMsg('Could not verify link compatibility.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex bg-slate-100 p-1 rounded-xl">
        <button
          onClick={() =>
            updateWidget(widget.id, {
              config: { ...config, mode: 'url' },
            })
          }
          className={`flex-1 py-1.5 text-xxs  rounded-lg transition-all flex items-center justify-center gap-2 ${mode === 'url' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
        >
          <Link2 className="w-3 h-3" /> WEBSITE URL
        </button>
        <button
          onClick={() =>
            updateWidget(widget.id, {
              config: { ...config, mode: 'code' },
            })
          }
          className={`flex-1 py-1.5 text-xxs  rounded-lg transition-all flex items-center justify-center gap-2 ${mode === 'code' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
        >
          <Code className="w-3 h-3" /> CUSTOM CODE
        </button>
      </div>

      {mode === 'url' ? (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div>
            <SettingsLabel>Target URL</SettingsLabel>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={url}
                  placeholder="https://example.com..."
                  onChange={(e) => {
                    setVerifyStatus('idle');
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        url: e.target.value,
                        isEmbeddable: true,
                      },
                    });
                  }}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all pr-10 text-slate-900"
                />
                <Globe className="absolute right-3 top-2.5 w-4 h-4 text-slate-300" />
              </div>
              <button
                onClick={handleVerify}
                disabled={!url || isVerifying}
                className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xxs font-bold hover:bg-slate-800 disabled:bg-slate-200 transition-all flex items-center gap-2 shrink-0"
              >
                {isVerifying ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  'VERIFY'
                )}
              </button>
            </div>

            {/* Verification Results */}
            {verifyStatus === 'success' && (
              <div className="mt-2 flex items-center gap-2 text-emerald-600 animate-in slide-in-from-top-1">
                <CheckCircle2 className="w-3 h-3" />
                <span className="text-xxs font-medium">
                  Compatible with embedding!
                </span>
              </div>
            )}
            {verifyStatus === 'blocked' && (
              <div className="mt-2 flex items-start gap-2 text-amber-600 animate-in slide-in-from-top-1 bg-amber-50 p-2 rounded-lg border border-amber-100">
                <XCircle className="w-3 h-3 mt-0.5 shrink-0" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-xxs font-bold">Embedding Blocked</span>
                  <span className="text-xxs leading-tight opacity-80">
                    {errorMsg} Fallback mode will be used.
                  </span>
                </div>
              </div>
            )}
            {verifyStatus === 'error' && (
              <div className="mt-2 flex items-center gap-2 text-red-500 animate-in slide-in-from-top-1">
                <AlertCircle className="w-3 h-3" />
                <span className="text-xxs font-medium">{errorMsg}</span>
              </div>
            )}

            <p className="mt-2 text-xxs text-slate-400 leading-relaxed italic">
              Pro-tip: Links from YouTube, Google Docs, Slides, and Sheets are
              automatically formatted.
            </p>
          </div>

          {!isActuallyEmbeddable && verifyStatus === 'idle' && (
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg flex gap-3">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xxs text-amber-800 leading-relaxed ">
                This site is currently flagged as non-embeddable. A &quot;New
                Tab&quot; button will be shown to users instead.
              </p>
            </div>
          )}

          <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg flex gap-3">
            <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-xxs text-slate-500 leading-relaxed ">
              Some websites prevent embedding for security. Use the{' '}
              <strong>Verify</strong> button to check compatibility.
            </p>
          </div>

          {url && (
            <a
              href={ensureProtocol(url)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full p-2 text-xxs  text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-50 transition-colors"
            >
              OPEN ORIGINAL <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div>
            <SettingsLabel>HTML / CSS / JS</SettingsLabel>
            <textarea
              value={html}
              placeholder="<html>&#10;  <style>body { background: #f0f; }</style>&#10;  <body><h1>Hello Class!</h1></body>&#10;</html>"
              onChange={(e) =>
                updateWidget(widget.id, {
                  config: { ...config, html: e.target.value },
                })
              }
              className="w-full h-48 p-3 text-xxs font-mono bg-slate-900 text-emerald-400 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none leading-relaxed custom-scrollbar"
              spellCheck={false}
            />
          </div>
          <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg flex gap-3">
            <AlertCircle className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <p className="text-xxs text-indigo-800 leading-relaxed ">
              You can paste a full single-file mini-app here. Scripts are
              allowed but run in a secure sandbox.
            </p>
          </div>
        </div>
      )}

      {/* Auto-Refresh Setting */}
      <div className="pt-4 border-t border-slate-100">
        <SettingsLabel htmlFor="refresh-interval">Auto-Refresh</SettingsLabel>
        <select
          id="refresh-interval"
          value={refreshInterval}
          onChange={(e) =>
            updateWidget(widget.id, {
              config: {
                ...config,
                refreshInterval: parseInt(e.target.value, 10),
              },
            })
          }
          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-slate-900"
        >
          {[
            { value: 0, label: 'Disabled' },
            { value: 1, label: 'Every 1 Minute' },
            { value: 5, label: 'Every 5 Minutes' },
            { value: 15, label: 'Every 15 Minutes' },
            { value: 30, label: 'Every 30 Minutes' },
            { value: 60, label: 'Every 1 Hour' },
          ].map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
