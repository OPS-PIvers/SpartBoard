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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CornerDownRight,
  Heart,
  Loader2,
  MessageSquare,
  Send,
} from 'lucide-react';
import { signInAnonymously, type User } from 'firebase/auth';
import {
  collection,
  doc,
  deleteDoc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { auth, db, storage } from '@/config/firebase';
import type {
  ActivityWallComment,
  ActivityWallIdentificationMode,
  ActivityWallLike,
  ActivityWallSubmission,
  SharedActivityWall,
} from '@/types';

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

const isSafeHttpUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const buildParticipantLabel = (
  identificationMode: ActivityWallIdentificationMode,
  name: string,
  pin: string
): string => {
  if (identificationMode === 'name') return name.trim() || 'Visitor';
  if (identificationMode === 'pin') return `PIN: ${pin.trim()}`;
  if (identificationMode === 'name-pin')
    return `${name.trim()} (${pin.trim()})`;
  return 'Anonymous';
};

const useAnonymousFirebaseUser = (): User | null => {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  useEffect(() => {
    let cancelled = false;
    if (!auth.currentUser) {
      void signInAnonymously(auth).catch((err) => {
        console.error('[ActivityWallGallery] Anonymous sign-in failed:', err);
      });
    }
    const unsubscribe = auth.onAuthStateChanged((next) => {
      if (cancelled) return;
      setUser(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  return user;
};

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
  const [submissions, setSubmissions] = useState<ActivityWallSubmission[]>([]);
  const [submissionsReady, setSubmissionsReady] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  // Tracks storage paths we've already kicked off a download for, so the
  // resolver effect can stay off the `photoUrls` dependency (which it
  // also writes to). On a fetch failure we drop the entry so the path is
  // eligible for retry when the next submissions snapshot arrives.
  const inFlightPhotoPathsRef = useRef<Set<string>>(new Set());
  const [likes, setLikes] = useState<ActivityWallLike[]>([]);
  const [comments, setComments] = useState<ActivityWallComment[]>([]);

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
    const submissionsRef = collection(
      db,
      'activity_wall_sessions',
      sessionId,
      'submissions'
    );
    const unsubscribe = onSnapshot(
      submissionsRef,
      (snap) => {
        const next: ActivityWallSubmission[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: typeof data.id === 'string' ? data.id : d.id,
            content: typeof data.content === 'string' ? data.content : '',
            submittedAt:
              typeof data.submittedAt === 'number' ? data.submittedAt : 0,
            status:
              data.status === 'approved' || data.status === 'pending'
                ? data.status
                : 'approved',
            participantLabel:
              typeof data.participantLabel === 'string'
                ? data.participantLabel
                : undefined,
            storagePath:
              typeof data.storagePath === 'string'
                ? data.storagePath
                : undefined,
          };
        });
        // Sort newest-first here, once per snapshot, rather than on every
        // render downstream. The display order is purely `submittedAt`
        // descending, which only changes when this snapshot fires.
        next.sort((a, b) => b.submittedAt - a.submittedAt);
        setSubmissions(next);
        setSubmissionsReady(true);
      },
      (err) => {
        console.error('[ActivityWallGallery] Submissions snapshot error:', err);
        setSubmissionsReady(true);
      }
    );
    return unsubscribe;
  }, [state, viewer]);

  // Subscribe to likes + comments. These live under the share doc itself
  // so they're scoped to this gallery instance (a teacher resharing the
  // same session gets a fresh interaction set).
  useEffect(() => {
    if (state.kind !== 'ready' || !viewer) return;
    const shareDocRef = doc(db, 'shared_activity_walls', state.share.id);
    const unsubLikes = onSnapshot(
      query(collection(shareDocRef, 'likes')),
      (snap) => {
        setLikes(
          snap.docs.map((d) => {
            const data = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              submissionId:
                typeof data.submissionId === 'string' ? data.submissionId : '',
              authorUid:
                typeof data.authorUid === 'string' ? data.authorUid : '',
              createdAt:
                typeof data.createdAt === 'number' ? data.createdAt : 0,
            };
          })
        );
      }
    );
    const unsubComments = onSnapshot(
      query(collection(shareDocRef, 'comments')),
      (snap) => {
        setComments(
          snap.docs
            .map((d) => {
              const data = d.data() as Record<string, unknown>;
              return {
                id: typeof data.id === 'string' ? data.id : d.id,
                submissionId:
                  typeof data.submissionId === 'string'
                    ? data.submissionId
                    : '',
                parentCommentId:
                  typeof data.parentCommentId === 'string'
                    ? data.parentCommentId
                    : null,
                content: typeof data.content === 'string' ? data.content : '',
                participantLabel:
                  typeof data.participantLabel === 'string'
                    ? data.participantLabel
                    : 'Anonymous',
                authorUid:
                  typeof data.authorUid === 'string' ? data.authorUid : '',
                createdAt:
                  typeof data.createdAt === 'number' ? data.createdAt : 0,
              };
            })
            .sort((a, b) => a.createdAt - b.createdAt)
        );
      }
    );
    return () => {
      unsubLikes();
      unsubComments();
    };
  }, [state, viewer]);

  // Resolve Firebase Storage download URLs for photo submissions.
  useEffect(() => {
    if (state.kind !== 'ready' || state.share.mode !== 'photo') return;
    let cancelled = false;
    const inFlight = inFlightPhotoPathsRef.current;
    const missing = submissions
      .filter((s) => s.storagePath && !inFlight.has(s.storagePath))
      .map((s) => s.storagePath as string);
    if (missing.length === 0) return;
    missing.forEach((path) => inFlight.add(path));
    void (async () => {
      const resolved: Record<string, string> = {};
      await Promise.all(
        missing.map(async (path) => {
          try {
            const url = await getDownloadURL(storageRef(storage, path));
            resolved[path] = url;
          } catch (err) {
            console.warn(
              '[ActivityWallGallery] Failed to resolve photo URL:',
              path,
              err
            );
            // Allow a retry on the next submissions tick — keeping the
            // path in the in-flight set would silently drop the photo.
            inFlight.delete(path);
          }
        })
      );
      if (cancelled || Object.keys(resolved).length === 0) return;
      setPhotoUrls((prev) => ({ ...prev, ...resolved }));
    })();
    return () => {
      cancelled = true;
    };
  }, [submissions, state]);

  // Pre-filtered, already-sorted list handed to GalleryReady. Memoizing
  // here keeps the prop reference stable between renders so the child
  // doesn't re-derive its view on every unrelated state change.
  const visibleSubmissions = useMemo(
    () => submissions.filter((s) => s.status !== 'pending'),
    [submissions]
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
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading gallery…
      </div>
    );
  }

  return (
    <GalleryReady
      share={state.share}
      viewer={viewer}
      submissions={visibleSubmissions}
      submissionsReady={submissionsReady}
      photoUrls={photoUrls}
      likes={likes}
      comments={comments}
    />
  );
};

interface GalleryReadyProps {
  share: SharedActivityWall;
  viewer: User;
  submissions: ActivityWallSubmission[];
  submissionsReady: boolean;
  photoUrls: Record<string, string>;
  likes: ActivityWallLike[];
  comments: ActivityWallComment[];
}

const GalleryReady: React.FC<GalleryReadyProps> = ({
  share,
  viewer,
  submissions,
  submissionsReady,
  photoUrls,
  likes,
  comments,
}) => {
  // `submissions` already arrives sorted newest-first from the snapshot
  // callback, so no per-render spread+sort is needed here.

  const likeIndex = useMemo(() => {
    const map = new Map<string, { count: number; viewerLiked: boolean }>();
    likes.forEach((like) => {
      const entry = map.get(like.submissionId) ?? {
        count: 0,
        viewerLiked: false,
      };
      entry.count += 1;
      if (like.authorUid === viewer.uid) entry.viewerLiked = true;
      map.set(like.submissionId, entry);
    });
    return map;
  }, [likes, viewer.uid]);

  const commentsBySubmission = useMemo(() => {
    const map = new Map<string, ActivityWallComment[]>();
    comments.forEach((comment) => {
      const list = map.get(comment.submissionId) ?? [];
      list.push(comment);
      map.set(comment.submissionId, list);
    });
    return map;
  }, [comments]);

  return (
    // Outer wrapper owns the scroll: body has `overflow: hidden` globally
    // (index.css), so a `min-h-screen` child can't trigger document scroll
    // when submissions overflow the viewport. Give the outer an explicit
    // viewport height + `overflow-y-auto` so the gallery list scrolls.
    // `h-dvh` follows `h-screen` so the dynamic viewport unit wins on
    // browsers that support it — keeps iOS Safari from clipping the
    // bottom row under the collapsing URL bar.
    <div className="h-screen h-dvh overflow-y-auto bg-slate-100">
      <header className="bg-brand-blue-primary text-white">
        <div className="max-w-5xl mx-auto px-5 py-6">
          <p className="text-xs uppercase tracking-widest font-bold opacity-90">
            Gallery
          </p>
          <h1 className="text-2xl font-black mt-1">{share.title}</h1>
          {share.prompt && (
            <p className="mt-2 text-sm opacity-90 max-w-2xl">{share.prompt}</p>
          )}
          {share.expiresAt && (
            <p className="mt-3 text-[11px] uppercase tracking-wider opacity-75">
              Available until {new Date(share.expiresAt).toLocaleString()}
            </p>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-6">
        {!submissionsReady ? (
          <div className="flex items-center justify-center text-slate-500 py-12">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading submissions…
          </div>
        ) : submissions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-slate-500">
            No submissions yet — check back soon!
          </div>
        ) : (
          <div
            className={
              share.mode === 'photo'
                ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
                : 'space-y-4'
            }
          >
            {submissions.map((submission) => (
              <SubmissionCard
                key={submission.id}
                share={share}
                viewer={viewer}
                submission={submission}
                photoUrl={
                  submission.storagePath
                    ? (photoUrls[submission.storagePath] ?? null)
                    : isSafeHttpUrl(submission.content)
                      ? submission.content
                      : null
                }
                likeInfo={
                  likeIndex.get(submission.id) ?? {
                    count: 0,
                    viewerLiked: false,
                  }
                }
                comments={commentsBySubmission.get(submission.id) ?? []}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

interface SubmissionCardProps {
  share: SharedActivityWall;
  viewer: User;
  submission: ActivityWallSubmission;
  photoUrl: string | null;
  likeInfo: { count: number; viewerLiked: boolean };
  comments: ActivityWallComment[];
}

const SubmissionCard: React.FC<SubmissionCardProps> = ({
  share,
  viewer,
  submission,
  photoUrl,
  likeInfo,
  comments,
}) => {
  const topLevel = comments.filter((c) => c.parentCommentId === null);
  const repliesByParent = useMemo(() => {
    const map = new Map<string, ActivityWallComment[]>();
    comments
      .filter((c) => c.parentCommentId !== null)
      .forEach((c) => {
        const list = map.get(c.parentCommentId as string) ?? [];
        list.push(c);
        map.set(c.parentCommentId as string, list);
      });
    return map;
  }, [comments]);

  const [likeBusy, setLikeBusy] = useState(false);

  const toggleLike = async () => {
    if (!share.allowLikes || likeBusy) return;
    setLikeBusy(true);
    try {
      const likeDocId = `${submission.id}__${viewer.uid}`;
      const likeRef = doc(
        db,
        'shared_activity_walls',
        share.id,
        'likes',
        likeDocId
      );
      if (likeInfo.viewerLiked) {
        await deleteDoc(likeRef);
      } else {
        await setDoc(likeRef, {
          id: likeDocId,
          submissionId: submission.id,
          authorUid: viewer.uid,
          createdAt: Date.now(),
        });
      }
    } catch (err) {
      console.error('[ActivityWallGallery] Like toggle failed:', err);
    } finally {
      setLikeBusy(false);
    }
  };

  return (
    <article className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
      {share.mode === 'photo' && photoUrl ? (
        <img
          src={photoUrl}
          alt={submission.participantLabel ?? 'Submission'}
          className="w-full aspect-square object-cover bg-slate-100"
        />
      ) : share.mode === 'photo' ? (
        <div className="w-full aspect-square bg-slate-100 flex items-center justify-center text-slate-400 text-sm">
          Photo unavailable
        </div>
      ) : (
        <div className="p-5 whitespace-pre-wrap text-slate-800 leading-relaxed">
          {submission.content}
        </div>
      )}
      <div className="p-4 flex items-center justify-between gap-3 border-t border-slate-100">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-700 truncate">
            {submission.participantLabel ?? 'Anonymous'}
          </p>
          <p className="text-[11px] text-slate-400">
            {new Date(submission.submittedAt).toLocaleString()}
          </p>
        </div>
        {share.allowLikes && (
          <button
            type="button"
            onClick={() => void toggleLike()}
            disabled={likeBusy}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition-colors disabled:opacity-50 ${
              likeInfo.viewerLiked
                ? 'bg-rose-100 text-rose-600 hover:bg-rose-200'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            aria-pressed={likeInfo.viewerLiked}
            aria-label={likeInfo.viewerLiked ? 'Unlike' : 'Like'}
          >
            <Heart
              className={`w-4 h-4 ${likeInfo.viewerLiked ? 'fill-rose-500' : ''}`}
            />
            {likeInfo.count}
          </button>
        )}
      </div>

      {share.allowComments && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wider">
            <MessageSquare className="w-3.5 h-3.5" />
            {topLevel.length === 0
              ? 'No comments yet'
              : `${topLevel.length} comment${topLevel.length === 1 ? '' : 's'}`}
          </div>
          {topLevel.length > 0 && (
            <ul className="space-y-2">
              {topLevel.map((comment) => (
                <CommentNode
                  key={comment.id}
                  share={share}
                  viewer={viewer}
                  submissionId={submission.id}
                  comment={comment}
                  replies={repliesByParent.get(comment.id) ?? []}
                />
              ))}
            </ul>
          )}
          <CommentComposer
            share={share}
            viewer={viewer}
            submissionId={submission.id}
            parentCommentId={null}
          />
        </div>
      )}
    </article>
  );
};

interface CommentNodeProps {
  share: SharedActivityWall;
  viewer: User;
  submissionId: string;
  comment: ActivityWallComment;
  replies: ActivityWallComment[];
}

const CommentNode: React.FC<CommentNodeProps> = ({
  share,
  viewer,
  submissionId,
  comment,
  replies,
}) => {
  const [replyOpen, setReplyOpen] = useState(false);
  return (
    <li className="rounded-lg bg-white border border-slate-200 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-bold text-slate-700 truncate">
          {comment.participantLabel}
        </p>
        <span className="text-[10px] text-slate-400 shrink-0">
          {new Date(comment.createdAt).toLocaleString()}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
        {comment.content}
      </p>
      {share.allowCommentResponses && (
        <button
          type="button"
          onClick={() => setReplyOpen((p) => !p)}
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-blue-primary hover:text-brand-blue-dark"
        >
          <CornerDownRight className="w-3 h-3" />
          {replyOpen ? 'Cancel' : 'Reply'}
        </button>
      )}
      {replies.length > 0 && (
        <ul className="mt-2 ml-4 space-y-2 border-l border-slate-200 pl-3">
          {replies.map((reply) => (
            <li key={reply.id} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-bold text-slate-700 truncate">
                  {reply.participantLabel}
                </p>
                <span className="text-[10px] text-slate-400 shrink-0">
                  {new Date(reply.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-0.5 text-slate-700 whitespace-pre-wrap">
                {reply.content}
              </p>
            </li>
          ))}
        </ul>
      )}
      {replyOpen && share.allowCommentResponses && (
        <div className="mt-2">
          <CommentComposer
            share={share}
            viewer={viewer}
            submissionId={submissionId}
            parentCommentId={comment.id}
            onDone={() => setReplyOpen(false)}
            compact
          />
        </div>
      )}
    </li>
  );
};

interface CommentComposerProps {
  share: SharedActivityWall;
  viewer: User;
  submissionId: string;
  parentCommentId: string | null;
  compact?: boolean;
  onDone?: () => void;
}

const CommentComposer: React.FC<CommentComposerProps> = ({
  share,
  viewer,
  submissionId,
  parentCommentId,
  compact = false,
  onDone,
}) => {
  const requiresName =
    share.identificationMode === 'name' ||
    share.identificationMode === 'name-pin';
  const requiresPin =
    share.identificationMode === 'pin' ||
    share.identificationMode === 'name-pin';

  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!content.trim()) return;
    if (requiresName && !name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (requiresPin && !pin.trim()) {
      setError('Please enter the PIN.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const commentId = crypto.randomUUID();
      await setDoc(
        doc(db, 'shared_activity_walls', share.id, 'comments', commentId),
        {
          id: commentId,
          submissionId,
          parentCommentId,
          content: content.trim().slice(0, 2000),
          participantLabel: buildParticipantLabel(
            share.identificationMode,
            name,
            pin
          ),
          authorUid: viewer.uid,
          createdAt: Date.now(),
        }
      );
      setContent('');
      setName('');
      setPin('');
      onDone?.();
    } catch (err) {
      console.error('[ActivityWallGallery] Comment submit failed:', err);
      setError('Could not post your comment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className={compact ? 'space-y-2' : 'space-y-2'}>
      {(requiresName || requiresPin) && (
        <div className="grid grid-cols-2 gap-2">
          {requiresName && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full px-2 py-1 border border-slate-300 rounded-md text-xs"
            />
          )}
          {requiresPin && (
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
              className="w-full px-2 py-1 border border-slate-300 rounded-md text-xs"
            />
          )}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={compact ? 2 : 2}
          maxLength={2000}
          placeholder={parentCommentId ? 'Write a reply…' : 'Leave a comment…'}
          className="flex-1 px-2 py-1 border border-slate-300 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
        />
        <button
          type="submit"
          disabled={submitting || !content.trim()}
          className="shrink-0 inline-flex items-center gap-1 rounded-md bg-brand-blue-primary px-3 py-2 text-xs font-bold text-white hover:bg-brand-blue-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          Post
        </button>
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </form>
  );
};
