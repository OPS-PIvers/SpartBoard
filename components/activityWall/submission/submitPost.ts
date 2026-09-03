import {
  collection,
  deleteDoc,
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, ref, uploadBytesResumable } from 'firebase/storage';
import { db, functions, storage } from '@/config/firebase';
import type {
  ActivityWallLinkPreview,
  ActivityWallSession,
  ActivityWallSubmission,
  ActivityWallSubmissionType,
} from '@/types';
import type { WallPlacement } from '@/components/activityWall/render';
import { isUploadType, safeFileName, validateUpload } from './uploadLimits';

/** Everything the composer collects; the layout decides which fields are written. */
export interface PostDraft {
  type: ActivityWallSubmissionType;
  title: string;
  body: string;
  word: string;
  url: string;
  file: File | null;
  /** Timeline "when" label. */
  label: string;
}

export const EMPTY_DRAFT: PostDraft = {
  type: 'text',
  title: '',
  body: '',
  word: '',
  url: '',
  file: null,
  label: '',
};

export class PostSubmitError extends Error {}

export const availableTypes = (
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
export const nextCappedSlot = (
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

/** True when a capped wall has no free slot left for this viewer. */
export const capExhausted = (
  session: ActivityWallSession,
  uid: string,
  myPosts: ActivityWallSubmission[]
): boolean => {
  const max = session.maxPostsPerStudent ?? 0;
  if (max <= 0) return false;
  return nextCappedSlot(uid, myPosts, max) === null || myPosts.length >= max;
};

/** 8+ url-safe chars for uncapped `${uid}__${suffix}` ids; never purely digits (so it can't collide with the capped `[0-9]{1,3}` shape). */
export const uncappedSubmissionSuffix = (): string => {
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

/** Effective type for a wall: word clouds always post words. */
export const effectiveType = (
  session: ActivityWallSession,
  type: ActivityWallSubmissionType
): ActivityWallSubmissionType =>
  session.layout === 'wordcloud' ? 'word' : type;

/** Whether the draft has enough content to post; uploads only need a file when creating. */
export const draftValid = (
  session: ActivityWallSession,
  draft: PostDraft,
  editing: boolean
): boolean => {
  const type = effectiveType(session, draft.type);
  if (type === 'word') return draft.word.trim().length > 0;
  if (type === 'link') return draft.url.trim().startsWith('http');
  if (isUploadType(type)) return editing || draft.file !== null;
  return draft.body.trim().length > 0;
};

/** Draft seeded from an existing post for editing. */
export const draftFromPost = (post: ActivityWallSubmission): PostDraft => ({
  type: post.type ?? 'text',
  title: post.title ?? '',
  body: post.type === 'link' || post.type === 'word' ? '' : post.content,
  word: post.type === 'word' ? post.content : '',
  url: post.type === 'link' ? post.content : '',
  file: null,
  label: post.label ?? '',
});

/** Placement seeded from an existing post for editing. */
export const placementFromPost = (
  post: ActivityWallSubmission
): WallPlacement => {
  const placement: WallPlacement = {};
  if (post.sectionId) placement.sectionId = post.sectionId;
  if (post.cellKey) placement.cellKey = post.cellKey;
  if (typeof post.order === 'number') placement.order = post.order;
  if (typeof post.lat === 'number' && typeof post.lng === 'number') {
    placement.lat = post.lat;
    placement.lng = post.lng;
  }
  return placement;
};

export interface CreatePostArgs {
  session: ActivityWallSession;
  uid: string;
  isGuest: boolean;
  participantLabel: string;
  myPosts: ActivityWallSubmission[];
  draft: PostDraft;
  placement: WallPlacement;
  onProgress?: (percent: number) => void;
  /** Teacher posts skip the cap and land approved with authorRole 'teacher'. */
  author?: 'teacher';
}

/** Uploads media if needed and writes a rules-compatible submission doc; throws `PostSubmitError` with a student-facing message. */
export const createPost = async ({
  session,
  uid,
  isGuest,
  participantLabel,
  myPosts,
  draft,
  placement,
  onProgress,
  author,
}: CreatePostArgs): Promise<string> => {
  const type = effectiveType(session, draft.type);
  const isTeacher = author === 'teacher';
  const max = isTeacher ? 0 : (session.maxPostsPerStudent ?? 0);
  const capped = max > 0;
  const cappedSlot = capped ? nextCappedSlot(uid, myPosts, max) : null;
  if (capped && (cappedSlot === null || myPosts.length >= max))
    throw new PostSubmitError('You have used all of your posts for this wall.');

  if (
    session.layout === 'map' &&
    (typeof placement.lat !== 'number' || typeof placement.lng !== 'number')
  )
    throw new PostSubmitError('Tap the map to drop a pin first.');

  let uploadFile: File | null = null;
  if (isUploadType(type)) {
    if (!draft.file) throw new PostSubmitError('Choose a file to upload.');
    const invalid = validateUpload(type, draft.file);
    if (invalid) throw new PostSubmitError(invalid);
    uploadFile = draft.file;
  }

  const submissionId = cappedSlot ?? `${uid}__${uncappedSubmissionSuffix()}`;
  let content = '';
  let storagePath: string | undefined;
  let linkPreview: ActivityWallLinkPreview | undefined;

  if (uploadFile) {
    const fileName = safeFileName(uploadFile.name);
    storagePath = `activity_wall_media/${session.id}/${submissionId}/${fileName}`;
    const task = uploadBytesResumable(ref(storage, storagePath), uploadFile);
    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (snapshot) => {
          onProgress?.(
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
  } else if (type === 'link') {
    content = draft.url.trim();
    const videoId = youTubeVideoId(content);
    if (videoId) {
      linkPreview = { domain: 'youtube.com', title: `YouTube ${videoId}` };
    } else {
      linkPreview =
        (await fetchPreview(content)) ??
        ({ domain: domainOf(content) } as ActivityWallLinkPreview);
    }
  } else if (type === 'word') {
    content = draft.word.trim();
  } else {
    content = draft.body.trim();
  }

  const payload: Record<string, unknown> = {
    id: submissionId,
    activityId: session.activityId,
    type,
    content,
    authorUid: uid,
    isGuest,
    participantLabel,
    submittedAt: Date.now(),
    status: session.moderationEnabled && !isTeacher ? 'pending' : 'approved',
  };
  if (isTeacher) payload.authorRole = 'teacher';
  const title = draft.title.trim();
  if (type !== 'word' && title) payload.title = title;
  if (session.layout === 'columns' && placement.sectionId)
    payload.sectionId = placement.sectionId;
  if (session.layout === 'table' && placement.cellKey)
    payload.cellKey = placement.cellKey;
  if (session.layout === 'timeline') {
    payload.order =
      typeof placement.order === 'number' ? placement.order : Date.now();
    if (draft.label.trim()) payload.label = draft.label.trim();
  }
  if (session.layout === 'map') {
    payload.lat = placement.lat;
    payload.lng = placement.lng;
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
        collection(db, 'activity_wall_sessions', session.id, 'submissions'),
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
  return submissionId;
};

/** Patches an existing post; uploads keep their media and only the title changes. */
export const updatePost = async (
  session: ActivityWallSession,
  postId: string,
  draft: PostDraft,
  placement: WallPlacement
): Promise<void> => {
  const type = effectiveType(session, draft.type);
  const patch: Record<string, unknown> = { editedAt: Date.now() };
  if (type === 'word') patch.content = draft.word.trim();
  else if (type === 'link') patch.content = draft.url.trim();
  else if (!isUploadType(type)) patch.content = draft.body.trim();
  if (type !== 'word') patch.title = draft.title.trim();
  // Rules keep `order` off the student edit allowlist, so timeline edits only touch the label.
  if (session.layout === 'timeline') patch.label = draft.label.trim();
  if (session.layout === 'columns' && placement.sectionId)
    patch.sectionId = placement.sectionId;
  if (session.layout === 'table' && placement.cellKey)
    patch.cellKey = placement.cellKey;
  if (
    session.layout === 'map' &&
    typeof placement.lat === 'number' &&
    typeof placement.lng === 'number'
  ) {
    patch.lat = placement.lat;
    patch.lng = placement.lng;
  }
  await updateDoc(
    doc(db, 'activity_wall_sessions', session.id, 'submissions', postId),
    patch
  );
};

export const deletePost = async (
  sessionId: string,
  postId: string
): Promise<void> => {
  await deleteDoc(
    doc(db, 'activity_wall_sessions', sessionId, 'submissions', postId)
  );
};
