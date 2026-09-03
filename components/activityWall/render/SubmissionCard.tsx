import React, { useEffect, useState } from 'react';
import {
  Check,
  FileText,
  LinkIcon,
  Pin,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { storage } from '@/config/firebase';
import type { ActivityWallSubmission } from '@/types';
import type { WallRenderActions, WallRenderMode } from './types';
import { wallScale } from './scale';

export interface SubmissionCardProps extends WallRenderActions {
  submission: ActivityWallSubmission;
  mode: WallRenderMode;
  showNames: boolean;
  /** Timeline label / column chip rendered under the card body. */
  footnote?: string;
}

const isSafeHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const youTubeEmbedUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be' && parsed.pathname.length > 1) {
      return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = parsed.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    return null;
  } catch {
    return null;
  }
};

const isArchived = (submission: ActivityWallSubmission): boolean =>
  submission.archiveStatus === 'archived' || Boolean(submission.driveFileId);

/** Drive preview URL for an archived video, derived from the stored file id. */
const drivePreviewUrl = (driveFileId: string): string =>
  `https://drive.google.com/file/d/${driveFileId}/preview`;

const STORAGE_BACKED_TYPES = new Set(['photo', 'video', 'file']);

interface MediaUrlState {
  url: string | null;
  failed: boolean;
}

/** Resolves an upload's renderable URL: a Storage download URL while in transit, the Drive URL once archived. */
const useMediaUrl = (submission: ActivityWallSubmission): MediaUrlState => {
  const archived = isArchived(submission);
  const transitPath = submission.storagePath ?? submission.content;
  const storageBacked = STORAGE_BACKED_TYPES.has(submission.type ?? 'text');
  const [resolvedByPath, setResolvedByPath] = useState<Record<string, string>>(
    {}
  );
  const [failedPaths, setFailedPaths] = useState<Record<string, true>>({});
  const alreadyResolved = Boolean(resolvedByPath[transitPath]);
  const alreadyFailed = Boolean(failedPaths[transitPath]);

  useEffect(() => {
    if (
      !storageBacked ||
      archived ||
      !transitPath ||
      isSafeHttpUrl(transitPath) ||
      alreadyResolved ||
      alreadyFailed
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const url = await getDownloadURL(storageRef(storage, transitPath));
        if (!cancelled) {
          setResolvedByPath((previous) => ({
            ...previous,
            [transitPath]: url,
          }));
        }
      } catch (error) {
        console.warn(
          '[ActivityWall] Failed to resolve media URL:',
          transitPath,
          error
        );
        if (!cancelled) {
          setFailedPaths((previous) => ({ ...previous, [transitPath]: true }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [alreadyFailed, alreadyResolved, archived, storageBacked, transitPath]);

  if (archived)
    return { url: submission.driveUrl ?? submission.content, failed: false };
  if (isSafeHttpUrl(transitPath)) return { url: transitPath, failed: false };
  if (!storageBacked) return { url: null, failed: false };
  return { url: resolvedByPath[transitPath] ?? null, failed: alreadyFailed };
};

const PrivateFileNote: React.FC<{ fontSize: string }> = ({ fontSize }) => (
  <p className="text-slate-300" style={{ fontSize }}>
    Only the teacher can view this file
  </p>
);

const cardSurface =
  'relative rounded-xl border border-white/15 bg-slate-900/70 text-white shadow-lg backdrop-blur-sm';

export const SubmissionCard: React.FC<SubmissionCardProps> = ({
  submission,
  mode,
  showNames,
  footnote,
  onPin,
  onEdit,
  onDelete,
  onApprove,
  onReject,
}) => {
  const scale = wallScale(mode);
  const { url: mediaUrl, failed: mediaFailed } = useMediaUrl(submission);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const isTeacher = mode === 'teacher';
  const isPending = submission.status === 'pending';
  const isPrivate = submission.drivePermission === 'private';
  const type = submission.type ?? 'text';

  const body = (() => {
    if (type === 'photo') {
      if (isPrivate) return <PrivateFileNote fontSize={scale.meta} />;
      const failed =
        mediaFailed || (Boolean(mediaUrl) && failedImageUrl === mediaUrl);
      if (!mediaUrl || failed) {
        return (
          <p className="text-slate-300" style={{ fontSize: scale.meta }}>
            {failed ? 'Photo unavailable' : 'Loading photo…'}
          </p>
        );
      }
      return (
        <img
          src={mediaUrl}
          alt={submission.title ?? 'Student photo'}
          className="w-full rounded-lg object-cover"
          onError={() => setFailedImageUrl(mediaUrl)}
        />
      );
    }

    if (type === 'video') {
      if (isPrivate) return <PrivateFileNote fontSize={scale.meta} />;
      if (!isArchived(submission) || !submission.driveFileId) {
        return (
          <p className="text-slate-300" style={{ fontSize: scale.meta }}>
            Processing…
          </p>
        );
      }
      return (
        <iframe
          src={drivePreviewUrl(submission.driveFileId)}
          title={submission.title ?? submission.fileName ?? 'Student video'}
          allow="autoplay"
          className="aspect-video w-full rounded-lg border-0"
        />
      );
    }

    if (type === 'file') {
      if (isPrivate) return <PrivateFileNote fontSize={scale.meta} />;
      const label = submission.fileName ?? 'Attached file';
      return (
        <div className="flex items-center" style={{ gap: scale.gap }}>
          <FileText
            aria-hidden="true"
            style={{ width: scale.icon, height: scale.icon }}
            className="shrink-0 text-slate-300"
          />
          {mediaUrl ? (
            <a
              href={mediaUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline decoration-white/40 underline-offset-2"
              style={{ fontSize: scale.body }}
            >
              {label}
            </a>
          ) : (
            <span className="text-slate-300" style={{ fontSize: scale.body }}>
              {label}
            </span>
          )}
        </div>
      );
    }

    if (type === 'link') {
      const url = submission.content;
      if (!isSafeHttpUrl(url)) {
        return (
          <p className="text-slate-300" style={{ fontSize: scale.body }}>
            {url}
          </p>
        );
      }
      const embed = youTubeEmbedUrl(url);
      if (embed) {
        return (
          <iframe
            src={embed}
            title={submission.title ?? 'Linked video'}
            allow="accelerometer; encrypted-media; picture-in-picture"
            allowFullScreen
            className="aspect-video w-full rounded-lg border-0"
          />
        );
      }
      const preview = submission.linkPreview;
      return (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="block rounded-lg border border-white/15 bg-white/5"
          style={{ padding: scale.pad }}
        >
          {preview?.image && (
            <img
              src={preview.image}
              alt=""
              className="mb-2 w-full rounded object-cover"
            />
          )}
          <span
            className="flex items-center font-semibold"
            style={{ gap: scale.gap, fontSize: scale.body }}
          >
            <LinkIcon
              aria-hidden="true"
              style={{ width: scale.icon, height: scale.icon }}
              className="shrink-0"
            />
            {preview?.title ?? url}
          </span>
          {preview?.description && (
            <span
              className="mt-1 block text-slate-300"
              style={{ fontSize: scale.meta }}
            >
              {preview.description}
            </span>
          )}
          <span
            className="mt-1 block text-slate-300"
            style={{ fontSize: scale.meta }}
          >
            {preview?.domain ?? new URL(url).hostname}
          </span>
        </a>
      );
    }

    return (
      <p
        className="whitespace-pre-wrap break-words"
        style={{ fontSize: scale.body }}
      >
        {submission.content}
      </p>
    );
  })();

  return (
    <article
      className={cardSurface}
      style={{ padding: scale.pad }}
      data-testid={`aw-card-${submission.id}`}
    >
      {isTeacher && isPending && (
        <span
          className="absolute right-2 top-2 rounded-full bg-amber-400 px-2 font-bold uppercase tracking-wide text-slate-900"
          style={{ fontSize: scale.meta }}
        >
          Pending
        </span>
      )}
      {submission.pinned && (
        <Pin
          aria-label="Pinned"
          style={{ width: scale.icon, height: scale.icon }}
          className="absolute left-2 top-2 text-amber-300"
        />
      )}

      {submission.title && (
        <h3 className="font-bold" style={{ fontSize: scale.title }}>
          {submission.title}
        </h3>
      )}

      <div style={{ marginTop: submission.title ? scale.gap : undefined }}>
        {body}
      </div>

      {footnote && (
        <p className="mt-1 text-slate-300" style={{ fontSize: scale.meta }}>
          {footnote}
        </p>
      )}

      {showNames && submission.participantLabel && (
        <p className="mt-1 text-slate-300" style={{ fontSize: scale.meta }}>
          {submission.participantLabel}
        </p>
      )}

      {isTeacher && (
        <div
          className="mt-2 flex flex-wrap items-center"
          style={{ gap: scale.gap }}
        >
          {isPending && onApprove && (
            <button
              type="button"
              aria-label="Approve post"
              onClick={() => onApprove(submission.id)}
              className="rounded p-1 text-slate-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <Check style={{ width: scale.icon, height: scale.icon }} />
            </button>
          )}
          {isPending && onReject && (
            <button
              type="button"
              aria-label="Reject post"
              onClick={() => onReject(submission.id)}
              className="rounded p-1 text-slate-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <X style={{ width: scale.icon, height: scale.icon }} />
            </button>
          )}
          {onPin && (
            <button
              type="button"
              aria-label={submission.pinned ? 'Unpin post' : 'Pin post'}
              onClick={() => onPin(submission.id, !submission.pinned)}
              className="rounded p-1 text-slate-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <Pin style={{ width: scale.icon, height: scale.icon }} />
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              aria-label="Edit post"
              onClick={() => onEdit(submission.id)}
              className="rounded p-1 text-slate-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <Pencil style={{ width: scale.icon, height: scale.icon }} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              aria-label="Delete post"
              onClick={() => onDelete(submission.id)}
              className="rounded p-1 text-slate-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <Trash2 style={{ width: scale.icon, height: scale.icon }} />
            </button>
          )}
        </div>
      )}
    </article>
  );
};

export default SubmissionCard;
