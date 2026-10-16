import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from 'react';
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
  shouldExpireNextUpQueue,
  type NextUpQueueAction,
} from './nextUpQueueUtils';
import { getNextUpQueueStore } from './nextUpQueueStore';
import {
  collection,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { ListOrdered, RefreshCcw } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { useDialog } from '@/context/useDialog';
import { useInSubShare } from '@/hooks/useShareContent';
import { tourAttr } from '@/config/tourAnchors';
import { timeToolClockReducer } from '@/utils/timeToolClock';

/** A stable reference, so a share does not re-derive the queue every render. */
const EMPTY_QUEUE: NextUpQueueItem[] = [];

const SESSIONS_COLLECTION = 'nextup_sessions';
const ENTRIES_SUBCOLLECTION = 'entries';

export const NextUpWidget: React.FC<WidgetComponentProps> = ({ widget }) => {
  const config = widget.config as NextUpConfig;
  const { isActive, createdAt, activeDriveFileId, lastUpdated } = config;
  const { driveService } = useGoogleDrive();
  const { updateWidget, activeDashboard } = useDashboard();
  const { showConfirm } = useDialog();
  const { user } = useAuth();
  // A sub reads the queue the teacher's client bundled into the share's names
  // file: the live one lives in the teacher's Drive, which they cannot reach.
  const inShare = useInSubShare();

  const store = getNextUpQueueStore(widget.id);
  const queue = useSyncExternalStore(store.subscribe, store.getQueue);
  const [loading, setLoading] = useState(false);

  // Firestore session ID is [teacherUid]_[widgetId] to ensure ownership and avoid collisions/permission issues
  const sessionId = useMemo(() => {
    if (!user || !widget.id) return null;
    // Sanitize widget.id to prevent path traversal
    const safeWidgetId = widget.id.replace(/[^a-zA-Z0-9_-]/g, '');
    return `${user.uid}_${safeWidgetId}`;
  }, [user, widget.id]);

  // Tick every minute so the auto-expiry check below re-evaluates across a
  // midnight boundary even when `config` never changes (e.g. a queue with no
  // student activity left open on a classroom display overnight). Without
  // this ticker the effect only re-runs when config.isActive/createdAt
  // change identity, so a session active before midnight would stay
  // "active" indefinitely until some unrelated config write happened to
  // occur — same class of bug as CountdownWidget (#1774) and CalendarWidget
  // (#1955).
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Auto-expiry check: Deactivate session if it's from a previous day
  useEffect(() => {
    if (inShare) return;
    if (!shouldExpireNextUpQueue(isActive, createdAt, new Date(nowTick))) {
      return;
    }
    updateWidget(widget.id, { config: { isActive: false } });
    // Close the student join link too, so no one can join yesterday's queue.
    if (sessionId) {
      updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
        isActive: false,
      }).catch((error: unknown) => {
        console.error('[NextUp] Failed to close expired session:', error);
      });
    }
  }, [
    isActive,
    createdAt,
    widget.id,
    updateWidget,
    nowTick,
    inShare,
    sessionId,
  ]);

  // Sync from Drive when triggered by Firestore
  useEffect(() => {
    let isMounted = true;
    if (inShare) return;
    if (activeDriveFileId && driveService && isActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the Drive download started here
      setLoading(true);
      store
        .load(async () => {
          const blob = await driveService.downloadFile(activeDriveFileId);
          return JSON.parse(await blob.text()) as NextUpQueueItem[];
        })
        .catch((e: unknown) => {
          console.error('Failed to load queue data:', e);
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else if (!isActive) {
      store.clear();
    }
    return () => {
      isMounted = false;
    };
  }, [store, activeDriveFileId, lastUpdated, driveService, isActive, inShare]);

  const writeQueue = useCallback(
    async (fileId: string, updatedQueue: NextUpQueueItem[]) => {
      if (!driveService) throw new Error('Google Drive is not connected');
      const blob = new Blob([JSON.stringify(updatedQueue)], {
        type: 'application/json',
      });
      await driveService.updateFileContent(fileId, blob);
    },
    [driveService]
  );

  // Patch only lastUpdated, so a write finishing after End can't reopen the queue.
  const announceQueueChange = useCallback(() => {
    updateWidget(widget.id, { config: { lastUpdated: Date.now() } });
  }, [updateWidget, widget.id]);

  const lastExternalTriggerRef = React.useRef(config.externalTrigger ?? 0);

  // Firestore "Buffer" Listener: Watch for incoming student entries
  useEffect(() => {
    if (
      inShare ||
      !isActive ||
      !activeDriveFileId ||
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
          const entries = snap.docs.map((entryDoc) => {
            const data = entryDoc.data() as { name: string; joinedAt: number };
            return {
              id: entryDoc.id,
              name: data.name,
              joinedAt: data.joinedAt,
            };
          });
          await store.dispatch({ type: 'joined', entries }, (updated) =>
            writeQueue(activeDriveFileId, updated)
          );

          // Cleanup entries from Firestore (PII Safety)
          await Promise.all(
            snap.docs.map((entryDoc) => deleteDoc(entryDoc.ref))
          );

          announceQueueChange();
        };

        processEntries().catch((error: unknown) => {
          console.error('[NextUp] Failed to add students to the queue:', error);
        });
      },
      (error) => {
        console.error('[NextUp] Entries listener error:', error);
      }
    );
  }, [
    sessionId,
    driveService,
    isActive,
    activeDriveFileId,
    inShare,
    store,
    writeQueue,
    announceQueueChange,
  ]);

  const syncToDrive = useCallback(
    async (action: NextUpQueueAction) => {
      if (!activeDriveFileId || !driveService) {
        await store.dispatch(action, () => Promise.resolve());
        return;
      }
      try {
        await store.dispatch(action, (updated) =>
          writeQueue(activeDriveFileId, updated)
        );
        // Trigger real-time update for other instances (like teacher board)
        announceQueueChange();
      } catch (error) {
        console.error('Failed to sync queue:', error);
      }
    },
    [activeDriveFileId, driveService, store, writeQueue, announceQueueChange]
  );

  const handleNextStudent = useCallback(async () => {
    const nextIdx = store.getQueue().findIndex((q) => q.status === 'waiting');

    // Nexus: Auto-Start Timer integration (from #770)
    if (config.autoStartTimer && activeDashboard && nextIdx !== -1) {
      const activeTimer = activeDashboard.widgets.find(
        (w) => w.type === 'time-tool'
      );
      if (activeTimer) {
        // Unlock audio context on user gesture
        resumeAudio().catch(console.error);

        const timerConfig = activeTimer.config as TimeToolConfig;
        updateWidget(activeTimer.id, {
          config: timeToolClockReducer(timerConfig, {
            type: 'restart',
            now: Date.now(),
          }),
        });
      }
    }

    await syncToDrive({ type: 'advance' });
  }, [
    store,
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
    const confirmed = await showConfirm(
      'Reset the current queue? This will clear all names.',
      { title: 'Reset Queue', variant: 'warning', confirmLabel: 'Reset' }
    );
    if (!confirmed) return;
    await syncToDrive({ type: 'reset' });
  };

  // ⚡ Bolt: Consolidate array passes into a single O(N) loop
  // Instead of multiple passes (find, filter, slice, reduce), compute activeStudent,
  // waitingStudents, and totalWaitingCount in one single iteration.
  const shownQueue = inShare ? (config.subShareQueue ?? EMPTY_QUEUE) : queue;

  const { activeStudent, waitingStudents, totalWaitingCount } = useMemo(() => {
    let active: NextUpQueueItem | undefined;
    const waiting: NextUpQueueItem[] = [];
    let waitingCount = 0;

    for (const q of shownQueue) {
      if (q.status === 'active' && !active) {
        active = q;
      } else if (q.status === 'waiting') {
        waitingCount++;
        if (waiting.length < config.displayCount) {
          waiting.push(q);
        }
      }
    }

    return {
      activeStudent: active,
      waitingStudents: waiting,
      totalWaitingCount: waitingCount,
    };
  }, [shownQueue, config.displayCount]);

  if (inShare ? shownQueue.length === 0 : !isActive) {
    return (
      <WidgetLayout
        content={
          <ScaledEmptyState
            icon={ListOrdered}
            title={inShare ? 'No queue' : 'Queue is not active'}
            subtitle={
              inShare
                ? 'No one was in the queue when this board was shared.'
                : 'Flip to settings to start a session'
            }
          />
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
          <div
            className="flex items-center"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            <ListOrdered
              style={{
                width: 'min(18px, 4.5cqmin)',
                height: 'min(18px, 4.5cqmin)',
              }}
            />
            <h3
              className="font-bold truncate"
              style={{
                fontSize: 'min(16px, 4cqmin)',
                maxWidth: '30cqmin',
              }}
            >
              {config.sessionName}
            </h3>
          </div>
          <div
            className="flex items-center"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            {!inShare && (
              <>
                <button
                  {...tourAttr('next-up.reset-queue', widget.id, widget.type)}
                  onClick={handleResetQueue}
                  className="hover:bg-white/10 rounded transition-colors"
                  style={{ padding: 'min(4px, 1cqmin)' }}
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
                  {...tourAttr('next-up.next-student', widget.id, widget.type)}
                  onClick={handleNextStudent}
                  disabled={loading}
                  className="bg-white/20 hover:bg-white/30 rounded font-bold transition-all text-white disabled:opacity-50"
                  style={{
                    fontSize: 'min(12px, 3cqmin)',
                    paddingLeft: 'min(12px, 3cqmin)',
                    paddingRight: 'min(12px, 3cqmin)',
                    paddingTop: 'min(4px, 1cqmin)',
                    paddingBottom: 'min(4px, 1cqmin)',
                  }}
                >
                  NEXT
                </button>
              </>
            )}
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
            <div
              className="flex items-center justify-between"
              style={{
                marginBottom: 'min(8px, 2cqmin)',
                paddingLeft: 'min(4px, 1cqmin)',
                paddingRight: 'min(4px, 1cqmin)',
              }}
            >
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
                {totalWaitingCount} total
              </span>
            </div>

            <div
              className="flex-1 overflow-y-auto pr-1 flex flex-col custom-scrollbar"
              style={{ gap: 'min(8px, 2cqmin)' }}
            >
              {waitingStudents.length === 0 ? (
                <div
                  className="h-full flex items-center justify-center opacity-30 italic text-center"
                  style={{
                    paddingTop: 'min(32px, 8cqmin)',
                    paddingBottom: 'min(32px, 8cqmin)',
                  }}
                >
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
