import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  WidgetComponentProps,
  NextUpConfig,
  NextUpQueueItem,
  TimeToolConfig,
} from '@/types';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { WidgetLayout } from '../WidgetLayout';
import { resumeAudio } from '@/utils/timeToolAudio';
import {
  collection,
  onSnapshot,
  deleteDoc,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { ListOrdered, RefreshCcw } from 'lucide-react';

const SESSIONS_COLLECTION = 'nextup_sessions';
const ENTRIES_SUBCOLLECTION = 'entries';

export const NextUpWidget: React.FC<WidgetComponentProps> = ({ widget }) => {
  const config = widget.config as NextUpConfig;
  const { driveService } = useGoogleDrive();
  const { updateWidget, activeDashboard } = useDashboard();
  const { user } = useAuth();

  const [queue, setQueue] = useState<NextUpQueueItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Firestore session ID is [teacherUid]_[widgetId] to ensure ownership and avoid collisions/permission issues
  const sessionId = useMemo(() => {
    if (!user || !widget.id) return null;
    // Sanitize widget.id to prevent path traversal
    const safeWidgetId = widget.id.replace(/[^a-zA-Z0-9_-]/g, '');
    return `${user.uid}_${safeWidgetId}`;
  }, [user, widget.id]);

  // Auto-expiry check: Deactivate session if it's from a previous day
  useEffect(() => {
    if (config.isActive && config.createdAt) {
      const createdDate = new Date(config.createdAt).toDateString();
      const today = new Date().toDateString();
      if (createdDate !== today) {
        updateWidget(widget.id, { config: { ...config, isActive: false } });
      }
    }
  }, [config.isActive, config.createdAt, widget.id, updateWidget, config]);

  // Sync from Drive when triggered by Firestore
  useEffect(() => {
    let isMounted = true;
    if (config.activeDriveFileId && driveService && config.isActive) {
      const loadQueue = async () => {
        setLoading(true);
        try {
          const fileId = config.activeDriveFileId;
          if (!fileId) return;
          const blob = await driveService.downloadFile(fileId);
          const text = await blob.text();
          if (isMounted) {
            try {
              setQueue(JSON.parse(text) as NextUpQueueItem[]);
            } catch (e) {
              console.error('Failed to parse queue data:', e);
            }
          }
        } catch (e) {
          console.error('Failed to load queue data:', e);
        } finally {
          if (isMounted) setLoading(false);
        }
      };
      void loadQueue();
    } else if (!config.isActive) {
      setQueue([]);
    }
    return () => {
      isMounted = false;
    };
  }, [
    config.activeDriveFileId,
    config.lastUpdated,
    driveService,
    config.isActive,
  ]);

  const queueRef = React.useRef(queue);
  React.useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const lastExternalTriggerRef = React.useRef(config.externalTrigger ?? 0);

  // Firestore "Buffer" Listener: Watch for incoming student entries
  useEffect(() => {
    if (
      !config.isActive ||
      !config.activeDriveFileId ||
      !driveService ||
      !sessionId
    )
      return;

    const entriesRef = collection(
      db,
      SESSIONS_COLLECTION,
      sessionId,
      ENTRIES_SUBCOLLECTION
    );
    const q = query(entriesRef, orderBy('joinedAt', 'asc'), limit(5));

    return onSnapshot(
      q,
      (snap) => {
        if (snap.empty) return;

        const processEntries = async () => {
          // Process new entries using a ref to get the latest queue state
          const updatedQueue = [...queueRef.current];
          const deletePromises: Promise<void>[] = [];

          snap.docs.forEach((doc) => {
            const data = doc.data() as { name: string; joinedAt: number };
            const newItem: NextUpQueueItem = {
              id: doc.id,
              name: data.name,
              status: 'waiting',
              joinedAt: data.joinedAt,
            };

            // Avoid duplicates if listener triggers multiple times
            // and cap the queue length to prevent abuse (DoS / Drive space exhaustion)
            if (
              !updatedQueue.some((q) => q.id === doc.id) &&
              updatedQueue.length < 500
            ) {
              // If no active student, make the first one active
              if (updatedQueue.length === 0) {
                newItem.status = 'active';
              }
              updatedQueue.push(newItem);
            }

            deletePromises.push(deleteDoc(doc.ref));
          });

          // Save to Drive and trigger local re-fetch
          const blob = new Blob([JSON.stringify(updatedQueue)], {
            type: 'application/json',
          });
          if (!config.activeDriveFileId) return;
          await driveService.updateFileContent(config.activeDriveFileId, blob);

          // Cleanup entries from Firestore (PII Safety)
          await Promise.all(deletePromises);

          // Trigger update
          updateWidget(widget.id, {
            config: { ...config, lastUpdated: Date.now() },
          });
        };

        void processEntries();
      },
      (error) => {
        console.error('[NextUp] Entries listener error:', error);
      }
    );
  }, [sessionId, driveService, config, widget.id, updateWidget]);

  const syncToDrive = useCallback(
    async (updatedQueue: NextUpQueueItem[]) => {
      if (!config.activeDriveFileId || !driveService) return;
      try {
        const blob = new Blob([JSON.stringify(updatedQueue)], {
          type: 'application/json',
        });
        await driveService.updateFileContent(config.activeDriveFileId, blob);
        // Trigger real-time update for other instances (like teacher board)
        updateWidget(widget.id, {
          config: { ...config, lastUpdated: Date.now() },
        });
      } catch (error) {
        console.error('Failed to sync queue:', error);
      }
    },
    [config, driveService, widget.id, updateWidget]
  );

  const handleNextStudent = useCallback(async () => {
    const updated = [...queue];
    const activeIdx = updated.findIndex((q) => q.status === 'active');
    if (activeIdx !== -1) updated[activeIdx].status = 'done';

    const nextIdx = updated.findIndex((q) => q.status === 'waiting');
    if (nextIdx !== -1) updated[nextIdx].status = 'active';

    setQueue(updated);

    // Nexus: Auto-Start Timer integration (from #770)
    if (config.autoStartTimer && activeDashboard && nextIdx !== -1) {
      const activeTimer = activeDashboard.widgets.find(
        (w) => w.type === 'time-tool'
      );
      if (activeTimer) {
        // Unlock audio context on user gesture
        resumeAudio().catch(console.error);

        const timerConfig = activeTimer.config as TimeToolConfig;
        const isStopwatchMode = timerConfig.mode === 'stopwatch';
        const resetElapsedTime = isStopwatchMode
          ? 0
          : (timerConfig.duration ?? timerConfig.elapsedTime ?? 0);

        updateWidget(activeTimer.id, {
          config: {
            ...timerConfig,
            isRunning: true,
            startTime: Date.now(),
            elapsedTime: resetElapsedTime,
          },
        });
      }
    }

    await syncToDrive(updated);
  }, [
    queue,
    config.autoStartTimer,
    activeDashboard,
    syncToDrive,
    updateWidget,
  ]);

  // Nexus: External trigger (e.g., from Time Tool auto-advance)
  useEffect(() => {
    if (
      config.externalTrigger &&
      config.externalTrigger > lastExternalTriggerRef.current
    ) {
      lastExternalTriggerRef.current = config.externalTrigger;
      void handleNextStudent();
    }
  }, [config.externalTrigger, handleNextStudent]);

  const handleResetQueue = async () => {
    if (!window.confirm('Reset the current queue? This will clear all names.'))
      return;
    const updated: NextUpQueueItem[] = [];
    setQueue(updated);
    await syncToDrive(updated);
  };

  const activeStudent = useMemo(
    () => queue.find((q) => q.status === 'active'),
    [queue]
  );
  const waitingStudents = useMemo(
    () =>
      queue.filter((q) => q.status === 'waiting').slice(0, config.displayCount),
    [queue, config.displayCount]
  );

  if (!config.isActive) {
    return (
      <WidgetLayout
        content={
          <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6 text-center">
            <ListOrdered
              className="mb-4 opacity-20"
              style={{
                width: 'min(48px, 12cqmin)',
                height: 'min(48px, 12cqmin)',
              }}
            />
            <p
              className="font-medium"
              style={{ fontSize: 'min(14px, 3.5cqmin)' }}
            >
              Queue is not active
            </p>
            <p className="mt-1" style={{ fontSize: 'min(10px, 2.5cqmin)' }}>
              Flip to settings to start a session
            </p>
          </div>
        }
      />
    );
  }

  return (
    <WidgetLayout
      padding="p-0"
      header={
        <div
          className="flex justify-between items-center text-white font-lexend shrink-0"
          style={{
            padding: 'min(12px, 3cqmin)',
            backgroundColor: config.styling.themeColor,
            filter: 'brightness(0.8)',
          }}
        >
          <div className="flex items-center gap-2">
            <ListOrdered
              style={{
                width: 'min(18px, 4.5cqmin)',
                height: 'min(18px, 4.5cqmin)',
              }}
            />
            <h3
              className="font-bold truncate"
              style={{ fontSize: 'min(16px, 4cqmin)', maxWidth: '120px' }}
            >
              {config.sessionName}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetQueue}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title="Reset Queue"
            >
              <RefreshCcw
                style={{
                  width: 'min(14px, 3.5cqmin)',
                  height: 'min(14px, 3.5cqmin)',
                }}
              />
            </button>
            <button
              onClick={handleNextStudent}
              disabled={loading}
              className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded font-bold transition-all text-white disabled:opacity-50"
              style={{ fontSize: 'min(12px, 3cqmin)' }}
            >
              NEXT
            </button>
          </div>
        </div>
      }
      content={
        <div
          className="flex flex-col h-full w-full font-lexend overflow-hidden"
          style={{
            padding: 'min(16px, 4cqmin)',
            fontFamily: config.styling.fontFamily,
          }}
        >
          {/* Current Student Hero */}
          <div
            className="rounded-2xl text-center shrink-0 border-2 transition-all duration-500"
            style={{
              marginBottom: 'min(20px, 5cqmin)',
              padding: 'min(20px, 5cqmin)',
              backgroundColor: `${config.styling.themeColor}15`,
              borderColor: `${config.styling.themeColor}40`,
            }}
          >
            <p
              className="uppercase font-black tracking-widest opacity-60"
              style={{
                fontSize: 'min(10px, 2.5cqmin)',
                marginBottom: 'min(4px, 1cqmin)',
                color: config.styling.themeColor,
              }}
            >
              Currently Helping
            </p>
            <p
              className="font-black truncate animate-in zoom-in duration-300"
              style={{
                fontSize: 'min(32px, 8cqmin)',
                color: config.styling.themeColor,
              }}
            >
              {activeStudent ? activeStudent.name : 'AVAILABLE'}
            </p>
          </div>

          {/* Upcoming List */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2 px-1">
              <p
                className="text-slate-400 font-bold uppercase tracking-wider"
                style={{ fontSize: 'min(10px, 2.5cqmin)' }}
              >
                Up Next
              </p>
              <span
                className="text-slate-300 font-bold"
                style={{ fontSize: 'min(10px, 2.5cqmin)' }}
              >
                {queue.filter((q) => q.status === 'waiting').length} total
              </span>
            </div>

            <div
              className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar"
              style={{ gap: 'min(8px, 2cqmin)' }}
            >
              {waitingStudents.length === 0 ? (
                <div className="h-full flex items-center justify-center opacity-30 italic py-8 text-center">
                  <p style={{ fontSize: 'min(14px, 3.5cqmin)' }}>
                    No one waiting
                  </p>
                </div>
              ) : (
                waitingStudents.map((student, idx) => (
                  <div
                    key={student.id}
                    className={`flex items-center bg-white border border-slate-100 rounded-xl shadow-sm animate-in slide-in-from-right duration-300`}
                    style={{
                      padding: 'min(12px, 3cqmin)',
                      animationDelay: `${idx * 50}ms`,
                    }}
                  >
                    <span
                      className="flex items-center justify-center text-white font-black rounded-lg shrink-0"
                      style={{
                        width: 'min(28px, 7cqmin)',
                        height: 'min(28px, 7cqmin)',
                        fontSize: 'min(12px, 3cqmin)',
                        marginRight: 'min(12px, 3cqmin)',
                        backgroundColor: config.styling.themeColor,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <span
                      className="font-bold text-slate-700 truncate"
                      style={{ fontSize: 'min(16px, 4cqmin)' }}
                    >
                      {student.name}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      }
    />
  );
};
