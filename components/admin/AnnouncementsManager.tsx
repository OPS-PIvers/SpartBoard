import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  Suspense,
} from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  Bell,
  Plus,
  Trash2,
  Edit2,
  Radio,
  X,
  Clock,
  Building2,
  Play,
  Square,
  ChevronDown,
  ChevronUp,
  Link2,
  Code,
  Upload,
  Loader2,
  Video,
  StopCircle,
  Copy,
  Check,
  Tv,
  BarChart2,
} from 'lucide-react';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useScreenRecord } from '@/hooks/useScreenRecord';
import {
  Announcement,
  AnnouncementActivationType,
  AnnouncementDismissalType,
  WidgetType,
  WidgetData,
  WidgetConfig,
  PollConfig,
} from '@/types';
import { BUILDINGS } from '@/config/buildings';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import { TOOLS } from '@/config/tools';
import { convertToEmbedUrl } from '@/utils/urlHelpers';
import { WIDGET_COMPONENTS } from '@/components/widgets/WidgetRegistry';

// Widget types that make practical sense as announcements
const ANNOUNCEMENT_WIDGET_TYPES: WidgetType[] = [
  'text',
  'embed',
  'expectations',
  'traffic',
  'clock',
  'qr',
  'weather',
  'schedule',
  'scoreboard',
  'poll',
  'time-tool',
  'checklist',
  'instructionalRoutines',
  'recessGear',
];

function getDefaultConfig(type: WidgetType): Record<string, unknown> {
  const defaults = WIDGET_DEFAULTS[type];
  if (defaults?.config) {
    return defaults.config as Record<string, unknown>;
  }
  return {};
}

function getDefaultSize(type: WidgetType): { w: number; h: number } {
  const defaults = WIDGET_DEFAULTS[type];
  return {
    w: (defaults?.w as number) ?? 400,
    h: (defaults?.h as number) ?? 300,
  };
}

const DISMISSAL_OPTIONS: {
  value: AnnouncementDismissalType;
  label: string;
  description: string;
}[] = [
  {
    value: 'user',
    label: 'User Can Dismiss',
    description: 'Each user can close the announcement themselves.',
  },
  {
    value: 'scheduled',
    label: 'Scheduled Time',
    description: 'Auto-dismissed at a specific time of day for all users.',
  },
  {
    value: 'duration',
    label: 'After Duration',
    description: 'Auto-dismissed after a set number of seconds or minutes.',
  },
  {
    value: 'admin',
    label: 'Admin Only',
    description: 'Only you (admin) can deactivate the announcement.',
  },
];

const ACTIVATION_OPTIONS: {
  value: AnnouncementActivationType;
  label: string;
  description: string;
}[] = [
  {
    value: 'manual',
    label: 'Manual',
    description: 'You push the announcement by clicking the Activate button.',
  },
  {
    value: 'scheduled',
    label: 'Scheduled Time',
    description: 'Automatically activates at a specific time of day.',
  },
];

interface AnnouncementFormData {
  name: string;
  widgetType: WidgetType;
  widgetConfig: Record<string, unknown>;
  widgetSize: { w: number; h: number };
  maximized: boolean;
  activationType: AnnouncementActivationType;
  scheduledActivationTime: string;
  dismissalType: AnnouncementDismissalType;
  scheduledDismissalTime: string;
  dismissalDurationSeconds: number;
  dismissalDurationUnit: 'seconds' | 'minutes';
  targetBuildings: string[];
}

function buildDefaultForm(): AnnouncementFormData {
  return {
    name: '',
    widgetType: 'text',
    widgetConfig: getDefaultConfig('text'),
    widgetSize: getDefaultSize('text'),
    maximized: false,
    activationType: 'manual',
    scheduledActivationTime: '08:00',
    dismissalType: 'user',
    scheduledDismissalTime: '15:00',
    dismissalDurationSeconds: 60,
    dismissalDurationUnit: 'seconds',
    targetBuildings: [],
  };
}

// Inline config editors for common widget types
const TextConfigEditor: React.FC<{
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}> = ({ config, onChange }) => (
  <div className="space-y-3">
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">
        Message Content
      </label>
      <textarea
        value={(config.content as string) ?? ''}
        onChange={(e) => onChange({ ...config, content: e.target.value })}
        className="w-full h-28 px-3 py-2 text-sm border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
        placeholder="Enter announcement message…"
      />
    </div>
    <div className="flex gap-3">
      <div className="flex-1">
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Background Color
        </label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={(config.bgColor as string) ?? '#ffeb3b'}
            onChange={(e) => onChange({ ...config, bgColor: e.target.value })}
            className="w-10 h-8 border border-slate-300 rounded cursor-pointer"
          />
          <span className="text-xs text-slate-500">
            {(config.bgColor as string) ?? '#ffeb3b'}
          </span>
        </div>
      </div>
      <div className="flex-1">
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Font Size
        </label>
        <input
          type="number"
          min={10}
          max={72}
          value={(config.fontSize as number) ?? 18}
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10);
            if (!Number.isFinite(parsed)) return;
            onChange({
              ...config,
              fontSize: Math.min(72, Math.max(10, parsed)),
            });
          }}
          className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
        />
      </div>
    </div>
  </div>
);

type EmbedTab = 'url' | 'code' | 'record' | 'live';

const EmbedConfigEditor: React.FC<{
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}> = ({ config, onChange }) => {
  const [activeTab, setActiveTab] = useState<EmbedTab>(() => {
    const mode = config.mode as EmbedTab | undefined;
    return mode === 'url' || mode === 'code' ? mode : 'url';
  });
  const { driveService, userDomain } = useGoogleDrive();
  const { addToast } = useDashboard();

  // Keep raw URL in local state so the input remains editable while typing.
  // The converted (embeddable) URL is only written to config on blur.
  const [rawUrl, setRawUrl] = useState((config.url as string) ?? '');
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
      setRawUrl((config.url as string) ?? '');
    }
  }, [config.url]);

  const embedUrl = convertToEmbedUrl(rawUrl);
  const wasConverted = rawUrl.trim() !== '' && embedUrl !== rawUrl.trim();

  // Keep config.url in sync with the latest rawUrl so saves never see a stale URL.
  useEffect(() => {
    if (config.mode === 'code') return;
    const finalUrl = embedUrl || rawUrl.trim();
    const currentUrl = (config.url as string | undefined) ?? '';
    if (finalUrl !== currentUrl) {
      onChange({ ...config, url: finalUrl });
    }
  }, [config, embedUrl, rawUrl, onChange]);

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
              value={(config.html as string) ?? ''}
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

const QRConfigEditor: React.FC<{
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}> = ({ config, onChange }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-700 mb-1">
      URL for QR Code
    </label>
    <input
      type="url"
      value={(config.url as string) ?? ''}
      onChange={(e) => onChange({ ...config, url: e.target.value })}
      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
      placeholder="https://example.com"
    />
  </div>
);

const ExpectationsConfigEditor: React.FC<{
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}> = ({ config, onChange }) => {
  const voiceLevel = (config.voiceLevel as number | null) ?? null;
  const workMode = (config.workMode as string | null) ?? null;
  const interactionMode = (config.interactionMode as string | null) ?? null;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Voice Level
        </label>
        <div className="flex gap-2">
          {[null, 0, 1, 2, 3, 4].map((level) => (
            <button
              key={String(level)}
              onClick={() => onChange({ ...config, voiceLevel: level })}
              className={`flex-1 py-1.5 text-xs rounded-md border transition-colors ${
                voiceLevel === level
                  ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {level === null ? 'None' : `V${level}`}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Work Mode
        </label>
        <select
          value={workMode ?? ''}
          onChange={(e) =>
            onChange({ ...config, workMode: e.target.value || null })
          }
          className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
        >
          <option value="">None</option>
          <option value="individual">Individual</option>
          <option value="partner">Partner</option>
          <option value="group">Group</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Interaction Mode
        </label>
        <select
          value={interactionMode ?? ''}
          onChange={(e) =>
            onChange({ ...config, interactionMode: e.target.value || null })
          }
          className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
        >
          <option value="">None</option>
          <option value="none">Silent</option>
          <option value="respectful">Respectful</option>
          <option value="listening">Listening</option>
          <option value="productive">Productive</option>
          <option value="discussion">Discussion</option>
        </select>
      </div>
    </div>
  );
};

const GenericConfigEditor: React.FC<{
  widgetType: WidgetType;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}> = ({ widgetType, config, onChange }) => {
  const [jsonStr, setJsonStr] = useState(() => JSON.stringify(config, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setJsonStr(JSON.stringify(config, null, 2));
  }, [config]);

  const handleBlur = () => {
    try {
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      setJsonError(null);
      onChange(parsed);
    } catch {
      setJsonError('Invalid JSON — please fix before saving.');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-semibold text-slate-700">
          Widget Config (JSON)
        </label>
        <button
          onClick={() => {
            const defaults = getDefaultConfig(widgetType);
            setJsonStr(JSON.stringify(defaults, null, 2));
            onChange(defaults);
            setJsonError(null);
          }}
          className="text-xs text-brand-blue-primary hover:underline"
        >
          Reset to defaults
        </button>
      </div>
      <textarea
        value={jsonStr}
        onChange={(e) => setJsonStr(e.target.value)}
        onBlur={handleBlur}
        className={`w-full h-36 px-3 py-2 text-xs font-mono border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue-primary ${
          jsonError ? 'border-red-400 bg-red-50' : 'border-slate-300'
        }`}
        spellCheck={false}
      />
      {jsonError && <p className="mt-1 text-xs text-red-600">{jsonError}</p>}
      <p className="mt-1 text-xs text-slate-500">
        Edit the JSON config directly. Use &quot;Reset to defaults&quot; to
        start fresh.
      </p>
    </div>
  );
};

function renderConfigEditor(
  form: AnnouncementFormData,
  setForm: React.Dispatch<React.SetStateAction<AnnouncementFormData>>
) {
  const handleConfigChange = (config: Record<string, unknown>) =>
    setForm((f) => ({ ...f, widgetConfig: config }));

  switch (form.widgetType) {
    case 'text':
      return (
        <TextConfigEditor
          config={form.widgetConfig}
          onChange={handleConfigChange}
        />
      );
    case 'embed':
      return (
        <EmbedConfigEditor
          config={form.widgetConfig}
          onChange={handleConfigChange}
        />
      );
    case 'qr':
      return (
        <QRConfigEditor
          config={form.widgetConfig}
          onChange={handleConfigChange}
        />
      );
    case 'expectations':
      return (
        <ExpectationsConfigEditor
          config={form.widgetConfig}
          onChange={handleConfigChange}
        />
      );
    case 'traffic':
    case 'clock':
    case 'weather':
    case 'recessGear':
      return (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
          This widget type uses its default configuration. No additional setup
          required.
        </div>
      );
    default:
      return (
        <GenericConfigEditor
          widgetType={form.widgetType}
          config={form.widgetConfig}
          onChange={handleConfigChange}
        />
      );
  }
}

// Status badge
function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${
        isActive
          ? 'bg-green-100 text-green-700 border border-green-300'
          : 'bg-slate-100 text-slate-500 border border-slate-300'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}
      />
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

// Form section wrapper
const FormSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, icon, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          {icon}
          {title}
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>
      {open && <div className="p-4 space-y-3 bg-white">{children}</div>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Preview canvas — renders a scaled-down live preview of the announcement
// ---------------------------------------------------------------------------

const PREVIEW_MAX_W = 370;
const PREVIEW_MAX_H = 240;

const AnnouncementPreview: React.FC<{
  widgetType: WidgetType;
  widgetConfig: Record<string, unknown>;
  widgetSize: { w: number; h: number };
}> = ({ widgetType, widgetConfig, widgetSize }) => {
  const WidgetComponent = WIDGET_COMPONENTS[widgetType];
  const { w, h } = widgetSize;
  const scale = Math.min(PREVIEW_MAX_W / w, PREVIEW_MAX_H / h, 1);
  const scaledW = Math.round(w * scale);
  const scaledH = Math.round(h * scale);

  const fakeWidget: WidgetData = {
    id: 'announcement-preview',
    type: widgetType,
    x: 0,
    y: 0,
    w,
    h,
    z: 1,
    flipped: false,
    minimized: false,
    maximized: false,
    config: widgetConfig as WidgetConfig,
  };

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-800">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-700">
        <span className="text-xs text-slate-400 font-medium">Live Preview</span>
        <span className="text-xs text-slate-500 font-mono">
          {w} × {h} px
        </span>
      </div>
      <div className="flex items-center justify-center p-4 bg-slate-800 min-h-[120px]">
        {WidgetComponent ? (
          <div
            style={{
              width: scaledW,
              height: scaledH,
              position: 'relative',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: w,
                height: h,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                containerType: 'size',
              }}
            >
              <Suspense
                fallback={
                  <div className="w-full h-full bg-slate-700 animate-pulse rounded-lg" />
                }
              >
                <WidgetComponent widget={fakeWidget} />
              </Suspense>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">No preview available</p>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Poll responses panel — live vote tallies from announcement sub-collection
// ---------------------------------------------------------------------------

const PollResponsesPanel: React.FC<{
  announcement: Announcement;
  onClose: () => void;
}> = ({ announcement, onClose }) => {
  const config = announcement.widgetConfig as unknown as PollConfig;
  const options = config.options ?? [];
  const [votes, setVotes] = useState<Record<number, number>>({});

  useEffect(() => {
    try {
      const unsub = onSnapshot(
        collection(db, 'announcements', announcement.id, 'pollVotes'),
        (snap) => {
          const counts: Record<number, number> = {};
          snap.forEach((d) => {
            const data = d.data() as { count?: number };
            counts[Number(d.id)] = data.count ?? 0;
          });
          setVotes(counts);
        }
      );
      return unsub;
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      return () => {};
    }
  }, [announcement.id]);

  const total = options.reduce((sum, _, i) => sum + (votes[i] ?? 0), 0);

  const exportCsv = () => {
    const rows = options.map(
      (o, i) => `"${o.label.replace(/"/g, '""')}",${votes[i] ?? 0}`
    );
    const csv = `Option,Votes\n${rows.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Poll_${announcement.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-80 shrink-0 bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-indigo-600" />
          <span className="font-semibold text-slate-800 text-sm truncate">
            {announcement.name}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-600 rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <p className="text-xs text-slate-500 font-medium">
          {config.question ?? 'Poll Results'} —{' '}
          <span className="font-semibold text-slate-700">{total} votes</span>
        </p>
        {options.length === 0 && (
          <p className="text-xs text-slate-400">No options configured.</p>
        )}
        {options.map((o, i) => {
          const count = votes[i] ?? 0;
          const pct = total === 0 ? 0 : Math.round((count / total) * 100);
          return (
            <div key={i} className="space-y-1">
              <div className="flex justify-between text-xs font-medium text-slate-700">
                <span className="truncate pr-2">{o.label}</span>
                <span className="shrink-0 font-mono text-slate-500">
                  {count} ({pct}%)
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all duration-500 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
        <button
          onClick={exportCsv}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
        >
          Export CSV
        </button>
      </div>
    </div>
  );
};

export const AnnouncementsManager: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [viewingResponsesId, setViewingResponsesId] = useState<string | null>(
    null
  );
  const [form, setForm] = useState<AnnouncementFormData>(buildDefaultForm);

  // Subscribe to announcements collection
  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot(
      collection(db, 'announcements'),
      (snap) => {
        const items: Announcement[] = [];
        snap.forEach((d) =>
          items.push({ id: d.id, ...d.data() } as Announcement)
        );
        items.sort((a, b) => b.createdAt - a.createdAt);
        setAnnouncements(items);
        setLoading(false);
      },
      (err) => {
        console.error('[AnnouncementsManager] Firestore error:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [user]);

  const openCreate = useCallback(() => {
    setForm(buildDefaultForm());
    setEditingId(null);
    setIsCreating(true);
  }, []);

  const openEdit = useCallback((a: Announcement) => {
    const durationSec = a.dismissalDurationSeconds ?? 60;
    const isMinutes = durationSec >= 60 && durationSec % 60 === 0;
    setForm({
      name: a.name,
      widgetType: a.widgetType,
      widgetConfig: a.widgetConfig,
      widgetSize: a.widgetSize,
      maximized: a.maximized,
      activationType: a.activationType,
      scheduledActivationTime: a.scheduledActivationTime ?? '08:00',
      dismissalType: a.dismissalType,
      scheduledDismissalTime: a.scheduledDismissalTime ?? '15:00',
      dismissalDurationSeconds: isMinutes ? durationSec / 60 : durationSec,
      dismissalDurationUnit: isMinutes ? 'minutes' : 'seconds',
      targetBuildings: a.targetBuildings,
    });
    setEditingId(a.id);
    setIsCreating(true);
  }, []);

  const closeForm = useCallback(() => {
    setIsCreating(false);
    setEditingId(null);
  }, []);

  const handleWidgetTypeChange = (type: WidgetType) => {
    setForm((f) => ({
      ...f,
      widgetType: type,
      widgetConfig: getDefaultConfig(type),
      widgetSize: getDefaultSize(type),
    }));
  };

  const toggleBuilding = (id: string) => {
    setForm((f) => ({
      ...f,
      targetBuildings: f.targetBuildings.includes(id)
        ? f.targetBuildings.filter((b) => b !== id)
        : [...f.targetBuildings, id],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      addToast('Please enter an announcement name.', 'error');
      return;
    }
    setSaving(true);
    try {
      const durationSeconds =
        form.dismissalDurationUnit === 'minutes'
          ? form.dismissalDurationSeconds * 60
          : form.dismissalDurationSeconds;

      const now = Date.now();
      const existing = editingId
        ? announcements.find((a) => a.id === editingId)
        : undefined;

      const payload: Omit<Announcement, 'id'> = {
        name: form.name.trim(),
        widgetType: form.widgetType,
        widgetConfig: form.widgetConfig,
        widgetSize: form.widgetSize,
        maximized: form.maximized,
        activationType: form.activationType,
        scheduledActivationTime:
          form.activationType === 'scheduled'
            ? form.scheduledActivationTime
            : undefined,
        // Scheduled announcements are enabled ("active") as soon as they're created —
        // the overlay itself gates visibility by the clock time. Manual announcements
        // start inactive until the admin explicitly clicks Activate.
        isActive: existing?.isActive ?? form.activationType === 'scheduled',
        activatedAt: existing?.activatedAt ?? null,
        dismissalType: form.dismissalType,
        scheduledDismissalTime:
          form.dismissalType === 'scheduled'
            ? form.scheduledDismissalTime
            : undefined,
        dismissalDurationSeconds:
          form.dismissalType === 'duration' ? durationSeconds : undefined,
        targetBuildings: form.targetBuildings,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        createdBy: user?.email ?? 'admin',
      };

      if (editingId) {
        await updateDoc(
          doc(db, 'announcements', editingId),
          payload as Record<string, unknown>
        );
      } else {
        const newId = `announcement-${crypto.randomUUID()}`;
        await setDoc(doc(db, 'announcements', newId), {
          id: newId,
          ...payload,
        });
      }
      closeForm();
    } catch (err) {
      console.error('[AnnouncementsManager] Save error:', err);
      addToast('Failed to save announcement. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'announcements', id));
      setConfirmDeleteId(null);
    } catch (err) {
      console.error('[AnnouncementsManager] Delete error:', err);
      addToast('Failed to delete announcement.', 'error');
    }
  };

  const handleToggleActive = async (a: Announcement) => {
    const newActive = !a.isActive;
    try {
      await updateDoc(doc(db, 'announcements', a.id), {
        isActive: newActive,
        activatedAt: newActive ? Date.now() : a.activatedAt,
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.error('[AnnouncementsManager] Toggle error:', err);
    }
  };

  const getWidgetLabel = (type: WidgetType) => {
    const tool = TOOLS.find((t) => t.type === type);
    return tool?.label ?? type;
  };

  const getBuildingLabel = (id: string) => {
    const b = BUILDINGS.find((b) => b.id === id);
    return b?.name ?? id;
  };

  const viewingResponsesAnnouncement = viewingResponsesId
    ? announcements.find((a) => a.id === viewingResponsesId)
    : null;

  return (
    <div className="flex gap-6 h-full">
      {/* Left: Announcement list */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-slate-700">
            <Bell className="w-5 h-5" />
            <span className="font-semibold">
              {announcements.length} Announcement
              {announcements.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-brand-blue-primary text-white text-sm font-semibold rounded-lg hover:bg-brand-blue-dark transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Announcement
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <div className="animate-spin w-6 h-6 border-2 border-slate-300 border-t-brand-blue-primary rounded-full" />
          </div>
        )}

        {!loading && announcements.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
            <Bell className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium">No announcements yet</p>
            <p className="text-sm mt-1">
              Create one to broadcast widgets to all users.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {announcements.map((a) => {
            const allBuildings = a.targetBuildings.length === 0;
            return (
              <div
                key={a.id}
                className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-slate-800 truncate">
                        {a.name}
                      </h4>
                      <StatusBadge isActive={a.isActive} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Radio className="w-3 h-3" />
                        {getWidgetLabel(a.widgetType)} widget
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {a.activationType === 'manual'
                          ? 'Manual activation'
                          : `Activates at ${a.scheduledActivationTime}`}
                      </span>
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {allBuildings
                          ? 'All buildings'
                          : a.targetBuildings.map(getBuildingLabel).join(', ')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Poll results button */}
                    {a.widgetType === 'poll' && (
                      <button
                        onClick={() =>
                          setViewingResponsesId(
                            viewingResponsesId === a.id ? null : a.id
                          )
                        }
                        title="View poll results"
                        className={`p-2 rounded-lg transition-colors ${
                          viewingResponsesId === a.id
                            ? 'text-indigo-700 bg-indigo-100'
                            : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'
                        }`}
                      >
                        <BarChart2 className="w-4 h-4" />
                      </button>
                    )}
                    {/* Activate / Deactivate */}
                    <button
                      onClick={() => void handleToggleActive(a)}
                      title={
                        a.isActive
                          ? 'Deactivate announcement'
                          : 'Activate announcement'
                      }
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        a.isActive
                          ? 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-200'
                      }`}
                    >
                      {a.isActive ? (
                        <>
                          <Square className="w-3 h-3" />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3" />
                          Activate
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => openEdit(a)}
                      title="Edit announcement"
                      className="p-2 text-slate-500 hover:text-brand-blue-primary hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {confirmDeleteId === a.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => void handleDelete(a.id)}
                          className="px-2 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(a.id)}
                        title="Delete announcement"
                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Create / Edit form */}
      {isCreating && (
        <div className="w-[420px] shrink-0 bg-white border border-slate-200 rounded-2xl shadow-lg overflow-y-auto max-h-[calc(100vh-240px)]">
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white border-b border-slate-200">
            <h3 className="font-bold text-slate-800 text-base">
              {editingId ? 'Edit Announcement' : 'New Announcement'}
            </h3>
            <button
              onClick={closeForm}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Announcement Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
                placeholder="e.g. Morning Announcement, Fire Drill Notice…"
              />
            </div>

            {/* Widget Type */}
            <FormSection title="Widget" icon={<Radio className="w-4 h-4" />}>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Widget Type
                </label>
                <select
                  value={form.widgetType}
                  onChange={(e) =>
                    handleWidgetTypeChange(e.target.value as WidgetType)
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
                >
                  {ANNOUNCEMENT_WIDGET_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {getWidgetLabel(type)}
                    </option>
                  ))}
                </select>
              </div>
              {renderConfigEditor(form, setForm)}
            </FormSection>

            {/* Size & Display */}
            <FormSection
              title="Size & Display"
              icon={<Clock className="w-4 h-4" />}
            >
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.maximized}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, maximized: e.target.checked }))
                    }
                    className="w-4 h-4 accent-brand-blue-primary"
                  />
                  <span className="text-sm font-medium text-slate-700">
                    Maximize (full screen)
                  </span>
                </label>
              </div>
              {!form.maximized && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Width (px)
                    </label>
                    <input
                      type="number"
                      min={200}
                      max={1920}
                      step={10}
                      value={form.widgetSize.w}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10);
                        if (!Number.isFinite(parsed)) return;
                        setForm((f) => ({
                          ...f,
                          widgetSize: {
                            ...f.widgetSize,
                            w: Math.min(1920, Math.max(200, parsed)),
                          },
                        }));
                      }}
                      className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Height (px)
                    </label>
                    <input
                      type="number"
                      min={100}
                      max={1080}
                      step={10}
                      value={form.widgetSize.h}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10);
                        if (!Number.isFinite(parsed)) return;
                        setForm((f) => ({
                          ...f,
                          widgetSize: {
                            ...f.widgetSize,
                            h: Math.min(1080, Math.max(100, parsed)),
                          },
                        }));
                      }}
                      className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
                    />
                  </div>
                </div>
              )}
              {/* Live preview */}
              {!form.maximized && (
                <AnnouncementPreview
                  widgetType={form.widgetType}
                  widgetConfig={form.widgetConfig}
                  widgetSize={form.widgetSize}
                />
              )}
            </FormSection>

            {/* Activation */}
            <FormSection title="Activation" icon={<Play className="w-4 h-4" />}>
              <div className="space-y-2">
                {ACTIVATION_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-start gap-3 cursor-pointer p-2 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <input
                      type="radio"
                      name="activationType"
                      value={opt.value}
                      checked={form.activationType === opt.value}
                      onChange={() =>
                        setForm((f) => ({ ...f, activationType: opt.value }))
                      }
                      className="mt-0.5 w-4 h-4 accent-brand-blue-primary"
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-700">
                        {opt.label}
                      </div>
                      <div className="text-xs text-slate-500">
                        {opt.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              {form.activationType === 'scheduled' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Activation Time
                  </label>
                  <input
                    type="time"
                    value={form.scheduledActivationTime}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        scheduledActivationTime: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
                  />
                </div>
              )}
            </FormSection>

            {/* Dismissal */}
            <FormSection title="Dismissal" icon={<X className="w-4 h-4" />}>
              <div className="space-y-2">
                {DISMISSAL_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-start gap-3 cursor-pointer p-2 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <input
                      type="radio"
                      name="dismissalType"
                      value={opt.value}
                      checked={form.dismissalType === opt.value}
                      onChange={() =>
                        setForm((f) => ({ ...f, dismissalType: opt.value }))
                      }
                      className="mt-0.5 w-4 h-4 accent-brand-blue-primary"
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-700">
                        {opt.label}
                      </div>
                      <div className="text-xs text-slate-500">
                        {opt.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              {form.dismissalType === 'scheduled' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dismissal Time
                  </label>
                  <input
                    type="time"
                    value={form.scheduledDismissalTime}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        scheduledDismissalTime: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
                  />
                </div>
              )}
              {form.dismissalType === 'duration' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Duration
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      max={
                        form.dismissalDurationUnit === 'minutes' ? 1440 : 86400
                      }
                      value={form.dismissalDurationSeconds}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10);
                        if (!Number.isFinite(parsed) || parsed < 1) return;
                        setForm((f) => ({
                          ...f,
                          dismissalDurationSeconds: parsed,
                        }));
                      }}
                      className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
                    />
                    <select
                      value={form.dismissalDurationUnit}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          dismissalDurationUnit: e.target.value as
                            | 'seconds'
                            | 'minutes',
                        }))
                      }
                      className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
                    >
                      <option value="seconds">seconds</option>
                      <option value="minutes">minutes</option>
                    </select>
                  </div>
                </div>
              )}
            </FormSection>

            {/* Target Buildings */}
            <FormSection
              title="Target Buildings"
              icon={<Building2 className="w-4 h-4" />}
            >
              <p className="text-xs text-slate-500 -mt-1">
                Select which buildings receive this announcement. Leave all
                unchecked to broadcast to everyone.
              </p>
              <div className="space-y-2">
                {BUILDINGS.map((b) => (
                  <label
                    key={b.id}
                    className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={form.targetBuildings.includes(b.id)}
                      onChange={() => toggleBuilding(b.id)}
                      className="w-4 h-4 accent-brand-blue-primary"
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-700">
                        {b.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {b.gradeLabel}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              {form.targetBuildings.length === 0 && (
                <div className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  No buildings selected — this announcement will be sent to all
                  users.
                </div>
              )}
            </FormSection>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 flex justify-end gap-3 px-5 py-4 bg-white border-t border-slate-200">
            <button
              onClick={closeForm}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-brand-blue-primary hover:bg-brand-blue-dark rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {editingId ? 'Save Changes' : 'Create Announcement'}
            </button>
          </div>
        </div>
      )}

      {/* Poll results panel */}
      {viewingResponsesAnnouncement &&
        viewingResponsesAnnouncement.widgetType === 'poll' && (
          <PollResponsesPanel
            announcement={viewingResponsesAnnouncement}
            onClose={() => setViewingResponsesId(null)}
          />
        )}
    </div>
  );
};
