import React, { useState, useEffect, useRef } from 'react';
import {
  Link2,
  Code,
  Video,
  Tv,
  Check,
  Copy,
  Upload,
  Loader2,
  StopCircle,
} from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useScreenRecord } from '@/hooks/useScreenRecord';
import { convertToEmbedUrl } from '@/utils/urlHelpers';
import { EmbedTab } from './types';

import { EmbedConfig } from '@/types';

export const EmbedConfigEditor: React.FC<{
  config: Partial<EmbedConfig>;
  onChange: (config: Partial<EmbedConfig>) => void;
}> = ({ config, onChange }) => {
  const [activeTab, setActiveTab] = useState<EmbedTab>(() => {
    const mode = config.mode as EmbedTab | undefined;
    return mode === 'url' || mode === 'code' ? mode : 'url';
  });
  const { driveService, userDomain } = useGoogleDrive();
  const { addToast } = useDashboard();

  // Keep raw URL in local state so the input remains editable while typing.
  // The converted (embeddable) URL is only written to config on blur.
  const [rawUrl, setRawUrl] = useState(config.url ?? '');
  const [copied, setCopied] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  // Keep rawUrl in sync when config.url changes from the parent (e.g. on edit open)
  const prevConfigUrl = useRef(config.url);
  useEffect(() => {
    if (config.url !== prevConfigUrl.current) {
      prevConfigUrl.current = config.url;
      setRawUrl(config.url ?? '');
    }
  }, [config.url]);

  const embedUrl = convertToEmbedUrl(rawUrl);
  const wasConverted = rawUrl.trim() !== '' && embedUrl !== rawUrl.trim();

  // Keep config.url in sync with the latest rawUrl so saves never see a stale URL.
  useEffect(() => {
    if (config.mode === 'code') return;
    const finalUrl = embedUrl || rawUrl.trim();
    const currentUrl = config.url ?? '';
    if (finalUrl !== currentUrl) {
      onChange({ ...config, url: finalUrl });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.mode, config.url, embedUrl, rawUrl, onChange]);

  const applyUrl = () => {
    const finalUrl = embedUrl || rawUrl.trim();
    onChange({ ...config, url: finalUrl });
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    if (copiedTimerRef.current !== null) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  // Screen recording — upload result to Google Drive
  const [recordingUploadState, setRecordingUploadState] = useState<
    'idle' | 'uploading' | 'done' | 'error'
  >('idle');

  const { isRecording, duration, startRecording, stopRecording } =
    useScreenRecord({
      onSuccess: async (blob) => {
        setRecordingUploadState('uploading');
        try {
          const fileName = `announcement-recording-${Date.now()}.webm`;
          if (driveService) {
            const driveFile = await driveService.uploadFile(
              blob,
              fileName,
              'Announcements'
            );
            await driveService.makePublic(driveFile.id, userDomain);
            const videoUrl =
              driveFile.webContentLink ?? driveFile.webViewLink ?? '';
            const html = `<video src="${videoUrl}" controls style="width:100%;height:100%;object-fit:contain;"></video>`;
            onChange({ ...config, mode: 'code', html, url: '' });
            setRecordingUploadState('done');
          } else {
            setRecordingUploadState('error');
          }
        } catch (err) {
          console.error('Failed to upload recording:', err);
          setRecordingUploadState('error');
        }
      },
    });

  // Video file upload via Drive
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingVideo(true);
    try {
      if (driveService) {
        const driveFile = await driveService.uploadFile(
          file,
          `announcement-${Date.now()}-${file.name}`,
          'Announcements'
        );
        await driveService.makePublic(driveFile.id, userDomain);
        const videoUrl =
          driveFile.webContentLink ?? driveFile.webViewLink ?? '';
        const html = `<video src="${videoUrl}" controls style="width:100%;height:100%;object-fit:contain;"></video>`;
        onChange({ ...config, mode: 'code', html, url: '' });
      }
    } catch (err) {
      console.error('Failed to upload video:', err);
      addToast('Failed to upload video. Please try again.', 'error');
    } finally {
      setUploadingVideo(false);
    }
  };

  const setTab = (tab: EmbedTab) => {
    setActiveTab(tab);
    if (tab === 'url' || tab === 'code') {
      onChange({ ...config, mode: tab });
    } else if (tab === 'live' && config.mode !== 'url') {
      onChange({ ...config, mode: 'url' });
    }
  };

  const TABS: { id: EmbedTab; label: string; icon: React.ReactNode }[] = [
    { id: 'url', label: 'URL', icon: <Link2 className="w-3.5 h-3.5" /> },
    { id: 'code', label: 'Code', icon: <Code className="w-3.5 h-3.5" /> },
    { id: 'record', label: 'Record', icon: <Video className="w-3.5 h-3.5" /> },
    { id: 'live', label: 'Live Meeting', icon: <Tv className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === tab.id
                ? 'bg-white shadow-sm text-brand-blue-primary'
                : 'text-slate-500 hover:bg-slate-200/50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* URL tab */}
      {activeTab === 'url' && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700">
            URL to Embed
          </label>
          <input
            type="url"
            value={rawUrl}
            onChange={(e) => setRawUrl(e.target.value)}
            onBlur={applyUrl}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
            placeholder="YouTube, Google Drive, Docs, Slides, Forms…"
          />
          {wasConverted && (
            <div className="flex items-start gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-emerald-700">
                  Auto-converted to embeddable URL
                </p>
                <p className="text-xs text-emerald-600 break-all mt-0.5">
                  {embedUrl}
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(embedUrl)}
                className="shrink-0 p-1 text-emerald-600 hover:bg-emerald-100 rounded"
                title="Copy embed URL"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          )}
          <p className="text-xs text-slate-500">
            Paste any YouTube, Google Drive, Docs, Slides, Sheets, or Forms link
            — it will be converted automatically.
          </p>
        </div>
      )}

      {/* Code tab */}
      {activeTab === 'code' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Custom HTML / iframe Embed Code
            </label>
            <textarea
              value={config.html ?? ''}
              onChange={(e) => onChange({ ...config, html: e.target.value })}
              className="w-full h-32 px-3 py-2 text-xs font-mono bg-slate-900 text-emerald-400 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
              placeholder={
                '<iframe src="..."></iframe>\nor\n<video src="..."></video>'
              }
            />
          </div>
          <div className="relative">
            <div
              className="absolute inset-0 flex items-center"
              aria-hidden="true"
            >
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-2 text-xs text-slate-500 font-semibold uppercase tracking-wider">
                OR UPLOAD VIDEO
              </span>
            </div>
          </div>
          <label className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors gap-2 group">
            {uploadingVideo ? (
              <Loader2 className="w-4 h-4 text-brand-blue-primary animate-spin" />
            ) : (
              <Upload className="w-4 h-4 text-slate-400 group-hover:text-brand-blue-primary" />
            )}
            <span className="text-sm text-slate-600 font-medium">
              {uploadingVideo ? 'Uploading to Drive…' : 'Click to Upload Video'}
            </span>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => void handleVideoUpload(e)}
              disabled={uploadingVideo || !driveService}
            />
          </label>
          {!driveService && (
            <p className="text-xs text-amber-600 text-center">
              Sign in with Google to enable video uploads.
            </p>
          )}
        </div>
      )}

      {/* Record tab */}
      {activeTab === 'record' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Record your screen or a browser tab, then upload directly to Google
            Drive. Students will see the video inside the announcement.
          </p>
          {!driveService && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              Sign in with Google to enable recording uploads.
            </div>
          )}
          <div className="flex flex-col items-center gap-3">
            {!isRecording && recordingUploadState === 'idle' && (
              <button
                onClick={() => void startRecording()}
                disabled={!driveService}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                <Video className="w-4 h-4" />
                Start Screen Recording
              </button>
            )}
            {isRecording && (
              <div className="flex flex-col items-center gap-2 w-full">
                <div className="flex items-center gap-2 text-red-600 font-semibold text-sm">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  Recording… {duration}s
                </div>
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  <StopCircle className="w-4 h-4" />
                  Stop &amp; Upload
                </button>
              </div>
            )}
            {recordingUploadState === 'uploading' && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="w-4 h-4 animate-spin text-brand-blue-primary" />
                Uploading to Google Drive…
              </div>
            )}
            {recordingUploadState === 'done' && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 font-semibold">
                <Check className="w-4 h-4" />
                Recording saved — video is ready in the embed!
              </div>
            )}
            {recordingUploadState === 'error' && (
              <div className="text-sm text-red-600">
                Upload failed. Make sure Google Drive is connected and try
                again.
              </div>
            )}
          </div>
          {(recordingUploadState === 'done' ||
            recordingUploadState === 'error') && (
            <button
              onClick={() => setRecordingUploadState('idle')}
              className="text-xs text-slate-500 hover:text-slate-700 underline"
            >
              Record again
            </button>
          )}
        </div>
      )}

      {/* Live Meeting tab */}
      {activeTab === 'live' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Tv className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-800">
              Stream live from <strong>Google Meet</strong> using your Google
              Workspace for Education Plus account. The live feed appears inside
              the announcement window — no third-party tools required.
            </p>
          </div>

          {/* Step-by-step instructions */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
              How to start a live stream
            </p>
            <ol className="space-y-1.5">
              {[
                'Open Google Meet and start your meeting.',
                <>
                  Click <strong>Activities</strong> (puzzle piece icon, bottom
                  right) &rarr; <strong>Live streaming</strong>.
                </>,
                <>
                  Click <strong>Start streaming</strong>. Google creates a
                  YouTube Live event automatically.
                </>,
                'Copy the YouTube Live URL shown in Meet.',
                'Paste it in the field below and click away to apply.',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-brand-blue-primary text-white text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-xs text-slate-600">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* URL input */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              YouTube Live URL
            </label>
            <input
              type="url"
              value={rawUrl}
              onChange={(e) => setRawUrl(e.target.value)}
              onBlur={applyUrl}
              placeholder="https://www.youtube.com/live/…"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
            />
            {wasConverted && (
              <p className="text-xs text-emerald-600">
                ✓ Converted to embed URL automatically
              </p>
            )}
          </div>

          <p className="text-xs text-slate-400">
            Requires Google Workspace for Education Plus or the Teaching &amp;
            Learning Upgrade.{' '}
            <a
              href="https://support.google.com/meet/answer/9308630"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-600"
            >
              Learn more
            </a>
          </p>
        </div>
      )}
    </div>
  );
};
