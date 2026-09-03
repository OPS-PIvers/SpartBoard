import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { db, functions, storage } from '@/config/firebase';
import {
  collection,
  deleteDoc,
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, ref, uploadBytesResumable } from 'firebase/storage';
import type {
  ActivityWallLinkPreview,
  ActivityWallSession,
  ActivityWallSubmission,
  ActivityWallSubmissionType,
} from '@/types';
import {
  getSessionIdFromPath,
  useActivityWallStudentSession,
} from './useActivityWallStudentSession';
import { WallShell } from './submission/WallShell';
import { SubmissionTypePicker } from './submission/SubmissionTypePicker';
import {
  StructureFields,
  type StructureValue,
} from './submission/StructureFields';
import {
  FileField,
  LinkField,
  TextField,
  WordField,
} from './submission/ContentFields';
import { MyPostsList } from './submission/MyPostsList';
import {
  isUploadType,
  safeFileName,
  validateUpload,
} from './submission/uploadLimits';
import type { MapPin } from './submission/MapPinPicker';

const MapPinPicker = lazy(() => import('./submission/MapPinPicker'));

const DEFAULT_MAP_CENTER = { lat: 39.5, lng: -98.35, zoom: 4 };

type UploadType = 'photo' | 'video' | 'file';

const availableTypes = (
  session: ActivityWallSession
): Exclude<ActivityWallSubmissionType, 'word'>[] => {
  const allowed = session.allowedTypes;
  const types: Exclude<ActivityWallSubmissionType, 'word'>[] = ['text'];
  if (allowed?.photo) types.push('photo');
  if (allowed?.link) types.push('link');
  if (allowed?.file) types.push('file');
  if (allowed?.video) types.push('video');
  return types;
};

/** Matches only the numeric `${uid}__${n}` capped-slot id shape (never the uncapped `${uid}__${random}` shape). */
const cappedSlotIdPattern = (uid: string): RegExp =>
  new RegExp(`^${uid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}__[0-9]{1,3}$`);

/** Lowest free `${uid}__${n}` slot, or null when the cap is exhausted. */
const nextCappedSlot = (
  uid: string,
  posts: ActivityWallSubmission[],
  max: number
): string | null => {
  const slotPattern = cappedSlotIdPattern(uid);
  const used = new Set(
    posts.map((post) => post.id).filter((id) => slotPattern.test(id))
  );
  for (let index = 0; index < max; index += 1) {
    const candidate = `${uid}__${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return null;
};

/** 8+ url-safe chars for uncapped `${uid}__${suffix}` ids; never purely digits (so it can't collide with the capped `[0-9]{1,3}` shape). */
const uncappedSubmissionSuffix = (): string => {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let suffix = Array.from(
    bytes,
    (byte) => alphabet[byte % alphabet.length]
  ).join('');
  if (/^[0-9]+$/.test(suffix)) suffix = `x${suffix.slice(1)}`;
  return suffix;
};

const youTubeVideoId = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') return parsed.pathname.slice(1) || null;
    if (host === 'youtube.com' || host === 'm.youtube.com')
      return parsed.searchParams.get('v');
  } catch {
    return null;
  }
  return null;
};

const domainOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
};

const fetchPreview = async (
  url: string
): Promise<ActivityWallLinkPreview | null> => {
  try {
    const callable = httpsCallable<
      { url: string },
      Partial<ActivityWallLinkPreview> & { videoId?: string }
    >(functions, 'fetchLinkPreview');
    const result = await callable({ url });
    const data = result.data;
    if (!data) return null;
    const preview: ActivityWallLinkPreview = {
      domain: data.domain ?? domainOf(url),
    };
    if (data.title) preview.title = data.title;
    if (data.description) preview.description = data.description;
    if (data.image) preview.image = data.image;
    return preview;
  } catch (error) {
    console.warn('[ActivityWallStudentApp] Link preview failed:', error);
    return null;
  }
};

export const ActivityWallStudentApp: React.FC = () => {
  const sessionId = useMemo(
    () => getSessionIdFromPath(window.location.pathname),
    []
  );
  const state = useActivityWallStudentSession(sessionId);

  const [type, setType] = useState<ActivityWallSubmissionType>('text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [word, setWord] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pin, setPin] = useState<MapPin | null>(null);
  const [structure, setStructure] = useState<StructureValue>({
    sectionId: '',
    rowId: '',
    colId: '',
    label: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justPosted, setJustPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Object URLs are an external browser resource; revoke on change.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const session = state.kind === 'ready' ? state.session : null;
  const isWordCloud = session?.layout === 'wordcloud';

  // Placement selects fall back to the first option until the student picks one.
  const placement: StructureValue = {
    sectionId: structure.sectionId || (session?.sections?.[0]?.id ?? ''),
    rowId: structure.rowId || (session?.tableRows?.[0]?.id ?? ''),
    colId: structure.colId || (session?.tableCols?.[0]?.id ?? ''),
    label: structure.label,
  };

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
        <p className="text-center font-medium text-slate-700">
          This wall isn&apos;t available right now. Ask your teacher for a new
          link.
        </p>
      </WallShell>
    );
  }

  const { uid, isGuest, participantLabel, myPosts } = state;
  const wall = state.session;

  if (wall.acceptingResponses === false) {
    return (
      <WallShell appearance={wall.appearance} title={wall.title}>
        <p className="text-center text-lg font-bold text-slate-800">
          This wall is closed
        </p>
        <p className="text-center text-sm text-slate-600">
          Your teacher has stopped accepting new posts.
        </p>
      </WallShell>
    );
  }

  const max = wall.maxPostsPerStudent ?? 0;
  const capped = max > 0;
  const cappedSlot = capped ? nextCappedSlot(uid, myPosts, max) : null;
  const capUsedUp = capped && (cappedSlot === null || myPosts.length >= max);
  const capExhausted = capUsedUp && editingId === null;
  const types = availableTypes(wall);
  const effectiveType: ActivityWallSubmissionType = isWordCloud ? 'word' : type;

  const resetForm = () => {
    setTitle('');
    setBody('');
    setWord('');
    setUrl('');
    setFile(null);
    setPin(null);
    setEditingId(null);
    setProgress(null);
  };

  const beginEdit = (post: ActivityWallSubmission) => {
    setEditingId(post.id);
    setType(post.type ?? 'text');
    setTitle(post.title ?? '');
    setBody(post.type === 'link' ? '' : post.content);
    setWord(post.type === 'word' ? post.content : '');
    setUrl(post.type === 'link' ? post.content : '');
    const [postRowId, postColId] = post.cellKey?.split('|') ?? [];
    setStructure((prev) => ({
      ...prev,
      sectionId: post.sectionId ?? prev.sectionId,
      rowId: postRowId ?? prev.rowId,
      colId: postColId ?? prev.colId,
      label: post.label ?? '',
    }));
    setJustPosted(false);
    setError(null);
  };

  const removePost = async (post: ActivityWallSubmission) => {
    setBusyId(post.id);
    try {
      await deleteDoc(
        doc(db, 'activity_wall_sessions', wall.id, 'submissions', post.id)
      );
      if (editingId === post.id) resetForm();
    } catch (deleteError) {
      console.error('[ActivityWallStudentApp] Delete failed:', deleteError);
      setError('Could not delete that post. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const contentValid = (() => {
    if (effectiveType === 'word') return word.trim().length > 0;
    if (effectiveType === 'link') return url.trim().startsWith('http');
    if (isUploadType(effectiveType)) return editingId !== null || file !== null;
    return body.trim().length > 0;
  })();

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || !contentValid) return;
    setError(null);

    if (wall.layout === 'map' && !editingId && !pin) {
      setError('Tap the map to drop a pin first.');
      return;
    }

    if (editingId) {
      setSubmitting(true);
      try {
        const patch: Record<string, unknown> = { editedAt: Date.now() };
        if (effectiveType === 'word') patch.content = word.trim();
        else if (effectiveType === 'link') patch.content = url.trim();
        else if (!isUploadType(effectiveType)) patch.content = body.trim();
        if (!isWordCloud) patch.title = title.trim();
        if (wall.layout === 'timeline') patch.label = placement.label.trim();
        if (wall.layout === 'columns') patch.sectionId = placement.sectionId;
        if (wall.layout === 'table' && placement.rowId && placement.colId)
          patch.cellKey = `${placement.rowId}|${placement.colId}`;
        await updateDoc(
          doc(db, 'activity_wall_sessions', wall.id, 'submissions', editingId),
          patch
        );
        resetForm();
        setJustPosted(true);
      } catch (updateError) {
        console.error('[ActivityWallStudentApp] Edit failed:', updateError);
        setError('Could not save your changes. Please try again.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (capUsedUp || (capped && !cappedSlot)) {
      setError('You have used all of your posts for this wall.');
      return;
    }

    let uploadFile: File | null = null;
    if (isUploadType(effectiveType)) {
      if (!file) return;
      const invalid = validateUpload(effectiveType, file);
      if (invalid) {
        setError(invalid);
        return;
      }
      uploadFile = file;
    }

    const submissionId = cappedSlot ?? `${uid}__${uncappedSubmissionSuffix()}`;
    setSubmitting(true);

    try {
      let content = '';
      let storagePath: string | undefined;
      let linkPreview: ActivityWallLinkPreview | undefined;

      if (uploadFile) {
        const fileName = safeFileName(uploadFile.name);
        storagePath = `activity_wall_media/${wall.id}/${submissionId}/${fileName}`;
        const task = uploadBytesResumable(
          ref(storage, storagePath),
          uploadFile
        );
        await new Promise<void>((resolve, reject) => {
          task.on(
            'state_changed',
            (snapshot) => {
              setProgress(
                snapshot.totalBytes > 0
                  ? Math.round(
                      (snapshot.bytesTransferred / snapshot.totalBytes) * 100
                    )
                  : 0
              );
            },
            reject,
            () => resolve()
          );
        });
        content = storagePath;
      } else if (effectiveType === 'link') {
        content = url.trim();
        const videoId = youTubeVideoId(content);
        if (videoId) {
          linkPreview = { domain: 'youtube.com', title: `YouTube ${videoId}` };
        } else {
          linkPreview =
            (await fetchPreview(content)) ??
            ({ domain: domainOf(content) } as ActivityWallLinkPreview);
        }
      } else if (effectiveType === 'word') {
        content = word.trim();
      } else {
        content = body.trim();
      }

      const payload: Record<string, unknown> = {
        id: submissionId,
        activityId: wall.activityId,
        type: effectiveType,
        content,
        authorUid: uid,
        isGuest,
        participantLabel,
        submittedAt: Date.now(),
        status: wall.moderationEnabled ? 'pending' : 'approved',
      };
      if (!isWordCloud && title.trim()) payload.title = title.trim();
      if (wall.layout === 'columns' && placement.sectionId)
        payload.sectionId = placement.sectionId;
      if (wall.layout === 'table' && placement.rowId && placement.colId)
        payload.cellKey = `${placement.rowId}|${placement.colId}`;
      if (wall.layout === 'timeline') {
        payload.order = Date.now();
        if (placement.label.trim()) payload.label = placement.label.trim();
      }
      if (wall.layout === 'map' && pin) {
        payload.lat = pin.lat;
        payload.lng = pin.lng;
      }
      if (linkPreview) payload.linkPreview = linkPreview;
      if (storagePath && uploadFile) {
        payload.storagePath = storagePath;
        payload.archiveStatus = 'firebase';
        payload.fileName = safeFileName(uploadFile.name);
        payload.mimeType = uploadFile.type;
        payload.sizeBytes = uploadFile.size;
      }

      try {
        await setDoc(
          doc(
            collection(db, 'activity_wall_sessions', wall.id, 'submissions'),
            submissionId
          ),
          payload
        );
      } catch (writeError) {
        // Best effort: drop the orphaned upload, but surface the write failure.
        if (storagePath)
          await deleteObject(ref(storage, storagePath)).catch(() => undefined);
        throw writeError;
      }
      resetForm();
      setJustPosted(true);
    } catch (submitError) {
      console.error('[ActivityWallStudentApp] Submission failed:', submitError);
      setError('Could not post. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <WallShell
      appearance={wall.appearance}
      title={wall.title}
      prompt={wall.prompt}
    >
      {justPosted && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center text-sm font-semibold text-emerald-800">
          {wall.moderationEnabled
            ? 'Sent to your teacher for review.'
            : 'Posted!'}
        </div>
      )}

      {capExhausted ? (
        <p className="text-center text-sm font-medium text-slate-700">
          You have used all {max} of your posts for this wall.
        </p>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          {!isWordCloud && !editingId && (
            <SubmissionTypePicker
              available={types}
              value={type}
              onChange={(next) => {
                setType(next);
                setFile(null);
              }}
            />
          )}

          {isWordCloud ? (
            <WordField value={word} onChange={setWord} />
          ) : effectiveType === 'link' ? (
            <LinkField
              url={url}
              title={title}
              onUrlChange={setUrl}
              onTitleChange={setTitle}
            />
          ) : isUploadType(effectiveType) ? (
            <>
              {editingId ? (
                <p className="text-sm text-slate-600">
                  You can change the title of an uploaded post.
                </p>
              ) : (
                <FileField
                  type={effectiveType as UploadType}
                  file={file}
                  previewUrl={previewUrl}
                  onSelect={setFile}
                />
              )}
              <TextField
                title={title}
                body=""
                hideBody
                onTitleChange={setTitle}
                onBodyChange={() => undefined}
              />
            </>
          ) : (
            <TextField
              title={title}
              body={body}
              onTitleChange={setTitle}
              onBodyChange={setBody}
            />
          )}

          {!isWordCloud && (
            <StructureFields
              session={wall}
              value={placement}
              onChange={(patch) =>
                setStructure((prev) => ({ ...prev, ...patch }))
              }
            />
          )}

          {wall.layout === 'map' && !editingId && (
            <Suspense
              fallback={
                <div className="h-64 animate-pulse rounded-xl bg-slate-200" />
              }
            >
              <MapPinPicker
                center={wall.mapCenter ?? DEFAULT_MAP_CENTER}
                pin={pin}
                onPick={setPin}
              />
            </Suspense>
          )}

          {progress !== null && (
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
              role="progressbar"
              aria-label="Upload progress"
              aria-valuenow={progress}
            >
              <div
                className="h-full bg-brand-blue-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {error && <p className="text-sm font-medium text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !contentValid}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2 font-bold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            {editingId ? 'Save changes' : 'Post'}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="w-full rounded-lg py-1 text-sm font-semibold text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
            >
              Cancel edit
            </button>
          )}
        </form>
      )}

      <MyPostsList
        posts={myPosts}
        allowEdit={wall.allowStudentEdit === true}
        allowDelete={wall.allowStudentDelete === true}
        busyId={busyId}
        onEdit={beginEdit}
        onDelete={(post) => void removePost(post)}
      />
    </WallShell>
  );
};
