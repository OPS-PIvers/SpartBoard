/**
 * Read-only "gallery" view for an Activity Wall session's submissions.
 * Mounted at `/activity-wall/gallery/{shareId}`.
 *
 * The viewer is unauthenticated by design — we sign them in
 * anonymously via Firebase Auth so Firestore reads work, then load the
 * `shared_activity_walls/{shareId}` doc to discover which session to
 * read from plus which interactions (likes / comments / replies) the
 * teacher enabled. No submission UI is rendered; viewers see other
 * people's work only.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Image as ImageIcon } from 'lucide-react';
import { signInAnonymously, type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { useResolvedFirebaseUser } from '@/hooks/useResolvedFirebaseUser';
import {
  normalizeActivityWallSession,
  normalizeActivityWallSubmission,
} from '@/utils/activityWallNormalize';
import {
  LayoutRouter,
  WALL_IMAGE_SIZE_LABEL,
  isWallImageSize,
  nextWallImageSize,
  type WallImageSize,
  prepareSubmissions,
} from '@/components/activityWall/render';
import {
  makeEngagementFooter,
  useWallEngagement,
  type EngagementFlags,
  type WallEngagement,
} from '@/components/activityWall/engagement';

import type {
  ActivityWallIdentificationMode,
  ActivityWallSession,
  ActivityWallSubmission,
  SharedActivityWall,
} from '@/types';

const IMAGE_SIZE_STORAGE_KEY = 'activity_wall_gallery_image_size';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'expired' }
  | { kind: 'revoked' }
  | { kind: 'not-found' }
  // Firestore now denies reads on revoked/expired shares at the rules layer,
  // so the client can no longer inspect the doc to tell revoked from expired
  // from wrong-link — all three surface as `permission-denied`. We collapse
  // them into a single honest "no longer available" state rather than
  // mislabelling every denied read as a malformed/incorrect link.
  | { kind: 'unavailable' }
  | { kind: 'ready'; share: SharedActivityWall };

const isPermissionDenied = (err: unknown): boolean =>
  typeof err === 'object' &&
  err !== null &&
  (err as { code?: unknown }).code === 'permission-denied';

const isShareDoc = (raw: unknown): raw is SharedActivityWall => {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.sessionId === 'string' &&
    typeof r.originalAuthor === 'string' &&
    typeof r.title === 'string' &&
    typeof r.prompt === 'string' &&
    (r.mode === 'text' || r.mode === 'photo') &&
    (r.identificationMode === 'anonymous' ||
      r.identificationMode === 'name' ||
      r.identificationMode === 'pin' ||
      r.identificationMode === 'name-pin') &&
    typeof r.allowComments === 'boolean' &&
    typeof r.allowCommentResponses === 'boolean' &&
    typeof r.allowLikes === 'boolean' &&
    typeof r.createdAt === 'number' &&
    (r.expiresAt === null || typeof r.expiresAt === 'number')
  );
};

/** Session flags win once any of the three is set there; older shares keep their own. */
const resolveEngagementFlags = (
  session: ActivityWallSession | null,
  share: SharedActivityWall
): EngagementFlags => {
  const fromSession =
    session &&
    (session.allowLikes !== undefined ||
      session.allowComments !== undefined ||
      session.allowCommentResponses !== undefined);
  if (fromSession) {
    return {
      allowLikes: session.allowLikes ?? false,
      allowComments: session.allowComments ?? false,
      allowCommentResponses: session.allowCommentResponses ?? false,
    };
  }
  return {
    allowLikes: share.allowLikes,
    allowComments: share.allowComments,
    allowCommentResponses: share.allowCommentResponses,
  };
};

/**
 * Never signs in anonymously when a user already exists — waits for
 * Firebase Auth's first emission (`resolved`) before deciding, so a
 * signed-in teacher opening the gallery in the same tab keeps their
 * session instead of being silently swapped for an anonymous one.
 */
const useAnonymousFirebaseUser = (): User | null => {
  const { user, resolved } = useResolvedFirebaseUser();
  useEffect(() => {
    if (!resolved || user) return;
    void signInAnonymously(auth).catch((err) => {
      console.error('[ActivityWallGallery] Anonymous sign-in failed:', err);
    });
  }, [resolved, user]);
  return user;
};

/** Raw snapshot doc kept unnormalized so normalization can rerun once the session lands. */
interface RawSubmissionDoc {
  id: string;
  data: Partial<ActivityWallSubmission>;
}

const getShareIdFromPath = (): string | null => {
  const match = window.location.pathname.match(
    /^\/activity-wall\/gallery\/([^/?#]+)/
  );
  return match ? decodeURIComponent(match[1] ?? '') : null;
};

export const ActivityWallGalleryView: React.FC = () => {
  const shareId = useMemo(() => getShareIdFromPath(), []);
  const viewer = useAnonymousFirebaseUser();
  const [state, setState] = useState<LoadState>(
    shareId ? { kind: 'loading' } : { kind: 'not-found' }
  );
  const [rawSubmissions, setRawSubmissions] = useState<RawSubmissionDoc[]>([]);
  const [submissionsReady, setSubmissionsReady] = useState(false);
  const [session, setSession] = useState<ActivityWallSession | null>(null);
  const [driveSigninHint, setDriveSigninHint] = useState(false);

  // Load the share doc once. We don't subscribe — the share toggles are
  // effectively immutable (teachers re-share rather than edit), and
  // every additional snapshot multiplies traffic across the gallery's
  // viewers.
  useEffect(() => {
    if (!shareId || !viewer) return;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDoc(doc(db, 'shared_activity_walls', shareId));
        if (cancelled) return;
        if (!snap.exists()) {
          setState({ kind: 'not-found' });
          return;
        }
        const raw = snap.data();
        if (!isShareDoc(raw)) {
          setState({ kind: 'not-found' });
          return;
        }
        if (raw.revoked === true) {
          setState({ kind: 'revoked' });
          return;
        }
        if (raw.expiresAt !== null && raw.expiresAt <= Date.now()) {
          setState({ kind: 'expired' });
          return;
        }
        setState({ kind: 'ready', share: raw });
      } catch (err) {
        console.error('[ActivityWallGallery] Failed to load share doc:', err);
        if (cancelled) return;
        // A revoked/expired share (or a bad shareId) is rejected by the
        // Firestore rules as `permission-denied`. Surface the "no longer
        // available" copy for that case instead of the generic
        // malformed-link message.
        setState({
          kind: isPermissionDenied(err) ? 'unavailable' : 'not-found',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shareId, viewer]);

  // Subscribe to the underlying session's submissions. Firestore rules
  // unlock this read path because the parent session has
  // `publiclyShared: true`.
  useEffect(() => {
    if (state.kind !== 'ready' || !viewer) return;
    const { sessionId } = state.share;
    // Rules only expose approved posts on a published wall, so the filter is
    // required for the query to be authorized (not just cosmetic).
    const submissionsRef = query(
      collection(db, 'activity_wall_sessions', sessionId, 'submissions'),
      where('status', '==', 'approved')
    );
    const unsubscribe = onSnapshot(
      submissionsRef,
      (snap) => {
        setRawSubmissions(
          snap.docs.map((d) => ({
            id: d.id,
            data: d.data() as Partial<ActivityWallSubmission>,
          }))
        );
        setSubmissionsReady(true);
      },
      (err) => {
        console.error('[ActivityWallGallery] Submissions snapshot error:', err);
        setSubmissionsReady(true);
      }
    );
    return unsubscribe;
  }, [state, viewer]);

  // Subscribe to the session doc — the source of truth for layout,
  // appearance, and showNames. Until the first snapshot arrives, callers
  // fall back to a normalized-default session (derived at render time below)
  // so the wall can render immediately.
  useEffect(() => {
    if (state.kind !== 'ready' || !viewer) return;
    const { sessionId } = state.share;
    const unsubscribe = onSnapshot(
      doc(db, 'activity_wall_sessions', sessionId),
      (snap) => {
        if (!snap.exists()) return;
        setSession(
          normalizeActivityWallSession(
            sessionId,
            snap.data() as Partial<ActivityWallSession>
          )
        );
      },
      (err) => {
        console.error('[ActivityWallGallery] Session snapshot error:', err);
      }
    );
    return unsubscribe;
  }, [state, viewer]);

  const share = state.kind === 'ready' ? state.share : null;
  const flags = useMemo(
    () =>
      share
        ? resolveEngagementFlags(session, share)
        : {
            allowLikes: false,
            allowComments: false,
            allowCommentResponses: false,
          },
    [session, share]
  );
  const engagement = useWallEngagement(
    share && viewer ? share.sessionId : null,
    viewer?.uid ?? null,
    { likes: flags.allowLikes, comments: flags.allowComments }
  );

  // Derived (not stored) so a late session snapshot re-normalizes legacy
  // no-type photo posts instead of leaving them stuck as text.
  const visibleSubmissions = useMemo(
    () =>
      prepareSubmissions(
        rawSubmissions.map((d) =>
          normalizeActivityWallSubmission(
            d.id,
            d.data,
            session?.mode === 'photo'
          )
        ),
        'gallery'
      ),
    [rawSubmissions, session?.mode]
  );

  const driveVisibility = session?.driveVisibility;
  // Only an archived Drive photo failing to load implies a Drive sign-in issue.
  const handleMediaError = useCallback(
    (submission: ActivityWallSubmission) => {
      if (submission.archiveStatus !== 'archived') return;
      const isDomainPermission =
        submission.drivePermission !== undefined
          ? submission.drivePermission === 'domain'
          : driveVisibility === 'domain';
      if (isDomainPermission) setDriveSigninHint(true);
    },
    [driveVisibility]
  );

  if (!shareId || state.kind === 'not-found') {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 text-center">
        This gallery isn&apos;t available. The link may be incorrect or has been
        removed.
      </div>
    );
  }

  if (state.kind === 'expired') {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 text-center">
        This gallery link has expired.
      </div>
    );
  }

  if (state.kind === 'revoked') {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 text-center">
        This gallery link has been turned off by the teacher.
      </div>
    );
  }

  if (state.kind === 'unavailable') {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 text-center">
        This gallery is no longer available. The teacher may have turned it off
        or the link may have expired.
      </div>
    );
  }

  if (state.kind === 'loading' || !viewer) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 text-center text-slate-600">
        <Loader2 aria-hidden="true" className="mr-2 h-5 w-5 animate-spin" />
        Loading gallery…
      </div>
    );
  }

  // Falls back to a normalized-default session until the first session
  // snapshot arrives, so the wall renders immediately instead of blocking on it.
  const effectiveSession =
    session ?? normalizeActivityWallSession(state.share.sessionId, {});

  return (
    <GalleryReady
      share={state.share}
      viewer={viewer}
      session={effectiveSession}
      submissions={visibleSubmissions}
      submissionsReady={submissionsReady}
      engagement={engagement}
      flags={flags}
      identificationMode={
        session?.identificationMode ?? state.share.identificationMode
      }
      driveSigninHint={driveSigninHint}
      onMediaError={handleMediaError}
    />
  );
};

interface GalleryReadyProps {
  share: SharedActivityWall;
  viewer: User;
  session: ActivityWallSession;
  submissions: ActivityWallSubmission[];
  submissionsReady: boolean;
  engagement: WallEngagement;
  flags: EngagementFlags;
  identificationMode: ActivityWallIdentificationMode;
  driveSigninHint: boolean;
  onMediaError: (submission: ActivityWallSubmission) => void;
}

const GalleryReady: React.FC<GalleryReadyProps> = ({
  share,
  viewer,
  session,
  submissions,
  submissionsReady,
  engagement,
  flags,
  identificationMode,
  driveSigninHint,
  onMediaError,
}) => {
  // Marks the document body chrome-free for the app shell (external DOM system).
  useEffect(() => {
    document.body.dataset.chromeFree = 'true';
    return () => {
      delete document.body.dataset.chromeFree;
    };
  }, []);

  const [imageSize, setImageSizeState] = useState<WallImageSize>(() => {
    try {
      const stored = localStorage.getItem(IMAGE_SIZE_STORAGE_KEY);
      return isWallImageSize(stored) ? stored : 'medium';
    } catch {
      return 'medium';
    }
  });
  const setImageSize = useCallback((size: WallImageSize) => {
    setImageSizeState(size);
    try {
      localStorage.setItem(IMAGE_SIZE_STORAGE_KEY, size);
    } catch {
      // Storage unavailable (private mode); the choice just won't persist.
    }
  }, []);
  const showNames = session.showNames ?? false;
  // Counts are visible to everyone; only signed-in viewers can post.
  const canWrite = !viewer.isAnonymous;
  const renderFooter = useMemo(
    () =>
      makeEngagementFooter({
        viewerUid: viewer.uid,
        canWrite,
        flags,
        identificationMode,
        engagement,
      }),
    [viewer.uid, canWrite, flags, identificationMode, engagement]
  );

  return (
    // Outer wrapper owns the scroll: body has `overflow: hidden` globally
    // (index.css), so a `min-h-screen` child can't trigger document scroll.
    // Give the outer an explicit viewport height + `overflow-y-auto`.
    // `h-dvh` follows `h-screen` so the dynamic viewport unit wins on
    // browsers that support it — keeps iOS Safari from clipping the
    // bottom row under the collapsing URL bar.
    <div
      data-chrome-free="true"
      className="h-screen h-dvh overflow-y-auto bg-slate-900 flex flex-col"
    >
      <header className="shrink-0 bg-brand-blue-primary text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-5 sm:py-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black sm:text-2xl">
              {share.title}
            </h1>
            {share.prompt && (
              <p className="truncate text-sm text-white/90 sm:text-base">
                {share.prompt}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setImageSize(nextWallImageSize(imageSize))}
            aria-label={`Image size: ${WALL_IMAGE_SIZE_LABEL[imageSize]}. Click to change.`}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/15 px-3 py-1 text-sm font-bold transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <ImageIcon aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">Images:</span>{' '}
            {WALL_IMAGE_SIZE_LABEL[imageSize]}
          </button>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-white/15 px-3 py-1 text-sm font-bold">
            {submissions.length} post{submissions.length === 1 ? '' : 's'}
          </span>
        </div>
      </header>

      <main role="main" className="min-h-0 flex-1">
        {!submissionsReady ? (
          <div className="flex h-full items-center justify-center text-slate-300">
            <Loader2 aria-hidden="true" className="mr-2 h-5 w-5 animate-spin" />
            Loading submissions…
          </div>
        ) : submissions.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-slate-300">
            No submissions yet — check back soon!
          </div>
        ) : (
          <div className="relative flex h-full flex-col">
            <div
              className="relative min-h-0 flex-1"
              style={{ minHeight: '50vh' }}
            >
              <LayoutRouter
                session={session}
                submissions={submissions}
                mode="gallery"
                showNames={showNames}
                imageSize={imageSize}
                onMediaError={onMediaError}
                renderFooter={renderFooter}
              />
              {driveSigninHint && (
                <div className="absolute inset-x-0 bottom-0 bg-amber-400/95 px-4 py-2 text-center text-xs font-bold text-slate-900">
                  Sign in to your school Google account in this browser to see
                  photos.
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
