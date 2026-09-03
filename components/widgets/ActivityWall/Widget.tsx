// Activity Wall front face — a live preview of the active wall plus its toolbar.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  CloudOff,
  Copy,
  ExternalLink,
  LayoutGrid,
  LibraryBig,
  MoreHorizontal,
  QrCode,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  ActivityWallConfig,
  ActivityWallLibraryEntry,
  WidgetData,
} from '@/types';
import {
  useDashboardActions,
  useIsActiveBoardReadOnly,
} from '@/context/dashboardCanvasStore';
import { useAuth } from '@/context/useAuth';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useActivityWallLibrary } from '@/hooks/useActivityWallLibrary';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { LayoutRouter } from '@/components/activityWall/render';
import { visibleSubmissions } from '@/components/activityWall/render/scale';
import { requestAndExchangeAuthCode } from '@/utils/googleOAuthRefresh';
import {
  buildGalleryLink,
  buildStudentWallLink,
} from '@/utils/activityWallLinks';
import { WallEditorModal } from './editor/WallEditorModal';
import { LAYOUT_OPTIONS } from './editor/layoutOptions';
import { WallLibraryModal } from './WallLibraryModal';
import { ModerationDrawer } from './ModerationDrawer';
import { ActivityWallShareModal } from './ShareModal';
import { useActivityWallSession } from './hooks/useActivityWallSession';
import { useLegacyActivityWallMigration } from './hooks/useLegacyActivityWallMigration';

const toolbarButtonClass =
  'inline-flex items-center justify-center rounded-lg border border-white/25 bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40';

/** Below this widget width the secondary toolbar actions collapse into one menu. */
const TOOLBAR_COMPACT_WIDTH = 460;

const layoutSketch = (entry: ActivityWallLibraryEntry): React.ReactNode =>
  LAYOUT_OPTIONS.find((option) => option.layout === entry.layout)?.sketch ??
  null;

export const ActivityWallWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addWidget, addToast } = useDashboardActions();
  const isActiveBoardReadOnly = useIsActiveBoardReadOnly();
  const { user, canAccessFeature } = useAuth();
  const canOfferAnonymousJoin = canAccessFeature('anonymous-join');
  const config = widget.config as ActivityWallConfig;

  const {
    activities: entries,
    loading: libraryLoading,
    saveActivity,
    deleteActivity,
  } = useActivityWallLibrary(user?.uid);

  const activeEntry = useMemo(
    () => entries.find((entry) => entry.id === config.activeActivityId) ?? null,
    [entries, config.activeActivityId]
  );

  const [editorEntry, setEditorEntry] = useState<
    ActivityWallLibraryEntry | null | undefined
  >(undefined);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [connectingDrive, setConnectingDrive] = useState(false);
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState(false);
  const toolbarMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(toolbarMenuRef, () => setToolbarMenuOpen(false));

  const clearLegacyActivities = useCallback(
    (widgetId: string) =>
      updateWidget(widgetId, { config: { activities: [] } }),
    [updateWidget]
  );

  useLegacyActivityWallMigration({
    uid: user?.uid,
    config,
    widgetId: widget.id,
    libraryLoading,
    libraryCount: entries.length,
    saveActivity,
    clearLegacyActivities,
    addToast,
  });

  const {
    sessionId,
    session,
    submissions,
    pendingCount,
    driveSync,
    latestShareCode,
    latestShareId,
    approve,
    reject,
    deletePost,
    movePost,
    pinPost,
    editPost,
    setAcceptingResponses,
  } = useActivityWallSession(user?.uid, activeEntry, saveActivity);

  const isOpenWall = activeEntry?.acceptingResponses !== false;
  const visibleCount = visibleSubmissions(submissions, 'widget').length;

  const studentUrl = useMemo(() => {
    if (!sessionId || !activeEntry) return '';
    return buildStudentWallLink(
      window.location.origin,
      sessionId,
      activeEntry.allowGuests ?? false
    );
  }, [activeEntry, sessionId]);

  const galleryUrl = useMemo(() => {
    if (latestShareCode)
      return `${window.location.origin}/r/${latestShareCode}`;
    if (latestShareId)
      return buildGalleryLink(window.location.origin, latestShareId);
    return '';
  }, [latestShareCode, latestShareId]);

  const setActiveEntry = useCallback(
    (entryId: string | null) => {
      updateWidget(widget.id, { config: { activeActivityId: entryId } });
    },
    [updateWidget, widget.id]
  );

  const toggleOpenClosed = useCallback(() => {
    if (!activeEntry) return;
    void setAcceptingResponses(!isOpenWall).catch((err) => {
      console.error('[ActivityWall] Failed to toggle wall state:', err);
      addToast('Could not change the wall state.', 'error');
    });
  }, [activeEntry, addToast, isOpenWall, setAcceptingResponses]);

  const copyStudentLink = useCallback(async () => {
    if (!studentUrl) return;
    try {
      await navigator.clipboard.writeText(studentUrl);
      addToast('Student link copied!', 'success');
    } catch {
      addToast('Could not copy link. Please copy manually.', 'error');
    }
  }, [addToast, studentUrl]);

  const spawnQrWidget = useCallback(() => {
    if (!studentUrl) return;
    addWidget('qr', {
      w: 200,
      h: 250,
      config: { url: studentUrl, showUrl: false },
    });
    addToast('QR sticker added to board.', 'success');
  }, [addToast, addWidget, studentUrl]);

  const duplicateWall = useCallback(
    async (entry: ActivityWallLibraryEntry) => {
      const now = Date.now();
      try {
        await saveActivity({
          ...entry,
          id: crypto.randomUUID(),
          title: `${entry.title || 'Untitled wall'} (copy)`,
          createdAt: now,
          updatedAt: now,
        });
        addToast('Wall duplicated.', 'success');
      } catch (err) {
        console.error('[ActivityWall] Failed to duplicate wall:', err);
        addToast('Could not duplicate the wall.', 'error');
      }
    },
    [addToast, saveActivity]
  );

  const removeWall = useCallback(
    async (entryId: string) => {
      await deleteActivity(entryId);
      if (config.activeActivityId === entryId) setActiveEntry(null);
    },
    [config.activeActivityId, deleteActivity, setActiveEntry]
  );

  const connectDrive = useCallback(async () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
      | string
      | undefined;
    if (!clientId) {
      addToast('Google Drive sign-in is not configured.', 'error');
      return;
    }
    setConnectingDrive(true);
    try {
      const outcome = await requestAndExchangeAuthCode(
        clientId,
        user?.email ?? undefined
      );
      if (outcome.kind === 'success') {
        addToast(
          'Google Drive connected. Photos will sync shortly.',
          'success'
        );
      } else if (outcome.kind !== 'cancelled') {
        addToast('Could not connect Google Drive.', 'error');
      }
    } finally {
      setConnectingDrive(false);
    }
  }, [addToast, user?.email]);

  const driveIssues = driveSync.failed + driveSync.lost;

  const compactToolbar = widget.w < TOOLBAR_COMPACT_WIDTH;

  const iconButtonSize = {
    width: 'min(28px, 7.5cqmin)',
    height: 'min(28px, 7.5cqmin)',
  };

  const secondaryActions: {
    label: string;
    icon: LucideIcon;
    run: () => void;
    disabled: boolean;
  }[] = [
    ...(canOfferAnonymousJoin
      ? [
          {
            label: 'Copy student link',
            icon: Copy,
            run: () => void copyStudentLink(),
            disabled: false,
          },
          {
            label: 'Add join QR to board',
            icon: QrCode,
            run: spawnQrWidget,
            disabled: isActiveBoardReadOnly,
          },
        ]
      : []),
    {
      label: 'Share gallery',
      icon: Share2,
      run: () => setShareOpen(true),
      disabled: false,
    },
    ...(galleryUrl
      ? [
          {
            label: 'Open gallery',
            icon: ExternalLink,
            run: () => window.open(galleryUrl, '_blank', 'noopener'),
            disabled: false,
          },
        ]
      : []),
    {
      label: 'Open wall library',
      icon: LibraryBig,
      run: () => setLibraryOpen(true),
      disabled: false,
    },
  ];

  const header = activeEntry && (
    <div
      className="flex items-center justify-between border-b border-white/15 bg-slate-900/70 backdrop-blur-sm"
      style={{
        padding: 'min(8px, 2cqmin) min(10px, 2.5cqmin)',
        gap: 'min(8px, 2cqmin)',
      }}
    >
      <div
        className="flex min-w-0 items-center"
        style={{ gap: 'min(8px, 2cqmin)' }}
      >
        <span
          className="shrink-0 text-slate-200"
          style={{ width: 'min(28px, 8cqmin)', height: 'min(20px, 6cqmin)' }}
        >
          {layoutSketch(activeEntry)}
        </span>
        <h2
          className="truncate font-black uppercase tracking-wide text-slate-100"
          style={{ fontSize: 'min(13px, 4.5cqmin)' }}
        >
          {activeEntry.title || 'Untitled wall'}
        </h2>
      </div>

      <div
        className="flex shrink-0 items-center"
        style={{ gap: 'min(6px, 1.6cqmin)' }}
      >
        <button
          type="button"
          onClick={toggleOpenClosed}
          disabled={isActiveBoardReadOnly}
          aria-pressed={isOpenWall}
          className={`rounded-full font-black uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40 ${
            isOpenWall
              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
              : 'bg-slate-600 text-slate-100 hover:bg-slate-500'
          }`}
          style={{
            padding: 'min(4px, 1.2cqmin) min(10px, 2.6cqmin)',
            fontSize: 'min(10px, 3.2cqmin)',
          }}
        >
          {isOpenWall ? 'Open' : 'Closed'}
        </button>

        {activeEntry.moderationEnabled && (
          <button
            type="button"
            onClick={() => setModerationOpen(true)}
            aria-label={`Moderate posts, ${pendingCount} pending`}
            className={`${toolbarButtonClass} relative`}
            style={{ ...iconButtonSize, marginRight: 'min(4px, 1.2cqmin)' }}
          >
            <ShieldCheck style={{ width: '60%', height: '60%' }} />
            {pendingCount > 0 && (
              <span
                className="absolute rounded-full bg-rose-500 font-black text-white"
                style={{
                  right: 'max(-4px, -1.2cqmin)',
                  top: 'max(-4px, -1.2cqmin)',
                  fontSize: 'min(9px, 2.8cqmin)',
                  padding: '0 min(4px, 1.2cqmin)',
                }}
              >
                {pendingCount}
              </span>
            )}
          </button>
        )}

        {compactToolbar ? (
          <div className="relative" ref={toolbarMenuRef}>
            <button
              type="button"
              onClick={() => setToolbarMenuOpen((open) => !open)}
              aria-label="More wall actions"
              aria-expanded={toolbarMenuOpen}
              aria-haspopup="menu"
              className={toolbarButtonClass}
              style={iconButtonSize}
            >
              <MoreHorizontal style={{ width: '55%', height: '55%' }} />
            </button>
            {toolbarMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-white/15 bg-slate-900/95 py-1 shadow-xl backdrop-blur-md"
                style={{ minWidth: 'min(176px, 55cqw)' }}
              >
                {secondaryActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    role="menuitem"
                    disabled={action.disabled}
                    onClick={() => {
                      setToolbarMenuOpen(false);
                      action.run();
                    }}
                    className="flex w-full items-center text-left font-semibold text-slate-200 transition-colors hover:bg-white/10 focus:outline-none focus-visible:bg-white/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 disabled:opacity-40"
                    style={{
                      gap: 'min(8px, 2cqmin)',
                      padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
                      fontSize: 'min(14px, 5.5cqmin)',
                    }}
                  >
                    <action.icon
                      aria-hidden="true"
                      style={{
                        width: 'min(16px, 5cqmin)',
                        height: 'min(16px, 5cqmin)',
                      }}
                    />
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          secondaryActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.run}
              disabled={action.disabled}
              aria-label={action.label}
              className={toolbarButtonClass}
              style={iconButtonSize}
            >
              <action.icon style={{ width: '55%', height: '55%' }} />
            </button>
          ))
        )}
      </div>
    </div>
  );

  const driveBanner = activeEntry &&
    (driveIssues > 0 || driveSync.needsConsent > 0) && (
      <div
        className="flex items-center justify-between border-b border-amber-400/40 bg-amber-500/15 text-amber-100"
        style={{
          padding: 'min(6px, 1.6cqmin) min(10px, 2.5cqmin)',
          gap: 'min(8px, 2cqmin)',
          fontSize: 'min(11px, 3.4cqmin)',
        }}
      >
        <span
          className="flex min-w-0 items-center"
          style={{ gap: 'min(6px, 1.6cqmin)' }}
        >
          <CloudOff
            aria-hidden="true"
            style={{ width: 'min(14px, 4cqmin)', height: 'min(14px, 4cqmin)' }}
          />
          <span className="truncate">
            {driveSync.needsConsent > 0
              ? `${driveSync.needsConsent} upload${driveSync.needsConsent === 1 ? '' : 's'} waiting on Google Drive access.`
              : `${driveIssues} upload${driveIssues === 1 ? '' : 's'} did not reach Drive.`}
          </span>
        </span>
        {driveSync.needsConsent > 0 && (
          <button
            type="button"
            onClick={() => void connectDrive()}
            disabled={connectingDrive}
            className="shrink-0 rounded-lg bg-amber-400 font-bold text-amber-950 transition-colors hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50"
            style={{
              padding: 'min(3px, 1cqmin) min(8px, 2cqmin)',
              fontSize: 'min(10px, 3.2cqmin)',
            }}
          >
            Connect Google Drive
          </button>
        )}
      </div>
    );

  const body = !activeEntry ? (
    <ScaledEmptyState
      icon={LayoutGrid}
      title="Choose a wall"
      subtitle="Open the library to pick or create an Activity Wall."
      action={
        <button
          type="button"
          onClick={() => setLibraryOpen(true)}
          className="rounded-lg bg-brand-blue-primary font-bold text-white transition-colors hover:bg-brand-blue-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          style={{
            padding: 'min(8px, 2cqmin) min(14px, 3.4cqmin)',
            fontSize: 'min(12px, 3.8cqmin)',
          }}
        >
          Open library
        </button>
      }
    />
  ) : visibleCount === 0 ? (
    <ScaledEmptyState
      icon={LayoutGrid}
      title={
        pendingCount > 0
          ? `${pendingCount} post${pendingCount === 1 ? '' : 's'} waiting for review`
          : 'No posts yet'
      }
      subtitle={
        pendingCount > 0
          ? 'Approve them to show them on the board.'
          : isOpenWall
            ? 'Share the student link to start collecting posts.'
            : 'This wall is closed. Reopen it to collect posts.'
      }
      action={
        pendingCount > 0 ? (
          <button
            type="button"
            onClick={() => setModerationOpen(true)}
            className="rounded-lg bg-brand-blue-primary font-bold text-white transition-colors hover:bg-brand-blue-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            style={{
              padding: 'min(8px, 2cqmin) min(14px, 3.4cqmin)',
              fontSize: 'min(12px, 3.8cqmin)',
            }}
          >
            Review posts
          </button>
        ) : undefined
      }
    />
  ) : (
    session && (
      <LayoutRouter
        session={session}
        submissions={submissions}
        mode="widget"
        showNames={activeEntry.showNames ?? false}
        onApprove={(id) => void approve(id)}
        onReject={(id) => void reject(id)}
        onDelete={(id) => void deletePost(id)}
        onPin={(id, pinned) => void pinPost(id, pinned)}
        onMove={(id, patch) => void movePost(id, patch)}
      />
    )
  );

  return (
    <>
      <WidgetLayout
        padding="p-0"
        content={
          <div className="flex h-full w-full flex-col overflow-hidden">
            {header}
            {driveBanner}
            <div className="min-h-0 flex-1">{body}</div>
          </div>
        }
      />

      {editorEntry !== undefined && (
        <WallEditorModal
          open
          entry={editorEntry}
          onClose={() => setEditorEntry(undefined)}
          onSaved={(entry) => {
            setEditorEntry(undefined);
            setActiveEntry(entry.id);
            setLibraryOpen(false);
          }}
        />
      )}

      <WallLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        uid={user?.uid}
        entries={entries}
        activeEntryId={config.activeActivityId ?? null}
        readOnly={isActiveBoardReadOnly}
        onOpenOnBoard={(entryId) => {
          setActiveEntry(entryId);
          setLibraryOpen(false);
        }}
        onCreate={() => setEditorEntry(null)}
        onEdit={(entry) => setEditorEntry(entry)}
        onDuplicate={duplicateWall}
        onDelete={removeWall}
        addToast={addToast}
        confirm={(message) => window.confirm(message)}
      />

      <ModerationDrawer
        open={moderationOpen}
        onClose={() => setModerationOpen(false)}
        submissions={submissions}
        onApprove={(id) => void approve(id)}
        onReject={(id) => void reject(id)}
        onDelete={(id) => void deletePost(id)}
        onPin={(id, pinned) => void pinPost(id, pinned)}
        onEdit={(id, changes) => void editPost(id, changes)}
      />

      <ActivityWallShareModal
        key={`${activeEntry?.id ?? 'none'}:${shareOpen}`}
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        entry={activeEntry}
        sessionId={sessionId}
        teacherUid={user?.uid ?? null}
        teacherEmail={user?.email ?? null}
      />
    </>
  );
};
