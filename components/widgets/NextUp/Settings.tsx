import React, { useState, useEffect } from 'react';
import { WidgetData, NextUpConfig } from '@/types';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { NextUpSession } from '@/types';
import { Plus, RefreshCcw, Check, Trash2, Copy } from 'lucide-react';

const NEXTUP_FOLDER_NAME = 'NextUp';
const SESSIONS_COLLECTION = 'nextup_sessions';

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
        const safeWidgetId = widget.id.replace(/[^a-zA-Z0-9_-]/g, '');
        const fsSessionId = `${user.uid}_${safeWidgetId}`;
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
      const safeWidgetId = widget.id.replace(/[^a-zA-Z0-9_-]/g, '');
      const fsSessionId = `${user.uid}_${safeWidgetId}`;
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
    const safeWidgetId = widget.id.replace(/[^a-zA-Z0-9_-]/g, '');
    const fsSessionId = `${user.uid}_${safeWidgetId}`;
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
