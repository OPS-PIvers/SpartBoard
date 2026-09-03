// Teacher moderation queue: approve/reject pending posts, pin/edit/delete approved ones.

import React, { useState } from 'react';
import {
  Check,
  FileText,
  Film,
  LinkIcon,
  Pin,
  PinOff,
  Trash2,
  X,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { useMediaUrl } from '@/components/activityWall/render/useMediaUrl';
import type { ActivityWallSubmission } from '@/types';

interface SubmissionEdit {
  content?: string;
  title?: string;
}

interface ModerationDrawerProps {
  open: boolean;
  onClose: () => void;
  submissions: ActivityWallSubmission[];
  onApprove: (submissionId: string) => void;
  onReject: (submissionId: string) => void;
  onDelete: (submissionId: string) => void;
  onPin: (submissionId: string, pinned: boolean) => void;
  onEdit: (submissionId: string, changes: SubmissionEdit) => void;
}

const rowClass =
  'flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2';

const iconButtonClass =
  'shrink-0 rounded-lg p-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary';

const chipClass =
  'inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600';

/** Short, human-readable stand-in for a post used in button labels. */
const excerpt = (submission: ActivityWallSubmission): string => {
  const type = submission.type ?? 'text';
  const source = submission.title?.trim()
    ? submission.title
    : type === 'file' || type === 'video'
      ? (submission.fileName ?? '')
      : type === 'link'
        ? (submission.linkPreview?.title ?? submission.content)
        : type === 'photo'
          ? ''
          : submission.content;
  const trimmed = source.trim();
  if (!trimmed) return type === 'photo' ? 'photo' : type;
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
};

const linkDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** Compact per-type preview so photo/link/file/video posts never show a raw URL or storage path. */
const SubmissionPreview: React.FC<{ submission: ActivityWallSubmission }> = ({
  submission,
}) => {
  const type = submission.type ?? 'text';
  const { url, failed } = useMediaUrl(submission);
  const isPrivate = submission.drivePermission === 'private';

  if (type === 'photo') {
    if (isPrivate || failed || !url) {
      return (
        <span className={chipClass}>
          {isPrivate
            ? 'Private photo'
            : failed
              ? 'Photo unavailable'
              : 'Photo…'}
        </span>
      );
    }
    return (
      <img
        src={url}
        alt={submission.title ?? 'Student photo'}
        className="h-16 w-16 rounded-lg object-cover"
      />
    );
  }

  if (type === 'video') {
    return (
      <span className={`${chipClass} max-w-full`}>
        <Film aria-hidden="true" className="h-3 w-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {submission.fileName ?? 'Video'}
        </span>
      </span>
    );
  }

  if (type === 'file') {
    return (
      <span className={`${chipClass} max-w-full`}>
        <FileText aria-hidden="true" className="h-3 w-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {submission.fileName ?? 'Attached file'}
        </span>
      </span>
    );
  }

  if (type === 'link') {
    return (
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold text-slate-800">
          {submission.linkPreview?.title ?? submission.content}
        </span>
        <span className="flex items-center gap-1 truncate text-xs text-slate-600">
          <LinkIcon aria-hidden="true" className="h-3 w-3 shrink-0" />
          {submission.linkPreview?.domain ?? linkDomain(submission.content)}
        </span>
      </span>
    );
  }

  return (
    <p className="break-words text-sm text-slate-800">{submission.content}</p>
  );
};

interface RowProps {
  submission: ActivityWallSubmission;
  actions: React.ReactNode;
  onEdit: (submissionId: string, changes: SubmissionEdit) => void;
}

const SubmissionRow: React.FC<RowProps> = ({ submission, actions, onEdit }) => {
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(submission.title ?? '');
  const [contentDraft, setContentDraft] = useState(submission.content);
  const isText = (submission.type ?? 'text') === 'text';
  const label = excerpt(submission);
  const who = submission.participantLabel ?? 'Anonymous';

  const startEditing = () => {
    setTitleDraft(submission.title ?? '');
    setContentDraft(submission.content);
    setEditing(true);
  };

  const save = () => {
    const changes: SubmissionEdit = { title: titleDraft.trim() };
    if (isText) changes.content = contentDraft.trim() || submission.content;
    onEdit(submission.id, changes);
    setEditing(false);
  };

  return (
    <li className={rowClass}>
      <div className="min-w-0 flex-1">
        {submission.participantLabel && (
          <p className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-500">
            {submission.participantLabel}
          </p>
        )}
        {editing ? (
          <div className="space-y-1">
            <input
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              placeholder="Title"
              aria-label={`Title for ${who}'s post: ${label}`}
              className={inputClass}
            />
            {isText ? (
              <input
                value={contentDraft}
                onChange={(event) => setContentDraft(event.target.value)}
                aria-label={`Text of ${who}'s post: ${label}`}
                className={inputClass}
              />
            ) : (
              <SubmissionPreview submission={submission} />
            )}
            <button
              type="button"
              className="rounded-lg bg-brand-blue-primary px-2 py-1 text-xs font-bold text-white transition-colors hover:bg-brand-blue-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
              onClick={save}
            >
              Save
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="block w-full rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
            aria-label={`Edit ${who}'s post: ${label}`}
          >
            {submission.title && (
              <span className="block truncate text-sm font-bold text-slate-800">
                {submission.title}
              </span>
            )}
            <SubmissionPreview submission={submission} />
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">{actions}</div>
    </li>
  );
};

export const ModerationDrawer: React.FC<ModerationDrawerProps> = ({
  open,
  onClose,
  submissions,
  onApprove,
  onReject,
  onDelete,
  onPin,
  onEdit,
}) => {
  if (!open) return null;

  const pending = submissions.filter((s) => s.status === 'pending');
  const approved = submissions.filter((s) => s.status !== 'pending');

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Moderate posts"
      maxWidth="max-w-lg"
      contentClassName="px-5 pb-5"
    >
      <section className="space-y-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
          Pending ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing waiting for review.</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((submission) => (
              <SubmissionRow
                key={submission.id}
                submission={submission}
                onEdit={onEdit}
                actions={
                  <>
                    <button
                      type="button"
                      onClick={() => onApprove(submission.id)}
                      aria-label={`Approve ${submission.participantLabel ?? 'Anonymous'}'s post: ${excerpt(submission)}`}
                      className={`${iconButtonClass} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onReject(submission.id)}
                      aria-label={`Reject ${submission.participantLabel ?? 'Anonymous'}'s post: ${excerpt(submission)}`}
                      className={`${iconButtonClass} bg-rose-50 text-rose-700 hover:bg-rose-100`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-5 space-y-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
          Approved ({approved.length})
        </h3>
        {approved.length === 0 ? (
          <p className="text-sm text-slate-500">No approved posts yet.</p>
        ) : (
          <ul className="space-y-2">
            {approved.map((submission) => (
              <SubmissionRow
                key={submission.id}
                submission={submission}
                onEdit={onEdit}
                actions={
                  <>
                    <button
                      type="button"
                      onClick={() => onPin(submission.id, !submission.pinned)}
                      aria-label={`${submission.pinned ? 'Unpin' : 'Pin'} ${submission.participantLabel ?? 'Anonymous'}'s post: ${excerpt(submission)}`}
                      className={`${iconButtonClass} ${
                        submission.pinned
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {submission.pinned ? (
                        <PinOff className="h-4 w-4" />
                      ) : (
                        <Pin className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(submission.id)}
                      aria-label={`Delete ${submission.participantLabel ?? 'Anonymous'}'s post: ${excerpt(submission)}`}
                      className={`${iconButtonClass} bg-rose-50 text-rose-700 hover:bg-rose-100`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </section>
    </Modal>
  );
};
