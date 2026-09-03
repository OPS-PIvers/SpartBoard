/**
 * Teacher moderation queue for the active wall: pending posts to approve or
 * reject, plus the approved list with pin / edit / delete. Rendered in a
 * modal so it stays readable no matter how small the widget is on the board.
 */

import React, { useState } from 'react';
import { Check, Pin, PinOff, Trash2, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import type { ActivityWallSubmission } from '@/types';

interface ModerationDrawerProps {
  open: boolean;
  onClose: () => void;
  submissions: ActivityWallSubmission[];
  onApprove: (submissionId: string) => void;
  onReject: (submissionId: string) => void;
  onDelete: (submissionId: string) => void;
  onPin: (submissionId: string, pinned: boolean) => void;
  onEdit: (submissionId: string, content: string) => void;
}

const rowClass =
  'flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2';

const iconButtonClass =
  'shrink-0 rounded-lg p-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary';

interface RowProps {
  submission: ActivityWallSubmission;
  actions: React.ReactNode;
  onEdit: (submissionId: string, content: string) => void;
}

const SubmissionRow: React.FC<RowProps> = ({ submission, actions, onEdit }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(submission.content);

  return (
    <li className={rowClass}>
      <div className="min-w-0 flex-1">
        {submission.participantLabel && (
          <p className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-500">
            {submission.participantLabel}
          </p>
        )}
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label={`Edit post ${submission.id}`}
              className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
            />
            <button
              type="button"
              className="rounded-lg bg-brand-blue-primary px-2 py-1 text-xs font-bold text-white"
              onClick={() => {
                onEdit(submission.id, draft.trim() || submission.content);
                setEditing(false);
              }}
            >
              Save
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(submission.content);
              setEditing(true);
            }}
            className="block w-full break-words text-left text-sm text-slate-800"
            aria-label={`Edit post ${submission.id}`}
          >
            {submission.content}
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
                      aria-label={`Approve post ${submission.id}`}
                      className={`${iconButtonClass} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onReject(submission.id)}
                      aria-label={`Reject post ${submission.id}`}
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
                      aria-label={`${submission.pinned ? 'Unpin' : 'Pin'} post ${submission.id}`}
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
                      aria-label={`Delete post ${submission.id}`}
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
