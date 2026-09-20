import React, { useEffect, useState } from 'react';
import { Check, Copy, Plus, RefreshCcw, Trash2, Users } from 'lucide-react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { NextUpConfig, NextUpQueueItem, NextUpSession } from '@/types';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useRosterGroupsGate } from '@/hooks/useRosterGroupsGate';
import { RosterGroupSelect } from '@/components/common/RosterGroupSelect';
import { handleRadioGroupKeyDown } from '@/components/common/radioGroupKeyNav';
import { rosterGroupMemberIds } from '@/utils/rosterGroups';

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
] as const;

export const NextUpSessionField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const config = ctx.config as unknown as NextUpConfig;
  const { user } = useAuth();
  const { driveService } = useGoogleDrive();
  const { rosters, activeRosterId, addToast } = useDashboard();
  const { showAlert, showConfirm, showPrompt } = useDialog();
  const rosterGroupsEnabled = useRosterGroupsGate();
  const [importGroupId, setImportGroupId] = useState<string | null>(null);
  const [existingFiles, setExistingFiles] = useState<
    { id: string; name: string }[]
  >([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [copied, setCopied] = useState(false);
  const activeRoster = rosters.find((roster) => roster.id === activeRosterId);

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
          files.map((file) => ({
            id: file.id,
            name: file.name.replace('.json', ''),
          }))
        );
      } catch (error) {
        console.error('Failed to load existing queues:', error);
      } finally {
        setLoadingFiles(false);
      }
    };
    void loadFiles();
  }, [driveService]);

  const startSession = async (kind: 'new' | 'existing', id?: string) => {
    if (!driveService || !user) return;
    let fileId = id;
    let name = '';

    if (kind === 'new') {
      const title = await showPrompt(
        ctx.t('widgetSettings.nextUp.newQueuePrompt'),
        {
          title: ctx.t('widgetSettings.nextUp.newQueueTitle'),
          placeholder: ctx.t('widgetSettings.nextUp.newQueuePlaceholder'),
          confirmLabel: ctx.t('widgetSettings.nextUp.create'),
        }
      );
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
        await showAlert(ctx.t('widgetSettings.nextUp.driveCreateError'), {
          title: ctx.t('widgetSettings.nextUp.driveErrorTitle'),
          variant: 'error',
        });
        return;
      }
    } else {
      name =
        existingFiles.find((file) => file.id === id)?.name ??
        ctx.t('widgetSettings.nextUp.restoredSession');
    }

    if (!fileId) return;
    try {
      const safeWidgetId = ctx.widget.id.replace(/[^a-zA-Z0-9_-]/g, '');
      const sessionData: NextUpSession = {
        id: ctx.widget.id,
        teacherUid: user.uid,
        sessionName: name,
        activeDriveFileId: fileId,
        isActive: true,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      };
      await setDoc(
        doc(db, SESSIONS_COLLECTION, `${user.uid}_${safeWidgetId}`),
        sessionData
      );
      ctx.updateConfig({
        activeDriveFileId: fileId,
        sessionName: name,
        isActive: true,
        createdAt: sessionData.createdAt,
      });
    } catch (error) {
      console.error('[NextUp] Failed to start session:', error);
      await showAlert(ctx.t('widgetSettings.nextUp.sessionStartError'), {
        title: ctx.t('widgetSettings.nextUp.sessionErrorTitle'),
        variant: 'error',
      });
    }
  };

  const endSession = async (save: boolean) => {
    const confirmed = await showConfirm(
      ctx.t(
        save
          ? 'widgetSettings.nextUp.endSaveConfirm'
          : 'widgetSettings.nextUp.endDeleteConfirm'
      ),
      {
        title: ctx.t(
          save
            ? 'widgetSettings.nextUp.endSession'
            : 'widgetSettings.nextUp.endDeleteTitle'
        ),
        variant: save ? 'info' : 'danger',
        confirmLabel: ctx.t(
          save
            ? 'widgetSettings.nextUp.endAndKeep'
            : 'widgetSettings.nextUp.endAndDelete'
        ),
      }
    );
    if (!confirmed) return;

    if (!save && config.activeDriveFileId && driveService) {
      void driveService
        .deleteFile(config.activeDriveFileId)
        .catch(console.error);
    }
    if (user) {
      const safeWidgetId = ctx.widget.id.replace(/[^a-zA-Z0-9_-]/g, '');
      await updateDoc(
        doc(db, SESSIONS_COLLECTION, `${user.uid}_${safeWidgetId}`),
        { isActive: false }
      ).catch(console.error);
    }
    ctx.updateConfig({
      isActive: false,
      activeDriveFileId: null,
      sessionName: null,
    });
  };

  const copyLink = () => {
    if (!user) return;
    const safeWidgetId = ctx.widget.id.replace(/[^a-zA-Z0-9_-]/g, '');
    void navigator.clipboard.writeText(
      `${window.location.origin}/nextup?id=${user.uid}_${safeWidgetId}`
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const importRoster = async () => {
    if (!activeRosterId) {
      addToast(ctx.t('widgetSettings.nextUp.noActiveClass'), 'error');
      return;
    }
    const roster = rosters.find((item) => item.id === activeRosterId);
    if (!roster || roster.students.length === 0) {
      addToast(ctx.t('widgetSettings.nextUp.emptyClass'), 'error');
      return;
    }
    if (!config.activeDriveFileId || !driveService) {
      addToast(ctx.t('widgetSettings.nextUp.noActiveDriveFile'), 'error');
      return;
    }
    const memberIds = rosterGroupMemberIds(
      roster,
      importGroupId,
      rosterGroupsEnabled
    );
    const source = memberIds
      ? roster.students.filter((student) => memberIds.has(student.id))
      : roster.students;
    if (source.length === 0) {
      addToast(ctx.t('widgetSettings.nextUp.emptyGroup'), 'error');
      return;
    }
    const confirmed = await showConfirm(
      ctx.t('widgetSettings.nextUp.importConfirm', {
        count: source.length,
        roster: roster.name,
      }),
      {
        title: ctx.t('widgetSettings.nextUp.importClass'),
        variant: 'warning',
        confirmLabel: ctx.t('widgetSettings.nextUp.import'),
      }
    );
    if (!confirmed) return;

    const students = source.slice(0, 500);
    const queue: NextUpQueueItem[] = students.map((student, index) => ({
      id: crypto.randomUUID(),
      name: `${student.firstName} ${student.lastName}`.trim(),
      status: index === 0 ? 'active' : 'waiting',
      joinedAt: Date.now(),
    }));
    try {
      await driveService.updateFileContent(
        config.activeDriveFileId,
        new Blob([JSON.stringify(queue)], { type: 'application/json' })
      );
      ctx.updateConfig({ lastUpdated: Date.now() });
      addToast(
        ctx.t(
          source.length > 500
            ? 'widgetSettings.nextUp.importedTruncated'
            : 'widgetSettings.nextUp.importedStudents',
          { count: queue.length }
        ),
        source.length > 500 ? 'warning' : 'success'
      );
    } catch (error) {
      console.error('Failed to import roster to queue:', error);
      addToast(ctx.t('widgetSettings.nextUp.importError'), 'error');
    }
  };

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-3"
    >
      {!config.isActive ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void startSession('new')}
            className="flex flex-col items-center justify-center rounded-xl border-2 border-emerald-100 bg-emerald-50 p-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
          >
            <Plus className="mb-1 h-5 w-5" />
            {ctx.t('widgetSettings.nextUp.newQueue')}
          </button>
          <label className="relative flex flex-col items-center justify-center rounded-xl border-2 border-blue-100 bg-blue-50 p-3 text-xs font-bold text-blue-700">
            <RefreshCcw className="mb-1 h-5 w-5" />
            {ctx.t('widgetSettings.nextUp.loadExisting')}
            <select
              aria-label={ctx.t('widgetSettings.nextUp.loadExisting')}
              disabled={loadingFiles || existingFiles.length === 0}
              defaultValue=""
              onChange={(event) =>
                void startSession('existing', event.target.value)
              }
              className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
            >
              <option value="" disabled>
                {ctx.t('widgetSettings.nextUp.selectFile')}
              </option>
              {existingFiles.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 p-3">
            <div className="min-w-0">
              <p className="text-xxs font-black uppercase tracking-wider text-emerald-700">
                {ctx.t('widgetSettings.nextUp.liveSession')}
              </p>
              <p className="truncate text-sm font-bold text-emerald-900">
                {config.sessionName}
              </p>
            </div>
            <button
              type="button"
              onClick={copyLink}
              title={ctx.t('widgetSettings.nextUp.copyStudentLink')}
              className="rounded-lg border border-emerald-100 bg-white p-2 text-emerald-700 hover:bg-emerald-100"
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
          {rosterGroupsEnabled && activeRoster && (
            <RosterGroupSelect
              roster={activeRoster}
              value={importGroupId}
              onChange={setImportGroupId}
              wholeClassLabel={ctx.t('widgetSettings.nextUp.wholeClass')}
              ariaLabel={ctx.t('widgetSettings.nextUp.importScope')}
            />
          )}
          <button
            type="button"
            onClick={() => void importRoster()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-indigo-100 bg-indigo-50 p-3 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
          >
            <Users className="h-4 w-4" />
            {ctx.t('widgetSettings.nextUp.importActiveClass')}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void endSession(true)}
              className="rounded-xl border-2 border-slate-100 bg-white p-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              {ctx.t('widgetSettings.nextUp.endAndSave')}
            </button>
            <button
              type="button"
              onClick={() => void endSession(false)}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-red-100 bg-red-50 p-3 text-xs font-bold text-red-700 hover:bg-red-100"
            >
              <Trash2 className="h-4 w-4" />
              {ctx.t('widgetSettings.nextUp.discard')}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export const NextUpThemeField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const config = ctx.config as unknown as NextUpConfig;
  const selected = config.styling?.themeColor ?? '#2d3f89';
  const selectedIndex = THEME_COLORS.findIndex(
    (color) => color.value === selected
  );

  return (
    <div
      id={ctx.id}
      role="radiogroup"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      onKeyDown={(event) =>
        handleRadioGroupKeyDown(event, THEME_COLORS, (color) =>
          ctx.updateConfig({
            styling: {
              ...config.styling,
              themeColor: color.value,
            },
          })
        )
      }
      className="grid grid-cols-4 gap-2"
    >
      {THEME_COLORS.map((color, index) => (
        <button
          key={color.value}
          type="button"
          role="radio"
          aria-checked={selected === color.value}
          tabIndex={
            selected === color.value || (selectedIndex < 0 && index === 0)
              ? 0
              : -1
          }
          aria-label={ctx.t('widgetSettings.nextUp.themeColor', {
            color: color.name,
          })}
          onClick={() =>
            ctx.updateConfig({
              styling: {
                ...config.styling,
                themeColor: color.value,
              },
            })
          }
          className={`h-8 rounded-lg border-2 transition-transform ${
            selected === color.value
              ? 'scale-110 border-slate-900 shadow-sm'
              : 'border-transparent'
          }`}
          style={{ backgroundColor: color.value }}
        />
      ))}
    </div>
  );
};
