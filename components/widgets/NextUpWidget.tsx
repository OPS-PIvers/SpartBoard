import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  WidgetComponentProps,
  NextUpConfig,
  NextUpQueueItem,
  WidgetData,
  NextUpSession,
  TimeToolConfig,
} from '@/types';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { WidgetLayout } from './WidgetLayout';
import { Toggle } from '@/components/common/Toggle';
import {
  doc,
  setDoc,
  updateDoc,
  collection,
  onSnapshot,
  deleteDoc,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  ListOrdered,
  RefreshCcw,
  Plus,
  Trash2,
  Copy,
  Check,
} from 'lucide-react';

const NEXTUP_FOLDER_NAME = 'NextUp';
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
  const sessionId = useMemo(
    () => (user ? `${user.uid}_${widget.id}` : null),
    [user, widget.id]
  );

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
          // Process new entries
          const updatedQueue = [...queue];
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
            if (!updatedQueue.some((q) => q.id === doc.id)) {
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
  }, [sessionId, driveService, queue, config, widget.id, updateWidget]);

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

  const handleNextStudent = async () => {
    const updated = [...queue];
    const activeIdx = updated.findIndex((q) => q.status === 'active');
    if (activeIdx !== -1) updated[activeIdx].status = 'done';

    const nextIdx = updated.findIndex((q) => q.status === 'waiting');
    if (nextIdx !== -1) updated[nextIdx].status = 'active';

    setQueue(updated);
    await syncToDrive(updated);

    // Nexus: Auto-Start Timer integration
    if (config.autoStartTimer && activeDashboard) {
      const activeTimer = activeDashboard.widgets.find(
        (w) => w.type === 'time-tool'
      );
      if (activeTimer) {
        const timerConfig = activeTimer.config as TimeToolConfig;
        updateWidget(activeTimer.id, {
          config: {
            ...timerConfig,
            isRunning: true,
            startTime: Date.now(),
          },
        });
      }
    }
  };

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
            <ListOrdered className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm font-medium">Queue is not active</p>
            <p className="text-xxs mt-1">Flip to settings to start a session</p>
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

export const NextUpSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as NextUpConfig;
  const { user } = useAuth();
  const { driveService } = useGoogleDrive();
  const { updateWidget } = useDashboard();

  const [existingFiles, setExistingFiles] = useState<
    { id: string; name: string }[]
  >([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [copied, setCopy] = useState(false);

  // Load existing queue files
  useEffect(() => {
    const loadFiles = async () => {
      if (!driveService) return;
      setLoadingFiles(true);
      try {
        const folderId = await driveService.getFolderPath(NEXTUP_FOLDER_NAME);
        const files = await driveService.listFiles(
          `'${folderId}' in parents and trashed = false`
        );
        setExistingFiles(
          files.map((f) => ({ id: f.id, name: f.name.replace('.json', '') }))
        );
      } catch (error) {
        console.error('Failed to load existing queues:', error);
      } finally {
        setLoadingFiles(false);
      }
    };
    void loadFiles();
  }, [driveService]);

  const handleStartSession = async (type: 'new' | 'existing', id?: string) => {
    if (!driveService || !user) return;

    let fileId = id;
    let name = '';

    if (type === 'new') {
      const title = window.prompt('Enter a title for this queue session:');
      if (!title) return;
      name = title;
      try {
        const file = await driveService.uploadFile(
          new Blob([JSON.stringify([])], { type: 'application/json' }),
          `${title}.json`,
          NEXTUP_FOLDER_NAME
        );
        fileId = file.id;
      } catch (error) {
        console.error('Failed to create queue file in Drive:', error);
        alert('Failed to create queue file in Drive');
        return;
      }
    } else {
      name = existingFiles.find((f) => f.id === id)?.name ?? 'Restored Session';
    }

    if (fileId) {
      try {
        // 1. Create/Update Firestore Session (for student access)
        // ID is [teacherUid]_[widgetId] to ensure ownership across account merges
        const fsSessionId = `${user.uid}_${widget.id}`;
        const sessionData: NextUpSession = {
          id: widget.id,
          teacherUid: user.uid,
          sessionName: name,
          activeDriveFileId: fileId,
          isActive: true,
          createdAt: Date.now(),
          lastUpdated: Date.now(),
        };
        await setDoc(doc(db, SESSIONS_COLLECTION, fsSessionId), sessionData);

        // 2. Update Local Widget Config
        updateWidget(widget.id, {
          config: {
            ...config,
            activeDriveFileId: fileId,
            sessionName: name,
            isActive: true,
            createdAt: sessionData.createdAt,
          },
        });
      } catch (error) {
        console.error('[NextUp] Failed to start session:', error);
        alert('Failed to start live session. Please check your permissions.');
      }
    }
  };

  const handleEndSession = async (save: boolean) => {
    if (
      !window.confirm(
        save
          ? 'End session and keep the data in your Drive?'
          : 'End session and DELETE the data from your Drive?'
      )
    )
      return;

    if (!save && config.activeDriveFileId && driveService) {
      void driveService
        .deleteFile(config.activeDriveFileId)
        .catch(console.error);
    }

    // 1. Deactivate in Firestore
    if (user) {
      const fsSessionId = `${user.uid}_${widget.id}`;
      await updateDoc(doc(db, SESSIONS_COLLECTION, fsSessionId), {
        isActive: false,
      }).catch(console.error); // Silent fail if doc doesn't exist or permissions changed
    }

    // 2. Update Local Widget Config
    updateWidget(widget.id, {
      config: {
        ...config,
        isActive: false,
        activeDriveFileId: null,
        sessionName: null,
      },
    });
  };

  const copyLink = () => {
    if (!user) return;
    const fsSessionId = `${user.uid}_${widget.id}`;
    const url = `${window.location.origin}/nextup?id=${fsSessionId}`;
    void navigator.clipboard.writeText(url);
    setCopy(true);
    setTimeout(() => setCopy(false), 2000);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden font-lexend">
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar text-brand-gray-darkest">
        {/* Session Control */}
        <section>
          <label className="text-xxs font-black text-slate-400 uppercase tracking-widest mb-3 block">
            Session Status
          </label>

          {!config.isActive ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleStartSession('new')}
                className="flex flex-col items-center justify-center p-4 bg-emerald-50 text-emerald-600 rounded-2xl border-2 border-emerald-100 hover:bg-emerald-100 transition-all group"
              >
                <Plus className="w-6 h-6 mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold font-lexend">New Queue</span>
              </button>

              <div className="relative">
                <button
                  disabled={loadingFiles || existingFiles.length === 0}
                  className="w-full h-full flex flex-col items-center justify-center p-4 bg-blue-50 text-brand-blue-primary rounded-2xl border-2 border-blue-100 hover:bg-blue-100 disabled:opacity-50 disabled:grayscale transition-all group font-lexend"
                >
                  <RefreshCcw className="w-6 h-6 mb-2 group-hover:rotate-12 transition-transform" />
                  <span className="text-xs font-bold font-lexend">
                    Load Existing
                  </span>
                </button>
                {existingFiles.length > 0 && (
                  <select
                    onChange={(e) =>
                      handleStartSession('existing', e.target.value)
                    }
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select a queue...
                    </option>
                    {existingFiles.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xxs font-bold text-emerald-600 uppercase">
                    Live Now
                  </p>
                  <p className="text-sm font-bold text-emerald-900 truncate max-w-[150px]">
                    {config.sessionName}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEndSession(true)}
                    className="p-2 bg-white text-slate-600 hover:text-emerald-600 rounded-lg shadow-sm border border-emerald-100 transition-colors"
                    title="Save & End"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleEndSession(false)}
                    className="p-2 bg-white text-slate-600 hover:text-red-600 rounded-lg shadow-sm border border-red-100 transition-colors"
                    title="Delete & End"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xxs font-bold text-slate-400 uppercase">
                    Student Link
                  </p>
                  <p className="text-xs text-slate-600 truncate opacity-60">
                    /nextup?id={user?.uid}_{widget.id}
                  </p>
                </div>
                <button
                  onClick={copyLink}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                    copied
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white text-brand-blue-primary border border-slate-200'
                  }`}
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Connection Settings */}
        <section className="space-y-4">
          <label className="text-xxs font-black text-slate-400 uppercase tracking-widest block">
            Connections
          </label>
          <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-600 block mb-1">
                Auto-Start Timer
              </span>
              <span className="text-xxs text-slate-400 block max-w-[200px] leading-tight">
                Automatically starts an active timer when moving to the next
                student
              </span>
            </div>
            <Toggle
              checked={config.autoStartTimer ?? false}
              onChange={(v) =>
                updateWidget(widget.id, {
                  config: { ...config, autoStartTimer: v },
                })
              }
            />
          </div>
        </section>

        {/* Display Settings */}
        <section className="space-y-4">
          <label className="text-xxs font-black text-slate-400 uppercase tracking-widest block">
            Display Settings
          </label>

          <div className="space-y-4 bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-xs font-bold text-slate-600">
                  Upcoming Count
                </span>
                <span className="text-xs font-black text-brand-blue-primary">
                  {config.displayCount}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={config.displayCount}
                onChange={(e) =>
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      displayCount: parseInt(e.target.value),
                    },
                  })
                }
                className="w-full accent-brand-blue-primary cursor-pointer"
              />
            </div>

            <div>
              <span className="text-xs font-bold text-slate-600 mb-2 block font-lexend">
                Theme Color
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  '#2d3f89',
                  '#ad2122',
                  '#059669',
                  '#d97706',
                  '#7c3aed',
                  '#db2777',
                ].map((c) => (
                  <button
                    key={c}
                    onClick={() =>
                      updateWidget(widget.id, {
                        config: {
                          ...config,
                          styling: { ...config.styling, themeColor: c },
                        },
                      })
                    }
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      config.styling.themeColor === c
                        ? 'border-slate-400 scale-110 shadow-md'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div>
              <span className="text-xs font-bold text-slate-600 mb-2 block font-lexend">
                Typeface
              </span>
              <select
                value={config.styling.fontFamily}
                onChange={(e) =>
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      styling: {
                        ...config.styling,
                        fontFamily: e.target.value,
                      },
                    },
                  })
                }
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-brand-blue-primary"
              >
                <option value="lexend">Lexend (Modern)</option>
                <option value="patrick-hand">Patrick Hand (Playful)</option>
                <option value="roboto-mono">Roboto Mono (Tech)</option>
                <option value="sans">System Sans</option>
              </select>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
