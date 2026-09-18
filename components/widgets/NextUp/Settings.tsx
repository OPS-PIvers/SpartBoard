import React, { useId, useState, useEffect } from 'react';
import {
  WidgetData,
  NextUpConfig,
  NextUpSession,
  NextUpQueueItem,
} from '@/types';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useRosterGroupsGate } from '@/hooks/useRosterGroupsGate';
import { RosterGroupSelect } from '@/components/common/RosterGroupSelect';
import { rosterGroupMemberIds } from '@/utils/rosterGroups';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Plus, RefreshCcw, Check, Trash2, Copy, Users } from 'lucide-react';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { PartnerCard } from '@/components/settings/PartnerCard';
import { Toggle } from '@/components/common/Toggle';
import { handleRadioGroupKeyDown } from '@/components/common/radioGroupKeyNav';

const NEXTUP_FOLDER_NAME = 'NextUp';
const SESSIONS_COLLECTION = 'nextup_sessions';
const THEME_COLORS = [
  { value: '#2d3f89', name: 'Navy' },
  { value: '#ad2122', name: 'Crimson' },
  { value: '#059669', name: 'Emerald' },
  { value: '#d97706', name: 'Amber' },
  { value: '#7c3aed', name: 'Violet' },
  { value: '#db2777', name: 'Pink' },
  { value: '#2563eb', name: 'Blue' },
  { value: '#4b5563', name: 'Slate' },
];

export const NextUpSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as NextUpConfig;
  const { user } = useAuth();
  const { driveService } = useGoogleDrive();
  const { updateWidget, rosters, activeRosterId, addToast } = useDashboard();
  const { showAlert, showConfirm, showPrompt } = useDialog();

  // Group-scoped import (docs/plans/ROSTER_GROUPS_INTEGRATION.md D21). A
  // one-shot import choice, not saved config — the queue stays a snapshot the
  // teacher reorders by hand rather than becoming a live class binding.
  const rosterGroupsEnabled = useRosterGroupsGate();
  const [importGroupId, setImportGroupId] = useState<string | null>(null);
  const activeRoster = rosters.find((r) => r.id === activeRosterId);

  const [existingFiles, setExistingFiles] = useState<
    { id: string; name: string }[]
  >([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [copied, setCopy] = useState(false);
  const visualStyleLabelId = useId();

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
      const title = await showPrompt('Enter a title for this queue session:', {
        title: 'New Queue Session',
        placeholder: 'e.g. Period 3 Help Queue',
        confirmLabel: 'Create',
      });
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
        await showAlert('Failed to create queue file in Drive', {
          title: 'Drive Error',
          variant: 'error',
        });
        return;
      }
    } else {
      name = existingFiles.find((f) => f.id === id)?.name ?? 'Restored Session';
    }

    if (fileId) {
      try {
        // 1. Create/Update Firestore Session (for student access)
        // ID is [teacherUid]_[widgetId] to ensure ownership across account merges
        // Sanitize widget.id to prevent path traversal (from #749)
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
        await showAlert(
          'Failed to start live session. Please check your permissions.',
          { title: 'Session Error', variant: 'error' }
        );
      }
    }
  };

  const handleEndSession = async (save: boolean) => {
    const confirmed = await showConfirm(
      save
        ? 'End session and keep the data in your Drive?'
        : 'End session and DELETE the data from your Drive?',
      {
        title: save ? 'End Session' : 'End & Delete Session',
        variant: save ? 'info' : 'danger',
        confirmLabel: save ? 'End & Keep' : 'End & Delete',
      }
    );
    if (!confirmed) return;

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

  const handleImportRoster = async () => {
    if (!activeRosterId) {
      addToast('No active class selected in the Classes widget.', 'error');
      return;
    }

    const roster = rosters.find((r) => r.id === activeRosterId);
    if (!roster || roster.students.length === 0) {
      addToast('Active class is empty or not found.', 'error');
      return;
    }

    if (!config.activeDriveFileId || !driveService) {
      addToast('No active drive file found for this session.', 'error');
      return;
    }

    const inGroup = rosterGroupMemberIds(
      roster,
      importGroupId,
      rosterGroupsEnabled
    );
    const source = inGroup
      ? roster.students.filter((s) => inGroup.has(s.id))
      : roster.students;
    if (source.length === 0) {
      addToast('That class group has nobody on the roster.', 'error');
      return;
    }

    const confirmed = await showConfirm(
      `Replace current queue with ${source.length} students from ${roster.name}?`,
      {
        title: 'Import Class',
        variant: 'warning',
        confirmLabel: 'Import',
      }
    );

    if (!confirmed) return;

    const MAX_QUEUE_LENGTH = 500;
    const studentsToImport = source.slice(0, MAX_QUEUE_LENGTH);
    const wasTruncated = source.length > MAX_QUEUE_LENGTH;

    const newQueue: NextUpQueueItem[] = studentsToImport.map(
      (student, index) => ({
        id: crypto.randomUUID(),
        name: `${student.firstName} ${student.lastName}`.trim(),
        status: index === 0 ? 'active' : 'waiting',
        joinedAt: Date.now(),
      })
    );

    try {
      const blob = new Blob([JSON.stringify(newQueue)], {
        type: 'application/json',
      });
      await driveService.updateFileContent(config.activeDriveFileId, blob);

      updateWidget(widget.id, {
        config: { ...config, lastUpdated: Date.now() },
      });

      if (wasTruncated) {
        addToast(
          `Imported 500 students. The roster was truncated as it exceeded the maximum queue size.`,
          'warning'
        );
      } else {
        addToast(`Imported ${newQueue.length} students!`, 'success');
      }
    } catch (error) {
      console.error('Failed to import roster to queue:', error);
      addToast('Failed to import class to queue.', 'error');
    }
  };

  // Shared select handler — reused by the onClick and roving-tabindex keydown paths.
  const selectThemeColor = (color: (typeof THEME_COLORS)[number]) =>
    updateWidget(widget.id, {
      config: {
        ...config,
        styling: { ...config.styling, themeColor: color.value },
      },
    });

  return (
    <div className="flex flex-col h-full overflow-hidden font-lexend">
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar text-brand-gray-darkest">
        {/* Session Control */}
        <section>
          <SettingsLabel>Session Status</SettingsLabel>

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
                      Select a file
                    </option>
                    {existingFiles.map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-4 bg-emerald-50 border-2 border-emerald-100 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-xxs font-black text-emerald-600 uppercase tracking-wider mb-0.5">
                    Live Session Active
                  </p>
                  <p className="text-sm font-bold text-emerald-900 truncate max-w-[180px]">
                    {config.sessionName}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyLink}
                    className="p-2 bg-white text-emerald-600 rounded-xl shadow-sm hover:bg-emerald-100 transition-colors border border-emerald-100"
                    title="Copy Student Link"
                  >
                    {copied ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {rosterGroupsEnabled && activeRoster && (
                  <RosterGroupSelect
                    roster={activeRoster}
                    value={importGroupId}
                    onChange={setImportGroupId}
                    wholeClassLabel="Whole class"
                    ariaLabel="Import scope"
                  />
                )}
                <button
                  onClick={handleImportRoster}
                  className="w-full flex items-center justify-center gap-2 p-3 bg-indigo-50 border-2 border-indigo-100 rounded-xl text-indigo-600 hover:bg-indigo-100 transition-colors text-xs font-bold group"
                >
                  <Users className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  Import Active Class
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleEndSession(true)}
                    className="flex items-center justify-center gap-2 p-3 bg-white border-2 border-slate-100 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors text-xs font-bold"
                  >
                    End & Save
                  </button>
                  <button
                    onClick={() => handleEndSession(false)}
                    className="flex items-center justify-center gap-2 p-3 bg-red-50 border-2 border-red-100 rounded-xl text-red-600 hover:bg-red-100 transition-colors text-xs font-bold"
                  >
                    <Trash2 className="w-4 h-4" />
                    Discard
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Customization */}
        <section className="space-y-4">
          <SettingsLabel>Integration &amp; Logic</SettingsLabel>

          <PartnerCard
            partner="time-tool"
            missingHelp="Add a Timer widget to start it automatically when you tap NEXT."
          >
            {(present) => (
              <div className="flex items-center justify-between gap-3 py-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-semibold text-slate-700">
                    Auto-Start Timer
                  </span>
                  <span className="text-xxs text-slate-600">
                    Start the timer when you tap NEXT.
                  </span>
                </div>
                <Toggle
                  checked={config.autoStartTimer ?? false}
                  onChange={() =>
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        autoStartTimer: !config.autoStartTimer,
                      },
                    })
                  }
                  size="md"
                  label="Auto-Start Timer"
                  disabled={!present}
                />
              </div>
            )}
          </PartnerCard>

          <div className="space-y-2">
            <p className="text-xs font-bold">Display Count</p>
            <input
              type="range"
              min="1"
              max="10"
              value={config.displayCount}
              onChange={(e) =>
                updateWidget(widget.id, {
                  config: { ...config, displayCount: parseInt(e.target.value) },
                })
              }
              className="w-full"
            />
            <div className="flex justify-between text-xxs font-bold text-slate-400">
              <span>Show {config.displayCount} students</span>
              <span>Max 10</span>
            </div>
          </div>
        </section>

        {/* Visual Styling */}
        <section className="space-y-4">
          <SettingsLabel as="span" id={visualStyleLabelId}>
            Visual Style
          </SettingsLabel>

          <div
            className="grid grid-cols-5 gap-2"
            role="radiogroup"
            aria-labelledby={visualStyleLabelId}
            onKeyDown={(e) =>
              handleRadioGroupKeyDown(e, THEME_COLORS, selectThemeColor)
            }
          >
            {THEME_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                role="radio"
                aria-checked={config.styling.themeColor === color.value}
                tabIndex={config.styling.themeColor === color.value ? 0 : -1}
                onClick={() => selectThemeColor(color)}
                className={`h-8 rounded-lg border-2 transition-all ${config.styling.themeColor === color.value ? 'border-brand-gray-darkest scale-110 shadow-sm' : 'border-transparent'}`}
                style={{ backgroundColor: color.value }}
                aria-label={`Theme color ${color.name}`}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
