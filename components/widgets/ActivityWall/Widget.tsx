import React, { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  ImagePlus,
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
import { useAuth } from '@/context/useAuth';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { db } from '@/config/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

const encodeActivityData = (
  activity: ActivityWallActivity,
  teacherUid: string
): string => {
  const payload = JSON.stringify({
    id: activity.id,
    title: activity.title,
    prompt: activity.prompt,
    mode: activity.mode,
    identificationMode: activity.identificationMode,
    teacherUid,
  });
  const bytes = new TextEncoder().encode(payload);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return encodeURIComponent(btoa(binary));
};

const buildPublicActivityLink = (
  activity: ActivityWallActivity,
  teacherUid: string
): string => {
  const encoded = encodeActivityData(activity, teacherUid);
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

/** Stable color from word string so it doesn't flicker on re-render. */
const wordColor = (word: string): string => {
  let hash = 0;
  for (let i = 0; i < word.length; i++) {
    hash = word.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 65%, 38%)`;
};

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'it',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'and',
  'or',
  'but',
  'not',
  'with',
  'be',
  'was',
  'are',
  'were',
  'by',
  'from',
  'as',
  'i',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'she',
  'they',
  'their',
  'its',
  'this',
  'that',
  'do',
  'did',
  'so',
  'if',
  'up',
  'out',
  'no',
  'can',
  'has',
  'have',
  'had',
  'will',
  'just',
  'me',
  'am',
  'been',
]);

interface WordWeight {
  word: string;
  count: number;
  weight: number;
}

const buildWordCloud = (
  submissions: ActivityWallSubmission[]
): WordWeight[] => {
  const counts: Record<string, number> = {};
  for (const sub of submissions) {
    const words = sub.content.toLowerCase().match(/\b[a-z']{2,}\b/g) ?? [];
    for (const word of words) {
      if (!STOP_WORDS.has(word)) {
        counts[word] = (counts[word] ?? 0) + 1;
      }
    }
  }
  const entries = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60);
  const maxCount = entries[0]?.[1] ?? 1;
  return entries.map(([word, count]) => ({
    word,
    count,
    weight: count / maxCount,
  }));
};

export const ActivityWallWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addWidget, addToast } = useDashboard();
  const { user } = useAuth();
  const config = widget.config as ActivityWallConfig;
  const activities = config.activities ?? [];
  const activeActivity =
    activities.find((activity) => activity.id === config.activeActivityId) ??
    null;
  const [draftResponse, setDraftResponse] = useState('');
  // Raw Firestore submissions — status is applied during render based on moderationEnabled.
  const [firestoreState, setFirestoreState] = useState<{
    sessionId: string | null;
    submissions: {
      id: string;
      content: string;
      submittedAt: number;
      participantLabel?: string;
    }[];
  }>({
    sessionId: null,
    submissions: [],
  });
  const activeSessionId =
    activeActivity && user ? `${user.uid}_${activeActivity.id}` : null;

  // Subscribe to real-time student submissions from Firestore.
  useEffect(() => {
    if (!activeActivity || !user) return;

    const sessionId = `${user.uid}_${activeActivity.id}`;
    const submissionsRef = collection(
      db,
      'activity_wall_sessions',
      sessionId,
      'submissions'
    );

    const unsubscribe = onSnapshot(submissionsRef, (snap) => {
      setFirestoreState({
        sessionId,
        submissions: snap.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: data.id as string,
            content: data.content as string,
            submittedAt: data.submittedAt as number,
            participantLabel: data.participantLabel as string | undefined,
          };
        }),
      });
    });

    return unsubscribe;
  }, [activeActivity?.id, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const firestoreRaw = useMemo(
    () =>
      firestoreState.sessionId === activeSessionId
        ? firestoreState.submissions
        : [],
    [activeSessionId, firestoreState]
  );

  const participantUrl = useMemo(() => {
    if (!activeActivity || !user) return '';
    return buildPublicActivityLink(activeActivity, user.uid);
  }, [activeActivity, user]);

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

  // Combine demo submissions (stored in config) with live Firestore submissions.
  const allSubmissions = useMemo(() => {
    const demoSubs = activeActivity?.submissions ?? [];
    const combined = [...demoSubs];
    const existingIds = new Set(demoSubs.map((s) => s.id));
    const modEnabled = activeActivity?.moderationEnabled ?? false;
    for (const fs of firestoreRaw) {
      if (!existingIds.has(fs.id)) {
        combined.push({
          ...fs,
          status: modEnabled ? 'pending' : 'approved',
        });
      }
    }
    return combined;
  }, [
    activeActivity?.submissions,
    activeActivity?.moderationEnabled,
    firestoreRaw,
  ]);

  const moderationCounts = useMemo(() => {
    // ⚡ Bolt Optimization: Use reduce instead of filter().length to avoid creating intermediate arrays on each render
    return allSubmissions.reduce(
      (acc, s) => {
        if (s.status === 'approved') acc.approved++;
        else if (s.status === 'pending') acc.pending++;
        return acc;
      },
      { approved: 0, pending: 0 }
    );
  }, [allSubmissions]);

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

  const visibleSubmissions = allSubmissions.filter(
    (s) => s.status === 'approved'
  );

  const wordCloudData =
    activeActivity.mode === 'text' ? buildWordCloud(visibleSubmissions) : [];

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
            ) : activeActivity.mode === 'text' ? (
              /* Word cloud: words sized by frequency */
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 p-1">
                {wordCloudData.map(({ word, weight }) => (
                  <span
                    key={word}
                    className="font-bold leading-tight"
                    style={{
                      fontSize: `min(${Math.round(11 + weight * 22)}px, ${(3.5 + weight * 8).toFixed(1)}cqmin)`,
                      color: wordColor(word),
                      opacity: 0.45 + weight * 0.55,
                    }}
                  >
                    {word}
                  </span>
                ))}
              </div>
            ) : (
              /* Photo mode: card grid */
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
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      }
    />
  );
};
