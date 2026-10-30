// Activity Wall front face — a live preview of the active wall plus its toolbar.

import { useClaudeReview } from '@/hooks/useClaudeReview';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  CloudOff,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  LayoutGrid,
  LibraryBig,
  MoreHorizontal,
  Pencil,
  QrCode,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  ActivityWallConfig,
  ActivityWallLibraryEntry,
  ActivityWallSubmission,
  WidgetData,
} from '@/types';
import type { WallPlacement } from '@/components/activityWall/render';
import { ComposerSheet } from '@/components/activityWall/submission/ComposerSheet';
import {
  PostSubmitError,
  createPost,
  updatePost,
  type PostDraft,
} from '@/components/activityWall/submission/submitPost';
import {
  useBoardLinkedShareHostUid,
  useBoardLinkedShareId,
} from '@/context/boardLinkedShare';
import {
  useDashboardActions,
  useGlobalStyle,
  useIsActiveBoardReadOnly,
} from '@/context/dashboardCanvasStore';
import {
  useLinkedShareHost,
  useLinkedShareMemberName,
} from '@/hooks/useLinkedShareHost';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useClickOutside } from '@/hooks/useClickOutside';
import { getFontClass, hexToRgba } from '@/utils/styles';
import { pickReadableForeground } from '@/utils/collectionColor';
import { useActivityWallLibrary } from '@/hooks/useActivityWallLibrary';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import {
  LayoutRouter,
  WALL_IMAGE_SIZE_LABEL,
  isWallImageSize,
  nextWallImageSize,
} from '@/components/activityWall/render';
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
import { useLinkedBoardActivityWall } from './hooks/useLinkedBoardActivityWall';
import {
  diffSharedWallEdit,
  saveSharedActivityWall,
  sharedWallClassLock,
} from './sharedWallEdit';
import { normalizeActivityWallLibraryEntry } from '@/utils/activityWallNormalize';
import { useSubShareActivityWall } from './useSubShareActivityWall';
import { useLegacyActivityWallMigration } from './hooks/useLegacyActivityWallMigration';
import { tourAttr } from '@/config/tourAnchors';
import { useTourMaterialEditor } from '@/components/tours/tourMaterials';

/** Name stamped on teacher posts; falls back to the email handle. */
const EMPTY_POSTS: ActivityWallSubmission[] = [];

const teacherLabel = (displayName: string | null, email: string | null) => {
  const name = displayName?.trim();
  if (name) return name;
  const handle = email?.split('@')[0]?.trim();
  if (handle) return handle;
  return 'Teacher';
};

const toolbarButtonClass =
  'inline-flex items-center justify-center rounded-lg border border-white/25 bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40';

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
  const { showConfirm } = useDialog();
  const claudeReview = useClaudeReview('activity_wall_activities');
  const canOfferAnonymousJoin = canAccessFeature('anonymous-join');
  const config = widget.config as ActivityWallConfig;
  const imageSize = isWallImageSize(config.imageSize)
    ? config.imageSize
    : 'medium';
  const globalStyle = useGlobalStyle();
  const fontClass = getFontClass(
    config.fontFamily ?? 'global',
    globalStyle.fontFamily
  );
  const cardColor = config.cardColor ?? '#0f172a';
  const cardStyle = useMemo(
    () => ({
      background: hexToRgba(cardColor, config.cardOpacity ?? 0.7),
      color: config.fontColor ?? pickReadableForeground(cardColor),
    }),
    [cardColor, config.cardOpacity, config.fontColor]
  );

  // In a share the wall is the teacher's, bundled: their definition is in
  // their own `users/` tree and the session doc is keyed on their uid, so a
  // substitute reads neither, and the library behind this widget is the
  // substitute's own and empty.
  const shared = useSubShareActivityWall(config.activeActivityId);
  const inSubShare = shared.active;

  const {
    activities: entries,
    loading: libraryLoading,
    saveActivity,
    deleteActivity,
  } = useActivityWallLibrary(inSubShare ? undefined : user?.uid);

  const ownEntry = useMemo(
    () => entries.find((entry) => entry.id === config.activeActivityId) ?? null,
    [entries, config.activeActivityId]
  );

  // On a Synced or View-Only board the wall may be in another member's library.
  const boardShareId = useBoardLinkedShareId();
  const stampedOwner = config.activeActivityOwnerUid ?? null;
  // The host recorded at join wins; the live share doc must still exist and agree (boards joined earlier use it alone).
  const recordedHostUid = useBoardLinkedShareHostUid();
  const liveHostUid = useLinkedShareHost(inSubShare ? null : boardShareId);
  const shareHostUid =
    inSubShare || !liveHostUid
      ? null
      : recordedHostUid && recordedHostUid !== liveHostUid
        ? null
        : liveHostUid;
  // The owner lists the board as "shareId/hostUid"; rules check the host so a re-created share id grants nothing.
  const boardShareEntry =
    boardShareId && shareHostUid ? `${boardShareId}/${shareHostUid}` : null;
  const foreignOwnerUid =
    inSubShare || !boardShareId || ownEntry
      ? null
      : stampedOwner && stampedOwner !== user?.uid
        ? stampedOwner
        : !stampedOwner && shareHostUid !== user?.uid
          ? shareHostUid
          : null;
  const linked = useLinkedBoardActivityWall(
    foreignOwnerUid,
    config.activeActivityId ?? null,
    boardShareId,
    !isActiveBoardReadOnly
  );
  // Someone else's wall: a sub share or another board member's.
  const inShare = inSubShare || linked.active;
  // The owner, or a co-teacher on the board, moderates and posts.
  const canModerate = !inShare || linked.moderating;
  const ownerName = useLinkedShareMemberName(
    linked.active ? boardShareId : null,
    linked.active ? foreignOwnerUid : null
  );
  // A Synced colleague edits the owner's wall through the server, which re-checks the share.
  const canEditLinked =
    linked.active &&
    !isActiveBoardReadOnly &&
    !!foreignOwnerUid &&
    !!boardShareId;
  const [sharedEditBase, setSharedEditBase] =
    useState<ActivityWallLibraryEntry | null>(null);
  const saveLinkedEdit = useCallback(
    async (next: ActivityWallLibraryEntry) => {
      if (!sharedEditBase || !foreignOwnerUid || !boardShareId || !user) return;
      const diff = diffSharedWallEdit(
        normalizeActivityWallLibraryEntry(sharedEditBase.id, sharedEditBase),
        next,
        user.uid
      );
      if (Object.keys(diff.changes).length === 0 && !diff.myClassIds) return;
      await saveSharedActivityWall({
        shareId: boardShareId,
        ownerUid: foreignOwnerUid,
        activityId: sharedEditBase.id,
        ...diff,
      });
    },
    [boardShareId, foreignOwnerUid, sharedEditBase, user]
  );

  const activeEntry: ActivityWallLibraryEntry | null = inSubShare
    ? shared.entry
    : linked.active
      ? linked.entry
      : ownEntry;

  const [editorEntry, setEditorEntry] = useState<
    ActivityWallLibraryEntry | null | undefined
  >(undefined);
  const handleEditEntry = (entry: ActivityWallLibraryEntry) => {
    claudeReview.markReviewed(entry);
    setEditorEntry(entry);
  };
  // A live tour can open one of the teacher's walls in the editor.
  useTourMaterialEditor(widget.id, 'activity-wall', editorEntry?.id, (id) => {
    const entry = entries.find((e) => e.id === id);
    if (entry) setEditorEntry(entry);
  });
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [connectingDrive, setConnectingDrive] = useState(false);
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState(false);
  const [composer, setComposer] = useState<
    | { kind: 'create'; placement: WallPlacement }
    | { kind: 'edit'; post: ActivityWallSubmission }
    | null
  >(null);
  const [composerBusy, setComposerBusy] = useState(false);
  const [composerProgress, setComposerProgress] = useState<number | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const toolbarMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(toolbarMenuRef, () => setToolbarMenuOpen(false));

  const clearLegacyActivities = useCallback(
    (widgetId: string) =>
      updateWidget(widgetId, { config: { activities: [] } }),
    [updateWidget]
  );

  useLegacyActivityWallMigration({
    uid: inSubShare ? undefined : user?.uid,
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
    session: ownSession,
    submissions: ownSubmissions,
    pendingCount: ownPendingCount,
    driveSync,
    latestShareCode,
    latestShareId,
    approve: ownApprove,
    reject: ownReject,
    deletePost: ownDeletePost,
    movePost: ownMovePost,
    pinPost: ownPinPost,
    editPost: ownEditPost,
    setAcceptingResponses,
    setStudentsCanSeePosts,
    setTimelineDatesHidden,
  } = useActivityWallSession(
    inShare ? undefined : user?.uid,
    activeEntry,
    saveActivity,
    canAccessFeature('activity-wall-timeline-dates'),
    boardShareEntry
  );
  const session = inSubShare
    ? shared.session
    : linked.active
      ? linked.session
      : ownSession;
  // In a sub share the posts came along in the share's names file, which only
  // the named substitutes can read; the teacher's own session is unreadable here.
  const shownSubmissions = inSubShare
    ? (config.subSharePosts ?? EMPTY_POSTS)
    : linked.active
      ? linked.posts
      : ownSubmissions;
  // Moderation acts on whichever session is on the board: the owner's own or a co-teacher's.
  const submissions = linked.moderating ? linked.posts : ownSubmissions;
  const pendingCount = linked.moderating
    ? linked.pendingCount
    : ownPendingCount;
  const { approve, reject, deletePost, movePost, pinPost, editPost } =
    linked.moderating
      ? linked.actions
      : {
          approve: ownApprove,
          reject: ownReject,
          deletePost: ownDeletePost,
          movePost: ownMovePost,
          pinPost: ownPinPost,
          editPost: ownEditPost,
        };

  const isOpenWall = activeEntry?.acceptingResponses !== false;
  const isVisibleWall = activeEntry?.studentsCanSeePosts !== false;
  const visibleCount = visibleSubmissions(shownSubmissions, 'widget').length;

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
      // useWallBoardAccessCleanup closes the old wall to the board once no widget shows it.
      updateWidget(widget.id, {
        config: {
          activeActivityId: entryId,
          activeActivityOwnerUid: entryId ? (user?.uid ?? null) : null,
        },
      });
    },
    [updateWidget, user?.uid, widget.id]
  );

  const toggleOpenClosed = useCallback(() => {
    if (!activeEntry) return;
    void setAcceptingResponses(!isOpenWall).catch((err) => {
      console.error('[ActivityWall] Failed to toggle wall state:', err);
      addToast('Could not change the wall state.', 'error');
    });
  }, [activeEntry, addToast, isOpenWall, setAcceptingResponses]);

  const toggleVisibleHidden = useCallback(() => {
    if (!activeEntry) return;
    void setStudentsCanSeePosts(!isVisibleWall).catch((err) => {
      console.error('[ActivityWall] Failed to toggle wall visibility:', err);
      addToast('Could not change who can see posts.', 'error');
    });
  }, [activeEntry, addToast, isVisibleWall, setStudentsCanSeePosts]);

  // Storage takes uploads only from the owner, students and guests, so a co-teacher posts text and links.
  const composerSession = useMemo(
    () =>
      session && linked.moderating && composer?.kind === 'create'
        ? {
            ...session,
            allowedTypes: {
              photo: false,
              file: false,
              video: false,
              link: session.allowedTypes?.link === true,
            },
          }
        : session,
    [session, linked.moderating, composer?.kind]
  );

  const openTeacherComposer = useCallback((placement: WallPlacement = {}) => {
    setComposerError(null);
    setComposer({ kind: 'create', placement });
  }, []);

  const openTeacherEdit = useCallback(
    (submissionId: string) => {
      const post = submissions.find((entry) => entry.id === submissionId);
      if (!post) return;
      setComposerError(null);
      setComposer({ kind: 'edit', post });
    },
    [submissions]
  );

  const closeComposer = useCallback(() => {
    setComposer(null);
    setComposerProgress(null);
  }, []);

  const submitTeacherPost = useCallback(
    async (draft: PostDraft, placement: WallPlacement) => {
      if (!composer || !session || !user || composerBusy) return;
      setComposerBusy(true);
      setComposerError(null);
      try {
        if (composer.kind === 'edit') {
          // Rules keep a link post's URL with its owner; a co-teacher edits the rest.
          const editDraft =
            linked.moderating && composer.post.type === 'link'
              ? { ...draft, url: composer.post.content }
              : draft;
          await updatePost(session, composer.post.id, editDraft, placement);
          addToast('Post updated.', 'success');
        } else {
          await createPost({
            session,
            uid: user.uid,
            isGuest: false,
            participantLabel: teacherLabel(user.displayName, user.email),
            myPosts: [],
            draft,
            placement,
            onProgress: setComposerProgress,
            author: 'teacher',
          });
          addToast('Posted to the wall.', 'success');
        }
        closeComposer();
      } catch (err) {
        console.error('[ActivityWall] Teacher post failed:', err);
        setComposerError(
          err instanceof PostSubmitError
            ? err.message
            : 'Could not save the post. Please try again.'
        );
      } finally {
        setComposerBusy(false);
      }
    },
    [
      addToast,
      closeComposer,
      composer,
      composerBusy,
      linked.moderating,
      session,
      user,
    ]
  );

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
      string | undefined;
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
    tourAttrs: ReturnType<typeof tourAttr>;
  }[] = [
    ...(canOfferAnonymousJoin
      ? [
          {
            label: 'Copy student link',
            icon: Copy,
            run: () => void copyStudentLink(),
            disabled: false,
            tourAttrs: tourAttr(
              'activity-wall.copy-link',
              widget.id,
              widget.type
            ),
          },
          {
            label: 'Add join QR to board',
            icon: QrCode,
            run: spawnQrWidget,
            disabled: isActiveBoardReadOnly,
            tourAttrs: tourAttr('activity-wall.add-qr', widget.id, widget.type),
          },
        ]
      : []),
    {
      label: 'Share',
      icon: Share2,
      run: () => setShareOpen(true),
      disabled: false,
      tourAttrs: tourAttr('activity-wall.share', widget.id, widget.type),
    },
    ...(studentUrl
      ? [
          {
            label: 'Open student view',
            icon: ExternalLink,
            run: () => window.open(studentUrl, '_blank', 'noopener'),
            disabled: false,
            tourAttrs: tourAttr(
              'activity-wall.open-student-view',
              widget.id,
              widget.type
            ),
          },
        ]
      : []),
    {
      label: `Image size: ${WALL_IMAGE_SIZE_LABEL[imageSize]}`,
      icon: ImageIcon,
      run: () =>
        updateWidget(widget.id, {
          config: { ...config, imageSize: nextWallImageSize(imageSize) },
        }),
      disabled: isActiveBoardReadOnly,
      tourAttrs: tourAttr('activity-wall.image-size', widget.id, widget.type),
    },
    {
      label: 'Open wall library',
      icon: LibraryBig,
      run: () => setLibraryOpen(true),
      disabled: false,
      tourAttrs: tourAttr('activity-wall.library', widget.id, widget.type),
    },
  ];

  const moderateButton = activeEntry?.moderationEnabled && (
    <button
      type="button"
      {...tourAttr('activity-wall.moderate', widget.id, widget.type)}
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
  );

  const header = activeEntry && (
    <div
      className="flex items-center justify-between border-b border-white/15 bg-slate-900/70 backdrop-blur-xs"
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
        {ownerName && (
          <span
            className="min-w-0 shrink-2 truncate font-semibold text-slate-300"
            style={{ fontSize: 'min(11px, 3.8cqmin)' }}
          >
            Shared by {ownerName}
          </span>
        )}
      </div>

      {/* Every control here writes the teacher's wall or launches for them. */}
      {linked.moderating && moderateButton}
      {!inShare && (
        <div
          className="flex shrink-0 items-center"
          style={{ gap: 'min(6px, 1.6cqmin)' }}
        >
          <button
            type="button"
            {...tourAttr('activity-wall.toggle-open', widget.id, widget.type)}
            onClick={toggleOpenClosed}
            disabled={isActiveBoardReadOnly}
            aria-pressed={isOpenWall}
            className={`rounded-full font-black uppercase tracking-wider transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40 ${
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

          <button
            type="button"
            {...tourAttr('activity-wall.visibility', widget.id, widget.type)}
            onClick={toggleVisibleHidden}
            disabled={isActiveBoardReadOnly}
            aria-pressed={isVisibleWall}
            aria-label={
              isVisibleWall
                ? 'Posts visible to students. Hide posts from students'
                : 'Posts hidden from students. Show posts to students'
            }
            className={`rounded-full font-black uppercase tracking-wider transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40 ${
              isVisibleWall
                ? 'bg-sky-500 text-white hover:bg-sky-600'
                : 'bg-slate-600 text-slate-100 hover:bg-slate-500'
            }`}
            style={{
              padding: 'min(4px, 1.2cqmin) min(10px, 2.6cqmin)',
              fontSize: 'min(10px, 3.2cqmin)',
            }}
          >
            {isVisibleWall ? 'Visible' : 'Hidden'}
          </button>

          {moderateButton}

          {compactToolbar ? (
            <div className="relative" ref={toolbarMenuRef}>
              <button
                type="button"
                {...tourAttr(
                  'activity-wall.more-actions',
                  widget.id,
                  widget.type
                )}
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
                  className="absolute right-0 top-full z-20 overflow-hidden rounded-xl border border-white/15 bg-slate-900/95 shadow-xl backdrop-blur-md"
                  style={{
                    minWidth: 'min(176px, 55cqw)',
                    marginTop: 'min(4px, 1cqmin)',
                    paddingBlock: 'min(4px, 1cqmin)',
                  }}
                >
                  {secondaryActions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      role="menuitem"
                      {...action.tourAttrs}
                      disabled={action.disabled}
                      onClick={() => {
                        setToolbarMenuOpen(false);
                        action.run();
                      }}
                      className="flex w-full items-center text-left font-semibold text-slate-200 transition-colors hover:bg-white/10 focus:outline-hidden focus-visible:bg-white/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 disabled:opacity-40"
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
                {...action.tourAttrs}
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
      )}
      {canEditLinked && linked.editEntry && (
        <button
          type="button"
          {...tourAttr('activity-wall.edit-shared', widget.id, widget.type)}
          onClick={() => setSharedEditBase(linked.editEntry)}
          aria-label="Edit wall"
          title="Edit wall"
          className={`${toolbarButtonClass} shrink-0`}
          style={iconButtonSize}
        >
          <Pencil style={{ width: '55%', height: '55%' }} />
        </button>
      )}
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
            {...tourAttr('activity-wall.connect-drive', widget.id, widget.type)}
            onClick={() => void connectDrive()}
            disabled={connectingDrive}
            className="shrink-0 rounded-lg bg-amber-400 font-bold text-amber-950 transition-colors hover:bg-amber-300 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50"
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
    inSubShare ? (
      <ScaledEmptyState
        icon={LayoutGrid}
        title="No wall"
        subtitle="This wall did not come along with the share."
      />
    ) : (
      <ScaledEmptyState
        icon={LayoutGrid}
        title="Choose a wall"
        subtitle="Open the library to pick or create an Activity Wall."
        action={
          <button
            type="button"
            {...tourAttr(
              'activity-wall.empty-open-library',
              widget.id,
              widget.type
            )}
            onClick={() => setLibraryOpen(true)}
            className="rounded-lg bg-brand-blue-primary font-bold text-white transition-colors hover:bg-brand-blue-dark focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white/70"
            style={{
              padding: 'min(8px, 2cqmin) min(14px, 3.4cqmin)',
              fontSize: 'min(12px, 3.8cqmin)',
            }}
          >
            Open library
          </button>
        }
      />
    )
  ) : inSubShare && visibleCount === 0 ? (
    <ScaledEmptyState
      icon={LayoutGrid}
      title="No posts"
      subtitle="This wall had no approved posts when your teacher shared it."
    />
  ) : !canModerate && visibleCount === 0 ? (
    <ScaledEmptyState icon={LayoutGrid} title="No posts yet" />
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
            {...tourAttr('activity-wall.review-posts', widget.id, widget.type)}
            onClick={() => setModerationOpen(true)}
            className="rounded-lg bg-brand-blue-primary font-bold text-white transition-colors hover:bg-brand-blue-dark focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white/70"
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
      <div data-pii="" className={`h-full w-full ${fontClass}`}>
        <LayoutRouter
          session={session}
          submissions={shownSubmissions}
          mode="widget"
          showNames={activeEntry.showNames ?? false}
          imageSize={imageSize}
          cardStyle={cardStyle}
          onApprove={canModerate ? (id) => void approve(id) : undefined}
          onReject={canModerate ? (id) => void reject(id) : undefined}
          onDelete={canModerate ? (id) => void deletePost(id) : undefined}
          onPin={
            canModerate ? (id, pinned) => void pinPost(id, pinned) : undefined
          }
          onMove={
            canModerate ? (id, patch) => void movePost(id, patch) : undefined
          }
          onEdit={canModerate ? openTeacherEdit : undefined}
          tourWidgetId={widget.id}
          onToggleTimelineDates={
            inShare || isActiveBoardReadOnly
              ? undefined
              : (hidden) =>
                  void setTimelineDatesHidden(hidden).catch((err) => {
                    console.error(
                      '[ActivityWall] Failed to toggle dates:',
                      err
                    );
                    addToast('Could not change the dates.', 'error');
                  })
          }
          onAddAt={
            !canModerate || isActiveBoardReadOnly
              ? undefined
              : openTeacherComposer
          }
        />
      </div>
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

      {!inShare && editorEntry !== undefined && (
        <WallEditorModal
          open
          entry={editorEntry}
          widgetId={widget.id}
          widgetType={widget.type}
          onClose={() => setEditorEntry(undefined)}
          onSaved={(entry) => {
            setEditorEntry(undefined);
            setActiveEntry(entry.id);
            setLibraryOpen(false);
          }}
        />
      )}

      {canEditLinked && sharedEditBase && (
        <WallEditorModal
          open
          entry={sharedEditBase}
          widgetId={widget.id}
          widgetType={widget.type}
          onClose={() => setSharedEditBase(null)}
          onSaved={() => setSharedEditBase(null)}
          save={saveLinkedEdit}
          classLock={sharedWallClassLock(sharedEditBase, user?.uid ?? '')}
        />
      )}

      {!inShare && (
        <WallLibraryModal
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          uid={user?.uid}
          entries={entries}
          activeEntryId={config.activeActivityId ?? null}
          readOnly={isActiveBoardReadOnly}
          onOpenOnBoard={(entryId) => {
            const open = () => {
              setActiveEntry(entryId);
              setLibraryOpen(false);
            };
            const entry = entries.find((e) => e.id === entryId);
            if (entry) claudeReview.whenReviewed(entry, open, 'Open anyway');
            else open();
          }}
          onCreate={() => setEditorEntry(null)}
          onEdit={handleEditEntry}
          badgesFor={(entry) => {
            const review = claudeReview.badge(entry, () =>
              handleEditEntry(entry)
            );
            return review ? [review] : [];
          }}
          onDuplicate={duplicateWall}
          onDelete={removeWall}
          addToast={addToast}
          confirm={(message) =>
            showConfirm(message, {
              title: 'Delete',
              variant: 'danger',
              confirmLabel: 'Delete',
            })
          }
        />
      )}

      {canModerate && composer && composerSession && (
        <ComposerSheet
          key={composer.kind === 'edit' ? composer.post.id : 'create'}
          session={composerSession}
          placement={
            composer.kind === 'create' ? composer.placement : undefined
          }
          editing={composer.kind === 'edit' ? composer.post : undefined}
          onSubmit={(draft, placement) =>
            void submitTeacherPost(draft, placement)
          }
          onClose={closeComposer}
          busy={composerBusy}
          progress={composerProgress}
          error={composerError}
        />
      )}

      {canModerate && (
        <ModerationDrawer
          open={moderationOpen}
          onClose={() => setModerationOpen(false)}
          submissions={submissions}
          onApprove={(id) => void approve(id)}
          onReject={(id) => void reject(id)}
          onDelete={(id) => void deletePost(id)}
          onPin={(id, pinned) => void pinPost(id, pinned)}
          onEdit={(id, changes) => void editPost(id, changes)}
          sessionId={inShare ? null : sessionId}
        />
      )}

      {!inShare && (
        <ActivityWallShareModal
          key={`${activeEntry?.id ?? 'none'}:${shareOpen}`}
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
          entry={activeEntry}
          sessionId={sessionId}
          teacherUid={user?.uid ?? null}
          teacherEmail={user?.email ?? null}
          studentUrl={studentUrl}
          existingGalleryUrl={galleryUrl || undefined}
          onAddQr={
            canOfferAnonymousJoin && !isActiveBoardReadOnly
              ? spawnQrWidget
              : undefined
          }
        />
      )}
    </>
  );
};
