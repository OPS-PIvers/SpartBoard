import React, { useState } from 'react';
import {
  Check,
  FileText,
  LinkIcon,
  Pin,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import type { ActivityWallSubmission } from '@/types';
import type { WallRenderActions, WallRenderMode } from './types';
import { wallScale } from './scale';
import {
  useWallCardStyle,
  useWallImageSize,
  wallImageDimensions,
} from './imageSize';
import { ImageLightbox } from '@/components/common/ImageLightbox';
import { isArchived, isSafeHttpUrl, useMediaUrl } from './useMediaUrl';

export interface SubmissionCardProps extends WallRenderActions {
  submission: ActivityWallSubmission;
  mode: WallRenderMode;
  showNames: boolean;
  /** Timeline label / column chip rendered under the card body. */
  footnote?: string;
}

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

/** Drive preview URL for an archived video, derived from the stored file id. */
const drivePreviewUrl = (driveFileId: string): string =>
  `https://drive.google.com/file/d/${driveFileId}/preview`;

const PrivateFileNote: React.FC<{ fontSize: string }> = ({ fontSize }) => (
  <p className="opacity-80" style={{ fontSize }}>
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
  onMediaError,
  renderFooter,
}) => {
  const scale = wallScale(mode);
  const { url: mediaUrl, failed: mediaFailed } = useMediaUrl(submission);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const imageSize = useWallImageSize();
  const cardStyle = useWallCardStyle();
  const isWidget = mode === 'widget';
  const tight = isWidget ? 'min(4px, 1.2cqmin)' : '4px';
  const edge = isWidget ? 'min(8px, 2cqmin)' : '8px';
  const chipPad = isWidget ? 'min(8px, 2cqmin)' : '8px';
  const isTeacher = mode === 'teacher';
  const isPending = submission.status === 'pending';
  const hasMeta =
    Boolean(submission.pinned) ||
    Boolean(footnote) ||
    Boolean(showNames && submission.participantLabel);
  const isPrivate = submission.drivePermission === 'private';
  const type = submission.type ?? 'text';

  const body = (() => {
    if (type === 'photo') {
      if (isPrivate) return <PrivateFileNote fontSize={scale.meta} />;
      const failed =
        mediaFailed || (Boolean(mediaUrl) && failedImageUrl === mediaUrl);
      if (!mediaUrl || failed) {
        return (
          <p className="opacity-80" style={{ fontSize: scale.meta }}>
            {failed ? 'Photo unavailable' : 'Loading photo…'}
          </p>
        );
      }
      const alt = submission.title ?? 'Student photo';
      return (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxOpen(true);
            }}
            aria-label={`View ${alt} full size`}
            className="mx-auto block cursor-zoom-in rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            style={{ maxWidth: '100%' }}
          >
            <img
              src={mediaUrl}
              alt={alt}
              className="rounded-lg object-cover"
              // Cap dimensions in every layout so full-width rows (table/timeline) don't blow the image up.
              style={{
                ...wallImageDimensions(imageSize, isWidget),
                width: '100%',
              }}
              onError={() => {
                setFailedImageUrl(mediaUrl);
                onMediaError?.(submission);
              }}
            />
          </button>
          {lightboxOpen && (
            <ImageLightbox
              src={mediaUrl}
              alt={alt}
              onClose={() => setLightboxOpen(false)}
            />
          )}
        </>
      );
    }

    if (type === 'video') {
      if (isPrivate) return <PrivateFileNote fontSize={scale.meta} />;
      if (!isArchived(submission) || !submission.driveFileId) {
        return (
          <p className="opacity-80" style={{ fontSize: scale.meta }}>
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
            className="shrink-0 opacity-80"
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
            <span className="opacity-80" style={{ fontSize: scale.body }}>
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
          <p className="opacity-80" style={{ fontSize: scale.body }}>
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
          className="block min-w-0 max-w-full overflow-hidden rounded-lg border border-white/15 bg-white/5"
          style={{ padding: scale.pad }}
        >
          {preview?.image && (
            <img
              src={preview.image}
              alt=""
              className="w-full rounded object-cover"
              style={{ marginBottom: tight }}
            />
          )}
          <span
            className="flex min-w-0 items-center font-semibold"
            style={{ gap: scale.gap, fontSize: scale.body }}
          >
            <LinkIcon
              aria-hidden="true"
              style={{ width: scale.icon, height: scale.icon }}
              className="shrink-0"
            />
            <span className="min-w-0 break-all [overflow-wrap:anywhere]">
              {preview?.title ?? url}
            </span>
          </span>
          {preview?.description && (
            <span
              className="block opacity-80"
              style={{ marginTop: tight, fontSize: scale.meta }}
            >
              {preview.description}
            </span>
          )}
          <span
            className="block break-all opacity-80"
            style={{ marginTop: tight, fontSize: scale.meta }}
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
      style={{ padding: scale.pad, ...cardStyle }}
      data-testid={`aw-card-${submission.id}`}
    >
      {isTeacher && isPending && (
        <span
          className="absolute rounded-full bg-amber-400 font-bold uppercase tracking-wide text-slate-900"
          style={{
            right: edge,
            top: edge,
            padding: `0 ${chipPad}`,
            fontSize: scale.meta,
          }}
        >
          Pending
        </span>
      )}

      {submission.title && (
        <h3 className="font-bold" style={{ fontSize: scale.title }}>
          {submission.title}
        </h3>
      )}

      <div style={{ marginTop: submission.title ? scale.gap : undefined }}>
        {body}
      </div>

      {hasMeta && (
        <p
          className="flex flex-wrap items-center opacity-80"
          style={{ marginTop: tight, gap: tight, fontSize: scale.meta }}
        >
          {submission.pinned && (
            <span
              className="flex items-center text-amber-300"
              style={{ gap: tight }}
            >
              <Pin
                aria-hidden="true"
                style={{ width: scale.meta, height: scale.meta }}
              />
              Pinned
            </span>
          )}
          {footnote && <span>{footnote}</span>}
          {showNames && submission.participantLabel && (
            <span>{submission.participantLabel}</span>
          )}
        </p>
      )}

      {mode === 'gallery' && renderFooter?.(submission)}

      {isTeacher && (
        <div
          className="flex flex-wrap items-center"
          style={{ marginTop: scale.gap, gap: scale.gap }}
        >
          {isPending && onApprove && (
            <button
              type="button"
              aria-label="Approve post"
              onClick={() => onApprove(submission.id)}
              className="rounded p-1 opacity-80 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <Check style={{ width: scale.icon, height: scale.icon }} />
            </button>
          )}
          {isPending && onReject && (
            <button
              type="button"
              aria-label="Reject post"
              onClick={() => onReject(submission.id)}
              className="rounded p-1 opacity-80 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <X style={{ width: scale.icon, height: scale.icon }} />
            </button>
          )}
          {onPin && (
            <button
              type="button"
              aria-label={submission.pinned ? 'Unpin post' : 'Pin post'}
              onClick={() => onPin(submission.id, !submission.pinned)}
              className="rounded p-1 opacity-80 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <Pin style={{ width: scale.icon, height: scale.icon }} />
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              aria-label="Edit post"
              onClick={() => onEdit(submission.id)}
              className="rounded p-1 opacity-80 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <Pencil style={{ width: scale.icon, height: scale.icon }} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              aria-label="Delete post"
              onClick={() => onDelete(submission.id)}
              className="rounded p-1 opacity-80 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
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
