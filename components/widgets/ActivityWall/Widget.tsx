import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Copy,
  Expand,
  LibraryBig,
  MessageSquare,
  Pencil,
  Plus,
  QrCode,
  Trash2,
} from 'lucide-react';
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
import { db, functions, storage } from '@/config/firebase';
import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
} from 'firebase/storage';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { Modal } from '@/components/common/Modal';

const encodeActivityData = (
  activity: ActivityWallActivity,
  teacherUid: string
): string => {
  const payload = JSON.stringify({
    id: activity.id,
    title: activity.title,
    prompt: activity.prompt,
    mode: activity.mode,
    moderationEnabled: activity.moderationEnabled,
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

const DRIVE_IMAGE_PROBE_TIMEOUT_MS = 5000;
const STALE_ARCHIVE_SYNC_TIMEOUT_MS = 30000;
const isLikelyVideoUrl = (url: string): boolean =>
  /\.(mp4|webm|ogg|mov)$/i.test(url);

const probeImageAvailability = async (url: string): Promise<boolean> => {
  return await new Promise<boolean>((resolve) => {
    const img = new Image();
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      img.onload = null;
      img.onerror = null;
    };
    const settle = (result: boolean) => {
      cleanup();
      resolve(result);
    };
    const timeoutId = window.setTimeout(
      () => settle(false),
      DRIVE_IMAGE_PROBE_TIMEOUT_MS
    );
    img.onload = () => settle(true);
    img.onerror = () => settle(false);
    img.src = url;
  });
};

const buildArchiveError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 180);
};

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
  archiveStartedAt?: number;
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

const buildBlankActivity = (): ActivityWallActivity => ({
  id: crypto.randomUUID(),
  title: '',
  prompt: '',
  mode: 'text',
  moderationEnabled: false,
  identificationMode: 'anonymous',
  submissions: [],
  startedAt: null,
});

export const ActivityWallWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addWidget, addToast } = useDashboard();
  const { user, googleAccessToken, refreshGoogleToken } = useAuth();
  const { isConnected: isDriveConnected } = useGoogleDrive();
  const config = widget.config as ActivityWallConfig;
  const activities = config.activities ?? [];
  const activeActivity =
    activities.find((activity) => activity.id === config.activeActivityId) ??
    null;

  const [editorDraft, setEditorDraft] = useState<ActivityWallActivity | null>(
    null
  );
  const [showLiveView, setShowLiveView] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<
    string | null
  >(null);
  const [fullscreenSubmission, setFullscreenSubmission] =
    useState<ActivityWallSubmission | null>(null);
  const [firebasePhotoUrls, setFirebasePhotoUrls] = useState<
    Record<string, string>
  >({});
  const [photoAspectRatios, setPhotoAspectRatios] = useState<
    Record<string, number>
  >({});
  const [submissionsGridNode, setSubmissionsGridNode] =
    useState<HTMLDivElement | null>(null);
  const [submissionsGridSize, setSubmissionsGridSize] = useState({
    width: 0,
    height: 0,
  });

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

  const handlePhotoLoad = useCallback(
    (submissionId: string, width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      const ratio = width / height;
      setPhotoAspectRatios((prev) => {
        if (prev[submissionId] === ratio) return prev;
        return { ...prev, [submissionId]: ratio };
      });
    },
    []
  );

  useEffect(() => {
    const node = submissionsGridNode;
    if (!node) return;

    const update = () => {
      setSubmissionsGridSize({
        width: node.clientWidth,
        height: node.clientHeight,
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [submissionsGridNode]);

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
            archiveStartedAt: data.archiveStartedAt as number | undefined,
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

  useEffect(() => {
    if (!activeSessionId) {
      setFirebasePhotoUrls({});
      return;
    }

    const activeStoragePaths = new Set(
      firestoreRaw.flatMap((submission) =>
        submission.storagePath ? [submission.storagePath] : []
      )
    );

    setFirebasePhotoUrls((previous) => {
      const nextEntries = Object.entries(previous).filter(([storagePath]) =>
        activeStoragePaths.has(storagePath)
      );
      if (nextEntries.length === Object.keys(previous).length) {
        return previous;
      }
      return Object.fromEntries(nextEntries);
    });

    const pendingStoragePaths = firestoreRaw
      .flatMap((submission) => {
        if (!submission.storagePath) return [];
        if (isSafeHttpUrl(submission.content)) return [];
        if (firebasePhotoUrls[submission.storagePath]) return [];
        return [submission.storagePath];
      })
      .filter(
        (storagePath, index, values) => values.indexOf(storagePath) === index
      );

    if (pendingStoragePaths.length === 0) return;

    let cancelled = false;

    void Promise.all(
      pendingStoragePaths.map(async (storagePath) => {
        try {
          const url = await getDownloadURL(storageRef(storage, storagePath));
          return [storagePath, url] as const;
        } catch (error) {
          console.error(
            '[ActivityWall] Failed to resolve Firebase photo preview URL:',
            error
          );
          return null;
        }
      })
    ).then((results) => {
      if (cancelled) return;

      setFirebasePhotoUrls((previous) => {
        const resolvedEntries = results.filter((entry) => entry !== null);
        if (resolvedEntries.length === 0) return previous;
        return {
          ...previous,
          ...Object.fromEntries(resolvedEntries),
        };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [activeSessionId, firebasePhotoUrls, firestoreRaw]);

  const participantUrl = useMemo(() => {
    if (!activeActivity || !user) return '';
    return buildPublicActivityLink(activeActivity, user.uid);
  }, [activeActivity, user]);

  const updateConfig = (updates: Partial<ActivityWallConfig>) => {
    updateWidget(widget.id, { config: { ...config, ...updates } });
  };

  const saveEditorDraft = () => {
    if (!editorDraft) return;
    const title = editorDraft.title.trim();
    const prompt = editorDraft.prompt.trim();
    if (!title || !prompt) return;

    const nextActivity: ActivityWallActivity = {
      ...editorDraft,
      title,
      prompt,
      startedAt: editorDraft.startedAt ?? Date.now(),
    };

    const exists = activities.some((a) => a.id === nextActivity.id);
    const nextActivities = exists
      ? activities.map((a) => (a.id === nextActivity.id ? nextActivity : a))
      : [...activities, nextActivity];

    updateConfig({
      activities: nextActivities,
      activeActivityId: nextActivity.id,
    });
    setEditorDraft(null);
    setShowLiveView(true);
    addToast(exists ? 'Activity updated.' : 'Activity created.', 'success');
  };

  const deleteActivity = (activityId: string) => {
    const nextActivities = activities.filter((a) => a.id !== activityId);
    updateConfig({
      activities: nextActivities,
      activeActivityId:
        config.activeActivityId === activityId
          ? (nextActivities[0]?.id ?? null)
          : config.activeActivityId,
    });
    if (editorDraft?.id === activityId) setEditorDraft(null);
    setShowLiveView(false);
    addToast('Activity removed.', 'info');
  };

  const archivePhotoSubmission = useCallback(
    async (submission: LiveSubmission) => {
      if (!activeActivity || !activeSessionId || !user) return;

      syncingSubmissionIdsRef.current.add(submission.id);
      isArchivingRef.current = true;

      try {
        const accessToken = googleAccessToken ?? (await refreshGoogleToken());
        if (!accessToken) {
          throw new Error(
            'Google Drive is not connected. Reconnect Drive and retry the photo sync.'
          );
        }

        const archivePhoto = httpsCallable<
          {
            accessToken: string;
            sessionId: string;
            submissionId: string;
            activityId: string;
            status: 'approved' | 'pending';
          },
          {
            archiveStatus: ActivityWallArchiveStatus;
            driveFileId: string;
            driveUrl: string;
          }
        >(functions, 'archiveActivityWallPhoto');

        const result = await archivePhoto({
          accessToken,
          sessionId: activeSessionId,
          submissionId: submission.id,
          activityId: activeActivity.id,
          status: submission.status ?? 'approved',
        });

        const driveImageReady = await probeImageAvailability(
          result.data.driveUrl
        );
        if (!driveImageReady) {
          console.warn(
            '[ActivityWall] Drive image did not become readable before timeout; completing archive anyway.'
          );
        }
      } catch (error) {
        console.error('[ActivityWall] Photo archive failed:', error);

        const submissionRef = doc(
          db,
          'activity_wall_sessions',
          activeSessionId,
          'submissions',
          submission.id
        );
        void updateDoc(submissionRef, {
          status: submission.status ?? 'approved',
          archiveStatus: 'failed',
          archiveStartedAt: deleteField(),
          archiveError: buildArchiveError(error),
        }).catch((updateError) => {
          console.error(
            '[ActivityWall] Failed to persist archive error state:',
            updateError
          );
        });
      } finally {
        syncingSubmissionIdsRef.current.delete(submission.id);
        isArchivingRef.current = false;
      }
    },
    [
      activeActivity,
      activeSessionId,
      googleAccessToken,
      refreshGoogleToken,
      user,
    ]
  );

  useEffect(() => {
    if (
      !activeActivity ||
      activeActivity.mode !== 'photo' ||
      !activeSessionId ||
      !isDriveConnected ||
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
    firestoreRaw,
    isDriveConnected,
  ]);

  useEffect(() => {
    if (
      !activeActivity ||
      activeActivity.mode !== 'photo' ||
      !activeSessionId ||
      !isDriveConnected ||
      isArchivingRef.current
    ) {
      return;
    }

    const staleSubmission = firestoreRaw.find((submission) => {
      if (submission.archiveStatus !== 'syncing') return false;
      if (syncingSubmissionIdsRef.current.has(submission.id)) return false;

      const startedAt = submission.archiveStartedAt ?? submission.submittedAt;
      return Date.now() - startedAt > STALE_ARCHIVE_SYNC_TIMEOUT_MS;
    });

    if (!staleSubmission) return;

    const submissionRef = doc(
      db,
      'activity_wall_sessions',
      activeSessionId,
      'submissions',
      staleSubmission.id
    );

    void updateDoc(submissionRef, {
      status: staleSubmission.status ?? 'approved',
      archiveStatus: 'failed',
      archiveStartedAt: deleteField(),
      archiveError:
        'Drive sync timed out before completion. Retry after checking Drive connection and Firebase Storage CORS.',
    }).catch((error) => {
      console.error(
        '[ActivityWall] Failed to mark stale photo sync as failed:',
        error
      );
    });
  }, [activeActivity, activeSessionId, firestoreRaw, isDriveConnected]);

  const retryFailedArchives = useCallback(async () => {
    if (!isDriveConnected) {
      addToast(
        'Reconnect Google Drive before retrying failed photo syncs.',
        'error'
      );
      return;
    }
    if (isArchivingRef.current) {
      addToast('Photo sync retry already in progress.', 'info');
      return;
    }

    const failedSubmissions = firestoreRaw.filter(
      (submission) =>
        submission.storagePath &&
        getArchiveStatus(submission) === 'failed' &&
        !syncingSubmissionIdsRef.current.has(submission.id)
    );

    if (failedSubmissions.length === 0) {
      addToast('No failed photo syncs were found to retry.', 'info');
      return;
    }

    addToast(
      `Retrying ${failedSubmissions.length} failed photo sync${failedSubmissions.length === 1 ? '' : 's'}...`,
      'info'
    );

    for (const submission of failedSubmissions) {
      await archivePhotoSubmission(submission);
    }
  }, [addToast, archivePhotoSubmission, firestoreRaw, isDriveConnected]);

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
        showUrl: false,
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

  const deleteSubmission = useCallback(
    async (submission: ActivityWallSubmission) => {
      if (!activeActivity) return;

      try {
        let removedFromFirestore = false;
        if (
          activeSessionId &&
          firestoreRaw.some((fs) => fs.id === submission.id)
        ) {
          await deleteDoc(
            doc(
              db,
              'activity_wall_sessions',
              activeSessionId,
              'submissions',
              submission.id
            )
          );
          removedFromFirestore = true;
        }
        if (submission.storagePath) {
          await deleteObject(storageRef(storage, submission.storagePath)).catch(
            (error) => {
              console.warn(
                '[ActivityWall] Storage cleanup failed for submission:',
                error
              );
            }
          );
        }

        const nextActivities = activities.map((activity) => {
          if (activity.id !== activeActivity.id) return activity;
          return {
            ...activity,
            submissions: (activity.submissions ?? []).filter(
              (item) => item.id !== submission.id
            ),
          };
        });
        updateConfig({ activities: nextActivities });

        setSelectedSubmissionId((prev) =>
          prev === submission.id ? null : prev
        );
        setFullscreenSubmission((prev) =>
          prev?.id === submission.id ? null : prev
        );
        addToast(
          removedFromFirestore
            ? 'Submission removed.'
            : 'Local submission removed.',
          'success'
        );
      } catch (error) {
        console.error('[ActivityWall] Failed to delete submission:', error);
        addToast('Failed to remove submission.', 'error');
      }
    },
    [
      activeActivity,
      activeSessionId,
      activities,
      addToast,
      firestoreRaw,
      updateConfig,
    ]
  );

  if (editorDraft) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <div className="h-full w-full bg-white flex flex-col overflow-hidden">
            <div
              className="flex items-center justify-between border-b border-slate-200"
              style={{ padding: 'min(10px, 2.8cqmin)' }}
            >
              <h2
                className="font-black uppercase tracking-wide text-slate-800"
                style={{ fontSize: 'min(12px, 3.8cqmin)' }}
              >
                {activities.some((a) => a.id === editorDraft.id)
                  ? 'Edit activity'
                  : 'Create activity'}
              </h2>
              <button
                type="button"
                onClick={() => setEditorDraft(null)}
                className="rounded-lg border border-slate-300 text-slate-700 font-semibold"
                style={{
                  padding: 'min(6px, 1.8cqmin) min(8px, 2.4cqmin)',
                  fontSize: 'min(10px, 3.2cqmin)',
                }}
              >
                Cancel
              </button>
            </div>

            <div
              className="flex-1 min-h-0 overflow-auto"
              style={{ padding: 'min(10px, 2.8cqmin)' }}
            >
              <div className="space-y-3">
                <label className="block">
                  <span
                    className="block font-black uppercase tracking-wider text-slate-600 mb-1"
                    style={{ fontSize: 'min(10px, 3.2cqmin)' }}
                  >
                    Activity title
                  </span>
                  <input
                    value={editorDraft.title}
                    onChange={(event) =>
                      setEditorDraft({
                        ...editorDraft,
                        title: event.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
                    style={{ fontSize: 'min(12px, 3.8cqmin)' }}
                    placeholder="Warm-up word cloud"
                  />
                </label>

                <label className="block">
                  <span
                    className="block font-black uppercase tracking-wider text-slate-600 mb-1"
                    style={{ fontSize: 'min(10px, 3.2cqmin)' }}
                  >
                    Prompt / directions
                  </span>
                  <textarea
                    value={editorDraft.prompt}
                    onChange={(event) =>
                      setEditorDraft({
                        ...editorDraft,
                        prompt: event.target.value,
                      })
                    }
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
                    style={{ fontSize: 'min(12px, 3.8cqmin)' }}
                    placeholder="How are you feeling about today's lesson?"
                  />
                </label>

                <div>
                  <p
                    className="block font-black uppercase tracking-wider text-slate-600 mb-1"
                    style={{ fontSize: 'min(10px, 3.2cqmin)' }}
                  >
                    Activity type
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['text', 'photo'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setEditorDraft({ ...editorDraft, mode })}
                        className={`rounded-xl border px-3 py-2 font-semibold ${
                          editorDraft.mode === mode
                            ? 'bg-brand-blue-primary border-brand-blue-primary text-white'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                        style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                      >
                        {mode === 'text'
                          ? 'Text (Word Cloud)'
                          : 'Photo (Padlet)'}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
                  <span
                    className="font-semibold text-slate-700"
                    style={{ fontSize: 'min(12px, 3.8cqmin)' }}
                  >
                    Require moderation
                  </span>
                  <input
                    type="checkbox"
                    checked={editorDraft.moderationEnabled}
                    onChange={(event) =>
                      setEditorDraft({
                        ...editorDraft,
                        moderationEnabled: event.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-brand-blue-primary"
                  />
                </label>

                <label className="block">
                  <span
                    className="block font-black uppercase tracking-wider text-slate-600 mb-1"
                    style={{ fontSize: 'min(10px, 3.2cqmin)' }}
                  >
                    Participant identification
                  </span>
                  <select
                    value={editorDraft.identificationMode}
                    onChange={(event) =>
                      setEditorDraft({
                        ...editorDraft,
                        identificationMode: event.target
                          .value as ActivityWallActivity['identificationMode'],
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
                    style={{ fontSize: 'min(12px, 3.8cqmin)' }}
                  >
                    <option value="anonymous">Anonymous</option>
                    <option value="name">Name</option>
                    <option value="pin">PIN</option>
                    <option value="name-pin">Name &amp; PIN</option>
                  </select>
                </label>
              </div>
            </div>

            <div
              className="border-t border-slate-200"
              style={{ padding: 'min(10px, 2.8cqmin)' }}
            >
              <button
                type="button"
                onClick={saveEditorDraft}
                className="w-full rounded-xl bg-emerald-600 text-white font-black uppercase tracking-wider"
                style={{
                  padding: 'min(8px, 2.2cqmin)',
                  fontSize: 'min(11px, 3.5cqmin)',
                }}
              >
                Save activity
              </button>
            </div>
          </div>
        }
      />
    );
  }

  if (!showLiveView || !activeActivity) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <div className="h-full w-full bg-white flex flex-col overflow-hidden">
            <div
              className="flex items-center justify-between border-b border-slate-200"
              style={{ padding: 'min(10px, 2.8cqmin)' }}
            >
              <div>
                <h2
                  className="font-black uppercase tracking-wide text-slate-800"
                  style={{ fontSize: 'min(12px, 3.8cqmin)' }}
                >
                  Activity Library
                </h2>
                <p
                  className="text-slate-500 font-semibold uppercase tracking-wider"
                  style={{ fontSize: 'min(9px, 2.8cqmin)' }}
                >
                  {activities.length} activit
                  {activities.length === 1 ? 'y' : 'ies'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditorDraft(buildBlankActivity());
                  setShowLiveView(false);
                }}
                className="rounded-xl bg-brand-blue-primary text-white font-black uppercase flex items-center"
                style={{
                  padding: 'min(7px, 2cqmin) min(10px, 2.8cqmin)',
                  gap: 'min(4px, 1.4cqmin)',
                  fontSize: 'min(10px, 3.2cqmin)',
                }}
                title="Create activity"
              >
                <Plus
                  style={{
                    width: 'min(12px, 3.7cqmin)',
                    height: 'min(12px, 3.7cqmin)',
                  }}
                />
                New
              </button>
            </div>

            <div
              className="flex-1 min-h-0 overflow-auto"
              style={{ padding: 'min(10px, 2.8cqmin)' }}
            >
              {activities.length === 0 ? (
                <div className="h-full w-full flex flex-col items-center justify-center text-center bg-slate-50 rounded-xl border border-slate-200">
                  <LibraryBig
                    className="text-brand-blue-primary"
                    style={{
                      width: 'min(40px, 14cqmin)',
                      height: 'min(40px, 14cqmin)',
                    }}
                  />
                  <p className="font-black text-slate-800 mt-2">
                    No activities yet
                  </p>
                  <p
                    className="text-slate-500 font-medium"
                    style={{ fontSize: 'min(11px, 3.6cqmin)' }}
                  >
                    Create your first activity to launch a wall.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="rounded-xl border border-slate-200 bg-slate-50"
                      style={{ padding: 'min(8px, 2.2cqmin)' }}
                    >
                      <p className="font-bold text-slate-900 truncate">
                        {activity.title}
                      </p>
                      <p
                        className="text-slate-600 line-clamp-1"
                        style={{ fontSize: 'min(10px, 3.2cqmin)' }}
                      >
                        {activity.prompt}
                      </p>
                      <div
                        className="grid grid-cols-3 mt-2"
                        style={{ gap: 'min(6px, 1.7cqmin)' }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            updateConfig({ activeActivityId: activity.id });
                            setShowLiveView(true);
                          }}
                          className="rounded-lg bg-emerald-600 text-white font-bold"
                          style={{
                            padding: 'min(6px, 1.6cqmin)',
                            fontSize: 'min(10px, 3.1cqmin)',
                          }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditorDraft(activity)}
                          className="rounded-lg bg-amber-500 text-white font-bold flex items-center justify-center"
                          style={{ gap: 'min(4px, 1.1cqmin)' }}
                        >
                          <Pencil
                            style={{
                              width: 'min(11px, 3.2cqmin)',
                              height: 'min(11px, 3.2cqmin)',
                            }}
                          />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteActivity(activity.id)}
                          className="rounded-lg bg-rose-600 text-white font-bold flex items-center justify-center"
                          style={{ gap: 'min(4px, 1.1cqmin)' }}
                        >
                          <Trash2
                            style={{
                              width: 'min(11px, 3.2cqmin)',
                              height: 'min(11px, 3.2cqmin)',
                            }}
                          />
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        }
      />
    );
  }

  const visibleSubmissions = allSubmissions.filter(
    (s) => s.status === 'approved'
  );
  const photoGridLayout = (() => {
    const count = visibleSubmissions.length;
    const width = submissionsGridSize.width;
    const height = submissionsGridSize.height;
    if (count === 0 || width <= 0 || height <= 0) {
      return { columns: 2, rowHeight: 180 };
    }

    const minTileWidth = 140;
    const maxTileWidth = 360;
    const minTileHeight = 120;
    const preferredTileWidth = 220;
    const maxColumns = Math.min(count, 8);

    let bestColumns = 1;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let columns = 1; columns <= maxColumns; columns += 1) {
      const rows = Math.ceil(count / columns);
      const tileWidth = width / columns;
      const tileHeight = height / rows;
      if (tileWidth < minTileWidth) continue;

      const widthPenalty =
        tileWidth > maxTileWidth ? (tileWidth - maxTileWidth) * 0.8 : 0;
      const sizeDistance =
        Math.abs(tileWidth - preferredTileWidth) +
        Math.abs(tileHeight - preferredTileWidth * 0.72);
      const fillScore = tileHeight * rows;
      const score = fillScore - sizeDistance - widthPenalty;

      if (score > bestScore) {
        bestScore = score;
        bestColumns = columns;
      }
    }

    const fallbackColumns = Math.max(
      1,
      Math.min(maxColumns, Math.round(width / preferredTileWidth))
    );
    const columns =
      bestScore === Number.NEGATIVE_INFINITY ? fallbackColumns : bestColumns;
    const rows = Math.ceil(count / columns);
    const rawRowHeight = height / rows;
    const maxTileHeight = count <= 6 ? height : 320;

    return {
      columns,
      rowHeight: Math.max(minTileHeight, Math.min(maxTileHeight, rawRowHeight)),
    };
  })();

  const wordCloudData =
    activeActivity.mode === 'text' ? buildWordCloud(visibleSubmissions) : [];
  const fullscreenMediaUrl = fullscreenSubmission
    ? isSafeHttpUrl(fullscreenSubmission.content)
      ? fullscreenSubmission.content
      : fullscreenSubmission.storagePath
        ? (firebasePhotoUrls[fullscreenSubmission.storagePath] ?? null)
        : (firebasePhotoUrls[fullscreenSubmission.content] ?? null)
    : null;

  return (
    <>
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
                style={{ gap: 'min(6px, 1.8cqmin)' }}
              >
                <button
                  type="button"
                  onClick={() => setShowLiveView(false)}
                  className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-bold"
                  style={{ fontSize: 'min(10px, 3.4cqmin)' }}
                  title="Back to activity library"
                >
                  Library
                </button>
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
                <div
                  className="flex flex-col"
                  style={{ gap: 'min(8px, 2cqmin)' }}
                >
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
                  <div className="space-y-1">
                    {visibleSubmissions.map((submission) => (
                      <button
                        key={submission.id}
                        type="button"
                        onClick={() =>
                          setSelectedSubmissionId((prev) =>
                            prev === submission.id ? null : submission.id
                          )
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className="truncate text-slate-700"
                            style={{ fontSize: 'min(10px, 3.2cqmin)' }}
                          >
                            {submission.content}
                          </p>
                          {selectedSubmissionId === submission.id && (
                            <span
                              className="inline-flex items-center gap-1"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <button
                                type="button"
                                className="rounded-full bg-slate-100 p-1 text-slate-700"
                                title="Open fullscreen preview"
                                aria-label="Open fullscreen preview"
                                onClick={() =>
                                  setFullscreenSubmission(submission)
                                }
                              >
                                <Expand
                                  style={{
                                    width: 'min(10px, 3cqmin)',
                                    height: 'min(10px, 3cqmin)',
                                  }}
                                />
                              </button>
                              <button
                                type="button"
                                className="rounded-full bg-rose-50 p-1 text-rose-700"
                                title="Delete submission"
                                aria-label="Delete submission"
                                onClick={() =>
                                  void deleteSubmission(submission)
                                }
                              >
                                <Trash2
                                  style={{
                                    width: 'min(10px, 3cqmin)',
                                    height: 'min(10px, 3cqmin)',
                                  }}
                                />
                              </button>
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  ref={setSubmissionsGridNode}
                  className="grid"
                  style={{
                    gap: 'min(6px, 1.8cqmin)',
                    gridTemplateColumns: `repeat(${photoGridLayout.columns}, minmax(0, 1fr))`,
                    gridAutoRows: `${photoGridLayout.rowHeight}px`,
                    gridAutoFlow: 'dense',
                    alignContent: 'stretch',
                    minHeight: '100%',
                  }}
                >
                  {visibleSubmissions.map((submission) => {
                    const archiveStatus = getArchiveStatus(submission);
                    const photoAspectRatio = photoAspectRatios[submission.id];
                    const isLandscape = (photoAspectRatio ?? 1) > 1.15;
                    const canSpanWide = photoGridLayout.columns >= 4;
                    const displayUrl = isSafeHttpUrl(submission.content)
                      ? submission.content
                      : submission.storagePath
                        ? firebasePhotoUrls[submission.storagePath]
                        : undefined;

                    return (
                      <div
                        key={submission.id}
                        className="rounded-lg bg-white border border-slate-200 overflow-hidden"
                        style={{
                          gridColumn: `span ${isLandscape && canSpanWide ? 2 : 1}`,
                        }}
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          setSelectedSubmissionId((prev) =>
                            prev === submission.id ? null : submission.id
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ')
                            return;
                          event.preventDefault();
                          setSelectedSubmissionId((prev) =>
                            prev === submission.id ? null : submission.id
                          );
                        }}
                      >
                        {displayUrl ? (
                          <div className="block">
                            <div className="relative">
                              <img
                                src={displayUrl}
                                alt={submission.participantLabel ?? 'Photo'}
                                className="block w-full h-auto"
                                onLoad={(event) =>
                                  handlePhotoLoad(
                                    submission.id,
                                    event.currentTarget.naturalWidth,
                                    event.currentTarget.naturalHeight
                                  )
                                }
                              />
                              {selectedSubmissionId === submission.id && (
                                <div
                                  className="absolute left-2 top-2 flex items-center gap-1"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    className="rounded-full bg-white/95 p-1 text-slate-700 shadow"
                                    title="Open fullscreen preview"
                                    aria-label="Open fullscreen preview"
                                    onClick={() =>
                                      setFullscreenSubmission(submission)
                                    }
                                  >
                                    <Expand
                                      style={{
                                        width: 'min(10px, 3cqmin)',
                                        height: 'min(10px, 3cqmin)',
                                      }}
                                    />
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-full bg-white/95 p-1 text-rose-700 shadow"
                                    title="Delete submission"
                                    aria-label="Delete submission"
                                    onClick={() =>
                                      void deleteSubmission(submission)
                                    }
                                  >
                                    <Trash2
                                      style={{
                                        width: 'min(10px, 3cqmin)',
                                        height: 'min(10px, 3cqmin)',
                                      }}
                                    />
                                  </button>
                                </div>
                              )}
                              {archiveStatus === 'failed' && (
                                <span
                                  title="Drive sync failed"
                                  aria-label="Drive sync failed"
                                  className="absolute right-2 top-2 flex items-center justify-center rounded-full bg-rose-600 font-black text-white"
                                  style={{
                                    width: 'min(14px, 4.2cqmin)',
                                    height: 'min(14px, 4.2cqmin)',
                                    fontSize: 'min(10px, 3cqmin)',
                                    lineHeight: 1,
                                  }}
                                >
                                  ×
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
                          </div>
                        ) : (
                          <div
                            className="flex items-center justify-center text-red-400"
                            style={{
                              aspectRatio: '4/3',
                              fontSize: 'min(9px, 3cqmin)',
                            }}
                          >
                            Photo still syncing
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
      <Modal
        isOpen={!!fullscreenSubmission}
        onClose={() => setFullscreenSubmission(null)}
        variant="bare"
        maxWidth="max-w-5xl"
        ariaLabel="Submission preview"
      >
        {fullscreenSubmission && (
          <div className="rounded-2xl bg-slate-950/95 p-4 text-white">
            {fullscreenMediaUrl && isLikelyVideoUrl(fullscreenMediaUrl) ? (
              <video
                src={fullscreenMediaUrl}
                controls
                className="max-h-[75vh] w-full rounded-xl"
              />
            ) : fullscreenMediaUrl ? (
              <img
                src={fullscreenMediaUrl}
                alt={fullscreenSubmission.participantLabel ?? 'Submission'}
                className="max-h-[75vh] w-full object-contain rounded-xl"
              />
            ) : (
              <div className="max-h-[75vh] overflow-auto whitespace-pre-wrap rounded-xl bg-white/10 p-4 text-base">
                {fullscreenSubmission.content}
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
};
