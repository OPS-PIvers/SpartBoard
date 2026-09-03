import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { EyeOff, Loader2, Plus } from 'lucide-react';
import { useDialog } from '@/context/useDialog';
import type {
  ActivityWallIdentificationMode,
  ActivityWallSubmission,
} from '@/types';
import {
  LayoutRouter,
  isWallImageSize,
  type WallImageSize,
  type WallPlacement,
} from '@/components/activityWall/render';
import {
  buildParticipantLabel,
  getSessionIdFromPath,
  useActivityWallStudentSession,
} from './useActivityWallStudentSession';
import { makeEngagementFooter, useWallEngagement } from './engagement';
import { WallCard, WallShell } from './submission/WallShell';
import { ComposerSheet } from './submission/ComposerSheet';
import {
  PostSubmitError,
  capExhausted,
  createPost,
  deletePost,
  updatePost,
  type PostDraft,
} from './submission/submitPost';

const IMAGE_SIZE_STORAGE_KEY = 'activity_wall_student_image_size';
const identityStorageKey = (sessionId: string) =>
  `activity_wall_identity:${sessionId}`;

interface Identity {
  name: string;
  pin: string;
}

const readIdentity = (sessionId: string | null): Identity | null => {
  if (!sessionId) return null;
  try {
    const raw = localStorage.getItem(identityStorageKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Identity>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      pin: typeof parsed.pin === 'string' ? parsed.pin : '',
    };
  } catch {
    return null;
  }
};

const writeIdentity = (sessionId: string, identity: Identity) => {
  try {
    localStorage.setItem(
      identityStorageKey(sessionId),
      JSON.stringify(identity)
    );
  } catch {
    // Storage unavailable (private mode); the student is asked again next visit.
  }
};

const readImageSize = (): WallImageSize => {
  try {
    const stored = localStorage.getItem(IMAGE_SIZE_STORAGE_KEY);
    return isWallImageSize(stored) ? stored : 'medium';
  } catch {
    return 'medium';
  }
};

type SheetState =
  | { kind: 'create'; placement: WallPlacement }
  | { kind: 'edit'; post: ActivityWallSubmission };

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary';

/** Arrival screen for name / PIN walls; remembered per session in localStorage. */
const IdentityScreen: React.FC<{
  mode: ActivityWallIdentificationMode;
  onDone: (identity: Identity) => void;
}> = ({ mode, onDone }) => {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const askName = mode === 'name' || mode === 'name-pin';
  const askPin = mode === 'pin' || mode === 'name-pin';
  const valid =
    (!askName || name.trim().length > 0) && (!askPin || pin.trim().length > 0);

  return (
    <WallCard>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onDone({ name: name.trim(), pin: pin.trim() });
        }}
      >
        <p className="text-lg font-black text-slate-900">Before you post</p>
        {askName && (
          <div>
            <label
              className="mb-1 block text-sm font-semibold text-slate-700"
              htmlFor="aw-identity-name"
            >
              Your name
            </label>
            <input
              id="aw-identity-name"
              className={inputClass}
              value={name}
              maxLength={60}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        )}
        {askPin && (
          <div>
            <label
              className="mb-1 block text-sm font-semibold text-slate-700"
              htmlFor="aw-identity-pin"
            >
              Your PIN
            </label>
            <input
              id="aw-identity-pin"
              className={inputClass}
              value={pin}
              maxLength={20}
              inputMode="numeric"
              autoComplete="off"
              onChange={(event) => setPin(event.target.value)}
            />
          </div>
        )}
        <button
          type="submit"
          disabled={!valid}
          className="w-full rounded-xl bg-brand-blue-primary py-2 font-bold text-white transition hover:bg-brand-blue-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-2 disabled:opacity-60"
        >
          Continue
        </button>
      </form>
    </WallCard>
  );
};

export const ActivityWallStudentApp: React.FC = () => {
  const sessionId = useMemo(
    () => getSessionIdFromPath(window.location.pathname),
    []
  );
  const state = useActivityWallStudentSession(sessionId);
  const { showConfirm } = useDialog();
  const readySession = state.kind === 'ready' ? state.session : null;
  const engagementFlags = {
    allowLikes: readySession?.allowLikes === true,
    allowComments: readySession?.allowComments === true,
    allowCommentResponses: readySession?.allowCommentResponses === true,
  };
  const engagement = useWallEngagement(
    state.kind === 'ready' && state.wallVisible ? state.session.id : null,
    state.kind === 'ready' ? state.uid : null,
    {
      likes: engagementFlags.allowLikes,
      comments: engagementFlags.allowComments,
    }
  );

  const [identity, setIdentity] = useState<Identity | null>(() =>
    readIdentity(sessionId)
  );
  const [imageSize, setImageSizeState] = useState<WallImageSize>(readImageSize);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const setImageSize = useCallback((size: WallImageSize) => {
    setImageSizeState(size);
    try {
      localStorage.setItem(IMAGE_SIZE_STORAGE_KEY, size);
    } catch {
      // Storage unavailable (private mode); the choice just won't persist.
    }
  }, []);

  // Notices fade on a timer (external), so the banner never sticks around.
  useEffect(() => {
    if (!notice) return;
    const handle = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(handle);
  }, [notice]);

  const closeSheet = useCallback(() => {
    setSheet(null);
    setSheetError(null);
    setProgress(null);
  }, []);

  if (state.kind === 'loading' || state.kind === 'redirecting') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 text-center text-slate-700">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
        Loading activity…
      </div>
    );
  }

  if (state.kind === 'not-found') {
    return (
      <WallShell>
        <WallCard>
          <p className="text-center font-medium text-slate-700">
            This wall isn&apos;t available right now. Ask your teacher for a new
            link.
          </p>
        </WallCard>
      </WallShell>
    );
  }

  const { uid, isGuest, isStudent, myPosts, posts, wallVisible } = state;
  const wall = state.session;
  const mode = wall.identificationMode;
  const asksIdentity = mode !== 'anonymous' && !isStudent;

  if (asksIdentity && !identity) {
    return (
      <WallShell
        appearance={wall.appearance}
        title={wall.title}
        prompt={wall.prompt}
      >
        <IdentityScreen
          mode={mode}
          onDone={(next) => {
            if (sessionId) writeIdentity(sessionId, next);
            setIdentity(next);
          }}
        />
      </WallShell>
    );
  }

  const participantLabel =
    asksIdentity && identity
      ? buildParticipantLabel(mode, identity.name, identity.pin)
      : state.participantLabel;
  const open = wall.acceptingResponses !== false;
  const isWordCloud = wall.layout === 'wordcloud';
  const canAdd = open && !capExhausted(wall, uid, myPosts);
  const canEdit = open && wall.allowStudentEdit === true;
  const canDelete = open && wall.allowStudentDelete === true;
  const ownPost = (id: string) => myPosts.find((post) => post.id === id);
  const renderFooter = wallVisible
    ? makeEngagementFooter({
        viewerUid: uid,
        canWrite: true,
        flags: engagementFlags,
        identificationMode: mode,
        participantLabel,
        engagement,
      })
    : undefined;

  const openCreate = (placement: WallPlacement = {}) => {
    setSheetError(null);
    setSheet({ kind: 'create', placement });
  };

  const onEdit = (id: string) => {
    const post = ownPost(id);
    if (!post) return;
    setSheetError(null);
    setSheet({ kind: 'edit', post });
  };

  const onDelete = async (id: string) => {
    if (!ownPost(id)) return;
    const confirmed = await showConfirm('Delete your post?', {
      title: 'Delete post',
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    try {
      await deletePost(wall.id, id);
      if (sheet?.kind === 'edit' && sheet.post.id === id) closeSheet();
    } catch (deleteError) {
      console.error('[ActivityWallStudentApp] Delete failed:', deleteError);
      setNotice('Could not delete that post. Please try again.');
    }
  };

  const onSubmit = async (draft: PostDraft, placement: WallPlacement) => {
    if (!sheet || busy) return;
    setBusy(true);
    setSheetError(null);
    try {
      if (sheet.kind === 'edit') {
        await updatePost(wall, sheet.post.id, draft, placement);
        closeSheet();
        setNotice('Changes saved.');
      } else {
        await createPost({
          session: wall,
          uid,
          isGuest,
          participantLabel,
          myPosts,
          draft,
          placement,
          onProgress: setProgress,
        });
        closeSheet();
        setNotice(
          wall.moderationEnabled
            ? 'Sent to your teacher for review.'
            : 'Posted!'
        );
      }
    } catch (submitError) {
      if (submitError instanceof PostSubmitError) {
        setSheetError(submitError.message);
      } else {
        console.error(
          '[ActivityWallStudentApp] Submission failed:',
          submitError
        );
        setSheetError(
          sheet.kind === 'edit'
            ? 'Could not save your changes. Please try again.'
            : 'Could not post. Please check your connection and try again.'
        );
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <WallShell
      appearance={wall.appearance}
      title={wall.title}
      prompt={wall.prompt}
      open={open}
      imageSize={imageSize}
      onImageSizeChange={setImageSize}
    >
      <div className="flex h-full flex-col">
        {!wallVisible && (
          <div
            role="status"
            className="flex shrink-0 items-center justify-center gap-2 bg-slate-900/70 px-4 py-2 text-center text-sm font-medium text-slate-100"
          >
            <EyeOff className="h-4 w-4 shrink-0" aria-hidden="true" />
            Your teacher will reveal the wall when everyone has posted.
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="shrink-0 bg-emerald-600 px-4 py-2 text-center text-sm font-semibold text-white"
          >
            {notice}
          </div>
        )}
        <div className="relative min-h-0 flex-1">
          <LayoutRouter
            session={wall}
            submissions={posts}
            mode="student"
            appearance={wall.appearance}
            showNames={wall.showNames ?? false}
            imageSize={imageSize}
            viewerUid={uid}
            onAddAt={canAdd ? openCreate : undefined}
            onEdit={canEdit ? onEdit : undefined}
            onDelete={canDelete ? (id) => void onDelete(id) : undefined}
            renderFooter={renderFooter}
          />
        </div>
      </div>

      {canAdd && (
        <button
          type="button"
          onClick={() => openCreate()}
          className="absolute bottom-5 right-5 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-base font-bold text-white shadow-lg transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
          {isWordCloud ? 'Add word' : 'Add post'}
        </button>
      )}

      {sheet && (
        <ComposerSheet
          key={sheet.kind === 'edit' ? sheet.post.id : 'create'}
          session={wall}
          placement={sheet.kind === 'create' ? sheet.placement : undefined}
          editing={sheet.kind === 'edit' ? sheet.post : undefined}
          onSubmit={(draft, placement) => void onSubmit(draft, placement)}
          onClose={closeSheet}
          busy={busy}
          progress={progress}
          error={sheetError}
        />
      )}
    </WallShell>
  );
};
