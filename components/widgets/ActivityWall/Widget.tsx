import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Copy, MessageSquare, QrCode } from 'lucide-react';
import {
  WidgetData,
  ActivityWallArchiveStatus,
  ActivityWallConfig,
  ActivityWallActivity,
  ActivityWallSubmission,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { db, storage } from '@/config/firebase';
import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { deleteObject, getBlob, ref as storageRef } from 'firebase/storage';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';

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

const isSafeHttpUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const getArchiveStatus = (
  submission: Pick<
    ActivityWallSubmission,
    'archiveStatus' | 'storagePath' | 'driveFileId'
  >
): ActivityWallArchiveStatus | null => {
  if (submission.archiveStatus) return submission.archiveStatus;
  if (submission.storagePath) return 'firebase';
  if (submission.driveFileId) return 'archived';
  return null;
};

const preloadImage = async (url: string): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Drive image failed to load'));
    img.src = url;
  });
};

const getFileExtension = (mimeType: string): string => {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
};

const buildArchiveError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 180);
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

interface LiveSubmission {
  id: string;
  content: string;
  submittedAt: number;
  status?: 'approved' | 'pending';
  participantLabel?: string;
  storagePath?: string;
  archiveStatus?: ActivityWallArchiveStatus;
  driveFileId?: string;
  archiveError?: string;
  archivedAt?: number;
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
  const { addWidget, addToast } = useDashboard();
  const { user } = useAuth();
  const { driveService, isConnected: isDriveConnected } = useGoogleDrive();
  const config = widget.config as ActivityWallConfig;
  const activities = config.activities ?? [];
  const activeActivity =
    activities.find((activity) => activity.id === config.activeActivityId) ??
    null;
  const [firestoreState, setFirestoreState] = useState<{
    sessionId: string | null;
    submissions: LiveSubmission[];
  }>({
    sessionId: null,
    submissions: [],
  });
  const syncingSubmissionIdsRef = useRef<Set<string>>(new Set());
  const isArchivingRef = useRef(false);
  const activeSessionId =
    activeActivity && user ? `${user.uid}_${activeActivity.id}` : null;

  useEffect(() => {
    if (!activeActivity || !user || !activeSessionId) return;

    void setDoc(
      doc(db, 'activity_wall_sessions', activeSessionId),
      {
        id: activeSessionId,
        activityId: activeActivity.id,
        teacherUid: user.uid,
        title: activeActivity.title,
        prompt: activeActivity.prompt,
        mode: activeActivity.mode,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  }, [activeActivity, activeSessionId, user]);

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
            status: data.status as 'approved' | 'pending' | undefined,
            participantLabel: data.participantLabel as string | undefined,
            storagePath: data.storagePath as string | undefined,
            archiveStatus: data.archiveStatus as
              | ActivityWallArchiveStatus
              | undefined,
            driveFileId: data.driveFileId as string | undefined,
            archiveError: data.archiveError as string | undefined,
            archivedAt: data.archivedAt as number | undefined,
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

  const archivePhotoSubmission = useCallback(
    async (submission: LiveSubmission) => {
      if (!driveService || !activeActivity || !activeSessionId) return;

      const submissionRef = doc(
        db,
        'activity_wall_sessions',
        activeSessionId,
        'submissions',
        submission.id
      );
      syncingSubmissionIdsRef.current.add(submission.id);
      isArchivingRef.current = true;

      try {
        if (!submission.storagePath) {
          throw new Error('Missing Firebase storage path for photo submission');
        }

        await updateDoc(submissionRef, {
          status: submission.status ?? 'approved',
          archiveStatus: 'syncing',
          archiveError: deleteField(),
        });

        const blob = await getBlob(storageRef(storage, submission.storagePath));

        const driveFile = await driveService.uploadFile(
          blob,
          `${submission.id}.${getFileExtension(blob.type)}`,
          `Activity Wall/${activeActivity.id}`
        );
        await driveService.makePublic(driveFile.id, undefined);

        const driveUrl = `https://lh3.googleusercontent.com/d/${driveFile.id}`;
        await preloadImage(driveUrl);

        await updateDoc(submissionRef, {
          content: driveUrl,
          status: submission.status ?? 'approved',
          archiveStatus: 'archived',
          driveFileId: driveFile.id,
          archivedAt: Date.now(),
          storagePath: deleteField(),
          archiveError: deleteField(),
        });

        try {
          await deleteObject(storageRef(storage, submission.storagePath));
        } catch (cleanupError) {
          console.warn(
            '[ActivityWall] Archived photo but failed to delete Firebase copy:',
            cleanupError
          );
        }
      } catch (error) {
        console.error('[ActivityWall] Photo archive failed:', error);
        try {
          await updateDoc(submissionRef, {
            status: submission.status ?? 'approved',
            archiveStatus: 'failed',
            archiveError: buildArchiveError(error),
          });
        } catch (updateError) {
          console.error(
            '[ActivityWall] Failed to persist archive error state:',
            updateError
          );
        }
      } finally {
        syncingSubmissionIdsRef.current.delete(submission.id);
        isArchivingRef.current = false;
      }
    },
    [activeActivity, activeSessionId, driveService]
  );

  useEffect(() => {
    if (
      !activeActivity ||
      activeActivity.mode !== 'photo' ||
      !activeSessionId ||
      !driveService ||
      isArchivingRef.current
    ) {
      return;
    }

    const nextSubmission = firestoreRaw.find((submission) => {
      const status = getArchiveStatus(submission);
      return (
        submission.storagePath &&
        status === 'firebase' &&
        !syncingSubmissionIdsRef.current.has(submission.id)
      );
    });

    if (nextSubmission) {
      void archivePhotoSubmission(nextSubmission);
    }
  }, [
    activeActivity,
    activeSessionId,
    archivePhotoSubmission,
    driveService,
    firestoreRaw,
  ]);

  const retryFailedArchives = useCallback(async () => {
    if (!driveService || isArchivingRef.current) return;

    const failedSubmissions = firestoreRaw.filter(
      (submission) =>
        submission.storagePath &&
        getArchiveStatus(submission) === 'failed' &&
        !syncingSubmissionIdsRef.current.has(submission.id)
    );

    for (const submission of failedSubmissions) {
      await archivePhotoSubmission(submission);
    }
  }, [archivePhotoSubmission, driveService, firestoreRaw]);

  const allSubmissions = useMemo(() => {
    const demoSubs = activeActivity?.submissions ?? [];
    const combined = [...demoSubs];
    const existingIds = new Set(demoSubs.map((s) => s.id));
    for (const fs of firestoreRaw) {
      if (!existingIds.has(fs.id)) {
        combined.push({
          ...fs,
          status: fs.status ?? 'approved',
        });
      }
    }
    return combined;
  }, [activeActivity?.submissions, firestoreRaw]);

  const moderationCounts = useMemo(() => {
    // ⚡ Bolt Optimization: Use reduce instead of filter().length to avoid creating intermediate arrays on each render
    return allSubmissions.reduce(
      (acc, s) => {
        if (s.status === 'approved')
          return { ...acc, approved: acc.approved + 1 };
        if (s.status === 'pending') return { ...acc, pending: acc.pending + 1 };
        return acc;
      },
      { approved: 0, pending: 0 }
    );
  }, [allSubmissions]);

  const photoSyncCounts = useMemo(() => {
    let archived = 0;
    let syncing = 0;
    let queued = 0;
    let failed = 0;

    for (const submission of firestoreRaw) {
      const status = getArchiveStatus(submission);
      if (!status) continue;

      if (status === 'archived') archived += 1;
      else if (status === 'syncing') syncing += 1;
      else if (status === 'failed') failed += 1;
      else queued += 1;
    }

    return {
      archived,
      syncing,
      queued,
      failed,
      total: archived + syncing + queued + failed,
    };
  }, [firestoreRaw]);

  const syncBanner = useMemo(() => {
    if (!activeActivity || activeActivity.mode !== 'photo') return null;

    if (!isDriveConnected) {
      if (photoSyncCounts.queued + photoSyncCounts.failed > 0) {
        return {
          className: 'bg-amber-50 border-amber-200 text-amber-800',
          text: `${photoSyncCounts.queued + photoSyncCounts.failed} photo${photoSyncCounts.queued + photoSyncCounts.failed === 1 ? '' : 's'} waiting in Firebase until Drive reconnects.`,
        };
      }
      return {
        className: 'bg-slate-100 border-slate-200 text-slate-700',
        text: 'Drive disconnected. New photos will stay in Firebase until you reconnect.',
      };
    }

    if (photoSyncCounts.syncing > 0) {
      return {
        className: 'bg-sky-50 border-sky-200 text-sky-800',
        text: `Drive connected. Syncing ${photoSyncCounts.syncing} photo${photoSyncCounts.syncing === 1 ? '' : 's'} in the background.`,
      };
    }

    if (photoSyncCounts.failed > 0) {
      return {
        className: 'bg-amber-50 border-amber-200 text-amber-800',
        text: `${photoSyncCounts.failed} photo${photoSyncCounts.failed === 1 ? '' : 's'} need another Drive sync attempt.`,
      };
    }

    if (photoSyncCounts.archived > 0) {
      return {
        className: 'bg-emerald-50 border-emerald-200 text-emerald-800',
        text: 'Drive connected. All visible photos are archived to Drive.',
      };
    }

    return {
      className: 'bg-slate-100 border-slate-200 text-slate-700',
      text: 'Drive connected. New photos will archive automatically after they appear.',
    };
  }, [activeActivity, isDriveConnected, photoSyncCounts]);

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
              className="shrink-0 flex items-center"
              style={{ gap: 'min(5px, 1.3cqmin)' }}
            >
              {moderationCounts.pending > 0 && (
                <div
                  className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-bold"
                  style={{ fontSize: 'min(10px, 3.4cqmin)' }}
                >
                  {moderationCounts.pending} pending
                </div>
              )}
              <div
                className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-bold"
                style={{ fontSize: 'min(10px, 3.4cqmin)' }}
              >
                {activeActivity.mode === 'text' ? 'Text' : 'Photo'}
              </div>
            </div>
          </div>

          {syncBanner && (
            <div
              className={`rounded-xl border px-3 py-2 font-semibold ${syncBanner.className}`}
              style={{ fontSize: 'min(10px, 3.4cqmin)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span>{syncBanner.text}</span>
                {isDriveConnected && photoSyncCounts.failed > 0 && (
                  <button
                    type="button"
                    onClick={() => void retryFailedArchives()}
                    className="shrink-0 rounded-full bg-white/80 px-2 py-1 font-black text-amber-800"
                    style={{ fontSize: 'min(9px, 3cqmin)' }}
                  >
                    Retry failed syncs
                  </button>
                )}
              </div>
            </div>
          )}

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
            className="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-200 bg-slate-50"
            style={{ padding: 'min(8px, 2cqmin)' }}
          >
            {visibleSubmissions.length === 0 ? (
              <div
                className="h-full flex flex-col items-center justify-center text-slate-500 text-center"
                style={{ gap: 'min(6px, 1.5cqmin)' }}
              >
                <MessageSquare
                  style={{
                    width: 'min(24px, 7cqmin)',
                    height: 'min(24px, 7cqmin)',
                  }}
                  className="opacity-40"
                />
                <span style={{ fontSize: 'min(11px, 3.8cqmin)' }}>
                  Responses will appear here after participants submit.
                </span>
              </div>
            ) : activeActivity.mode === 'text' ? (
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
              <div
                className="grid grid-cols-2"
                style={{ gap: 'min(6px, 1.8cqmin)' }}
              >
                {visibleSubmissions.map((submission) => {
                  const archiveStatus = getArchiveStatus(submission);
                  return (
                    <div
                      key={submission.id}
                      className="rounded-lg bg-white border border-slate-200 overflow-hidden"
                    >
                      {isSafeHttpUrl(submission.content) ? (
                        <a
                          href={submission.content}
                          target="_blank"
                          rel="noreferrer"
                          className="block"
                        >
                          <div className="relative">
                            <img
                              src={submission.content}
                              alt={submission.participantLabel ?? 'Photo'}
                              className="w-full object-cover"
                              style={{ aspectRatio: '4/3' }}
                            />
                            {archiveStatus && (
                              <span
                                className={`absolute right-2 top-2 rounded-full px-2 py-1 font-bold ${
                                  archiveStatus === 'archived'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : archiveStatus === 'syncing'
                                      ? 'bg-sky-100 text-sky-700'
                                      : archiveStatus === 'failed'
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-slate-900/75 text-white'
                                }`}
                                style={{ fontSize: 'min(8px, 2.7cqmin)' }}
                              >
                                {archiveStatus === 'archived'
                                  ? 'Drive'
                                  : archiveStatus === 'syncing'
                                    ? 'Syncing'
                                    : archiveStatus === 'failed'
                                      ? 'Retry'
                                      : 'Firebase'}
                              </span>
                            )}
                          </div>
                          <div
                            className="text-slate-600"
                            style={{
                              padding: 'min(4px, 1cqmin) min(6px, 1.5cqmin)',
                            }}
                          >
                            {submission.participantLabel && (
                              <p
                                className="truncate"
                                style={{ fontSize: 'min(9px, 3cqmin)' }}
                              >
                                {submission.participantLabel}
                              </p>
                            )}
                            {archiveStatus === 'failed' &&
                              submission.archiveError && (
                                <p
                                  className="text-amber-700 line-clamp-2"
                                  style={{ fontSize: 'min(8px, 2.7cqmin)' }}
                                >
                                  {submission.archiveError}
                                </p>
                              )}
                          </div>
                        </a>
                      ) : (
                        <div
                          className="flex items-center justify-center text-red-400"
                          style={{
                            aspectRatio: '4/3',
                            fontSize: 'min(9px, 3cqmin)',
                          }}
                        >
                          Invalid photo
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      }
    />
  );
};
