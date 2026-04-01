import React, { useMemo, useState } from 'react';
import {
  Copy,
  ImagePlus,
  Link as LinkIcon,
  MessageSquare,
  Play,
  QrCode,
  SquareUser,
} from 'lucide-react';
import {
  WidgetData,
  ActivityWallConfig,
  ActivityWallActivity,
  ActivityWallSubmission,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';

const encodeActivityData = (activity: ActivityWallActivity): string => {
  const payload = JSON.stringify({
    id: activity.id,
    title: activity.title,
    prompt: activity.prompt,
    mode: activity.mode,
    identificationMode: activity.identificationMode,
  });
  const bytes = new TextEncoder().encode(payload);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return encodeURIComponent(btoa(binary));
};

const buildPublicActivityLink = (activity: ActivityWallActivity): string => {
  const encoded = encodeActivityData(activity);

  return `${window.location.origin}/activity-wall/${activity.id}?data=${encoded}`;
};

const MAX_STORED_SUBMISSIONS = 200;

const isSafeHttpUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const QRPreview: React.FC<{ url: string }> = ({ url }) => {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}`;
  return (
    <img
      src={qrUrl}
      alt="Activity QR code"
      className="rounded-xl border border-slate-200 bg-white"
      style={{
        width: 'min(140px, 42cqmin)',
        height: 'min(140px, 42cqmin)',
      }}
    />
  );
};

export const ActivityWallWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addWidget, addToast } = useDashboard();
  const config = widget.config as ActivityWallConfig;
  const activities = config.activities ?? [];
  const activeActivity =
    activities.find((activity) => activity.id === config.activeActivityId) ??
    null;
  const [draftResponse, setDraftResponse] = useState('');

  const participantUrl = useMemo(() => {
    if (!activeActivity) return '';
    return buildPublicActivityLink(activeActivity);
  }, [activeActivity]);

  const updateConfig = (updates: Partial<ActivityWallConfig>) => {
    updateWidget(widget.id, { config: { ...config, ...updates } });
  };

  const appendResponse = () => {
    if (!activeActivity || !draftResponse.trim()) return;
    const next: ActivityWallActivity[] = activities.map((activity) => {
      if (activity.id !== activeActivity.id) return activity;

      const submission: ActivityWallSubmission = {
        id: crypto.randomUUID(),
        content: draftResponse.trim(),
        submittedAt: Date.now(),
        status: activity.moderationEnabled ? 'pending' : 'approved',
        participantLabel: 'Demo Student',
      };

      return {
        ...activity,
        submissions: [...(activity.submissions ?? []), submission].slice(
          -MAX_STORED_SUBMISSIONS
        ),
      };
    });

    updateConfig({ activities: next });
    setDraftResponse('');
  };

  const moderationCounts = useMemo(() => {
    if (!activeActivity) return { approved: 0, pending: 0 };
    const approved = (activeActivity.submissions ?? []).filter(
      (s) => s.status === 'approved'
    ).length;
    const pending = (activeActivity.submissions ?? []).filter(
      (s) => s.status === 'pending'
    ).length;
    return { approved, pending };
  }, [activeActivity]);

  const spawnQrWidget = () => {
    if (!participantUrl) return;
    addWidget('qr', {
      w: 200,
      h: 250,
      config: {
        url: participantUrl,
      },
    });
    addToast(
      'QR sticker added to board. Drag it wherever you want.',
      'success'
    );
  };

  const copyLink = async () => {
    if (!participantUrl) return;
    try {
      await navigator.clipboard.writeText(participantUrl);
      addToast('Participant link copied!', 'success');
    } catch {
      addToast('Could not copy link. Please copy manually.', 'error');
    }
  };

  if (!activeActivity) {
    return (
      <WidgetLayout
        content={
          <div
            className="h-full w-full flex flex-col items-center justify-center text-center bg-slate-50"
            style={{ gap: 'min(10px, 2.5cqmin)', padding: 'min(12px, 3cqmin)' }}
          >
            <MessageSquare
              style={{
                width: 'min(50px, 18cqmin)',
                height: 'min(50px, 18cqmin)',
              }}
              className="text-brand-blue-primary"
            />
            <p
              className="font-black text-slate-800"
              style={{ fontSize: 'min(18px, 7cqmin)' }}
            >
              Create an activity
            </p>
            <p
              className="text-slate-500 font-medium"
              style={{ fontSize: 'min(12px, 4.5cqmin)' }}
            >
              Flip this widget to set up your first text or photo wall.
            </p>
          </div>
        }
      />
    );
  }

  const visibleSubmissions = (activeActivity.submissions ?? []).filter(
    (s) => s.status === 'approved'
  );

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className="h-full w-full bg-white flex flex-col"
          style={{ gap: 'min(8px, 2cqmin)', padding: 'min(10px, 2.4cqmin)' }}
        >
          <div
            className="flex items-start justify-between"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            <div className="min-w-0">
              <p
                className="font-black text-slate-900 truncate"
                style={{ fontSize: 'min(16px, 6cqmin)' }}
              >
                {activeActivity.title}
              </p>
              <p
                className="text-slate-600 line-clamp-2"
                style={{ fontSize: 'min(12px, 4.4cqmin)' }}
              >
                {activeActivity.prompt}
              </p>
            </div>
            <div
              className="shrink-0 px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-bold"
              style={{ fontSize: 'min(10px, 3.4cqmin)' }}
            >
              {activeActivity.mode === 'text' ? 'Text' : 'Photo'}
            </div>
          </div>

          <div
            className="grid grid-cols-2"
            style={{ gap: 'min(6px, 1.8cqmin)' }}
          >
            <button
              type="button"
              onClick={copyLink}
              className="rounded-xl bg-brand-blue-primary text-white font-bold flex items-center justify-center"
              style={{
                gap: 'min(6px, 1.8cqmin)',
                padding: 'min(8px, 2cqmin)',
                fontSize: 'min(11px, 3.8cqmin)',
              }}
            >
              <Copy
                style={{
                  width: 'min(14px, 4cqmin)',
                  height: 'min(14px, 4cqmin)',
                }}
              />
              Copy link
            </button>
            <button
              type="button"
              onClick={spawnQrWidget}
              className="rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center"
              style={{
                gap: 'min(6px, 1.8cqmin)',
                padding: 'min(8px, 2cqmin)',
                fontSize: 'min(11px, 3.8cqmin)',
              }}
            >
              <QrCode
                style={{
                  width: 'min(14px, 4cqmin)',
                  height: 'min(14px, 4cqmin)',
                }}
              />
              Pop-out QR
            </button>
          </div>

          <div
            className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200"
            style={{ padding: 'min(8px, 2cqmin)' }}
          >
            <div
              className="flex items-center text-slate-700"
              style={{
                gap: 'min(6px, 1.8cqmin)',
                fontSize: 'min(10px, 3.5cqmin)',
              }}
            >
              <SquareUser
                style={{
                  width: 'min(14px, 4cqmin)',
                  height: 'min(14px, 4cqmin)',
                }}
              />
              ID: {activeActivity.identificationMode}
            </div>
            <div
              className="font-semibold text-amber-700"
              style={{ fontSize: 'min(10px, 3.5cqmin)' }}
            >
              Pending: {moderationCounts.pending}
            </div>
          </div>

          <div
            className="rounded-xl border border-dashed border-slate-300"
            style={{ padding: 'min(8px, 2cqmin)' }}
          >
            <div
              className="flex items-center"
              style={{ gap: 'min(6px, 1.8cqmin)' }}
            >
              {activeActivity.mode === 'text' ? (
                <MessageSquare
                  style={{
                    width: 'min(14px, 4cqmin)',
                    height: 'min(14px, 4cqmin)',
                  }}
                  className="text-slate-500"
                />
              ) : (
                <ImagePlus
                  style={{
                    width: 'min(14px, 4cqmin)',
                    height: 'min(14px, 4cqmin)',
                  }}
                  className="text-slate-500"
                />
              )}
              <input
                value={draftResponse}
                onChange={(event) => setDraftResponse(event.target.value)}
                placeholder={
                  activeActivity.mode === 'text'
                    ? 'Add a demo text response...'
                    : 'Paste demo photo URL...'
                }
                className="flex-1 bg-transparent text-slate-700 focus:outline-none"
                style={{ fontSize: 'min(11px, 3.6cqmin)' }}
              />
              <button
                type="button"
                onClick={appendResponse}
                className="rounded-lg bg-slate-800 text-white"
                style={{ padding: 'min(6px, 1.7cqmin)' }}
                title="Add sample response"
              >
                <Play
                  style={{
                    width: 'min(12px, 3.5cqmin)',
                    height: 'min(12px, 3.5cqmin)',
                  }}
                />
              </button>
            </div>
          </div>

          <div
            className="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-200 bg-slate-50"
            style={{ padding: 'min(8px, 2cqmin)' }}
          >
            {visibleSubmissions.length === 0 ? (
              <div
                className="h-full flex items-center justify-center text-slate-500 text-center"
                style={{ fontSize: 'min(11px, 3.8cqmin)' }}
              >
                Responses will appear here after participants submit.
              </div>
            ) : (
              <div
                className="grid grid-cols-2"
                style={{ gap: 'min(6px, 1.8cqmin)' }}
              >
                {visibleSubmissions.map((submission) => (
                  <div
                    key={submission.id}
                    className="rounded-lg bg-white border border-slate-200"
                    style={{ padding: 'min(6px, 1.7cqmin)' }}
                  >
                    {activeActivity.mode === 'text' ? (
                      <p
                        className="text-slate-800 break-words"
                        style={{ fontSize: 'min(11px, 3.7cqmin)' }}
                      >
                        {submission.content}
                      </p>
                    ) : (
                      <>
                        {isSafeHttpUrl(submission.content) ? (
                          <a
                            href={submission.content}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand-blue-primary underline break-all"
                            style={{ fontSize: 'min(10px, 3.4cqmin)' }}
                          >
                            Open photo
                          </a>
                        ) : (
                          <p
                            className="text-red-600 break-words"
                            style={{ fontSize: 'min(10px, 3.4cqmin)' }}
                          >
                            Invalid photo URL
                          </p>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            className="flex items-center"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            <QRPreview url={participantUrl} />
            <div
              className="min-w-0 text-slate-500"
              style={{ fontSize: 'min(10px, 3.4cqmin)' }}
            >
              <p
                className="font-semibold text-slate-700 flex items-center"
                style={{ gap: 'min(4px, 1.2cqmin)' }}
              >
                <LinkIcon
                  style={{
                    width: 'min(12px, 3.6cqmin)',
                    height: 'min(12px, 3.6cqmin)',
                  }}
                />
                Public activity link
              </p>
              <p className="break-all">{participantUrl}</p>
            </div>
          </div>
        </div>
      }
    />
  );
};
