/**
 * Teacher-facing modal that publishes an Activity Wall session as a
 * view-only gallery. The teacher picks which gallery interactions to
 * enable (comments, replies, likes) and an optional expiration date.
 *
 * On submit we:
 *   1. Flip `publiclyShared: true` onto `activity_wall_sessions/{sessionId}`
 *      so the read-side Firestore + Storage rules unlock for anonymous
 *      gallery viewers.
 *   2. Write a `shared_activity_walls/{shareId}` doc carrying the gallery
 *      toggles + snapshot of title/prompt/identificationMode.
 *   3. Surface the resulting URL with a copy-to-clipboard button — matches
 *      the ShareLinkCreatorModal UX so the experience feels consistent.
 *
 * View-only philosophy: the gallery never lets viewers submit new
 * activity entries; new posts only happen through the original student
 * URL. Comments + likes are layered on top via subcollections under the
 * share doc so deleting the share also cleans them up.
 */

import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  MessageCircle,
  MessageSquare,
  Heart,
  CalendarClock,
  X,
} from 'lucide-react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { Modal } from '@/components/common/Modal';
import { useDashboard } from '@/context/useDashboard';
import { db } from '@/config/firebase';
import type {
  ActivityWallActivity,
  ActivityWallIdentificationMode,
  SharedActivityWall,
} from '@/types';

interface ActivityWallShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity: ActivityWallActivity | null;
  sessionId: string | null;
  teacherUid: string | null;
}

interface ToggleRowProps {
  id: string;
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({
  id,
  Icon,
  title,
  body,
  checked,
  disabled = false,
  onChange,
}) => {
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-all ${
        disabled
          ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-50/60'
          : checked
            ? 'border-brand-blue-primary bg-brand-blue-lighter/20 cursor-pointer'
            : 'border-slate-200 bg-white hover:border-brand-blue-primary cursor-pointer'
      }`}
    >
      <div
        className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
          checked
            ? 'bg-brand-blue-primary text-white'
            : 'bg-slate-100 text-slate-500'
        }`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
        <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">{body}</p>
      </div>
      <input
        id={id}
        type="checkbox"
        className="mt-1 h-4 w-4 accent-brand-blue-primary cursor-pointer disabled:cursor-not-allowed"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
};

const identificationModeBlurb = (
  mode: ActivityWallIdentificationMode
): string => {
  switch (mode) {
    case 'anonymous':
      return 'Viewers can comment anonymously — same as how students submitted.';
    case 'name':
      return 'Viewers will be asked for their name before posting a comment.';
    case 'pin':
      return 'Viewers will be asked for a PIN before posting a comment.';
    case 'name-pin':
      return 'Viewers will be asked for their name and PIN before posting a comment.';
  }
};

export const ActivityWallShareModal: React.FC<ActivityWallShareModalProps> = ({
  isOpen,
  onClose,
  activity,
  sessionId,
  teacherUid,
}) => {
  const { addToast } = useDashboard();
  const [allowComments, setAllowComments] = useState(true);
  const [allowCommentResponses, setAllowCommentResponses] = useState(true);
  const [allowLikes, setAllowLikes] = useState(true);
  const [enableExpiration, setEnableExpiration] = useState(false);
  const [expiresAtInput, setExpiresAtInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setAllowComments(true);
    setAllowCommentResponses(true);
    setAllowLikes(true);
    setEnableExpiration(false);
    setExpiresAtInput('');
    setCreating(false);
    setCreatedUrl(null);
    setCopied(false);
    setError(null);
  }, [isOpen, activity?.id]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (creating) return;
    if (!activity || !sessionId || !teacherUid) {
      setError(
        'Start the activity first — there are no submissions to share yet.'
      );
      return;
    }

    let expiresAt: number | null = null;
    if (enableExpiration) {
      if (!expiresAtInput) {
        setError('Pick an expiration date or turn off expiration.');
        return;
      }
      const parsed = new Date(expiresAtInput).getTime();
      if (Number.isNaN(parsed)) {
        setError("That expiration date doesn't look right.");
        return;
      }
      if (parsed <= Date.now()) {
        setError('Expiration must be in the future.');
        return;
      }
      expiresAt = parsed;
    }

    setCreating(true);
    setError(null);

    try {
      const shareId = crypto.randomUUID();
      const sharedDoc: SharedActivityWall = {
        id: shareId,
        sessionId,
        originalAuthor: teacherUid,
        title: activity.title,
        prompt: activity.prompt,
        mode: activity.mode,
        identificationMode: activity.identificationMode,
        allowComments,
        allowCommentResponses: allowComments && allowCommentResponses,
        allowLikes,
        expiresAt,
        createdAt: Date.now(),
      };

      // Unlock viewer reads first — if this fails we don't write the share
      // doc, which would otherwise produce a working link that returns
      // permission-denied on every photo/submission read.
      await updateDoc(doc(db, 'activity_wall_sessions', sessionId), {
        publiclyShared: true,
      });

      await setDoc(
        doc(db, 'shared_activity_walls', shareId),
        sharedDoc as unknown as Record<string, unknown>
      );

      const url = `${window.location.origin}/activity-wall/gallery/${shareId}`;
      setCreatedUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        // Clipboard may be blocked — user can still copy manually below.
      }
    } catch (err) {
      console.error('[ActivityWallShareModal] Failed to create share:', err);
      setError('Could not create the gallery link. Please try again.');
      addToast('Failed to create gallery link.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!createdUrl) return;
    try {
      await navigator.clipboard.writeText(createdUrl);
      setCopied(true);
      addToast('Gallery link copied!', 'success');
    } catch {
      addToast(
        'Could not copy automatically — select the link to copy manually.',
        'error'
      );
    }
  };

  // <input type="datetime-local"> wants a value in the form 'YYYY-MM-DDTHH:mm';
  // surface today as the floor so teachers don't accidentally pick a
  // past timestamp.
  const minExpirationInput = (() => {
    const now = new Date();
    const tzOffsetMs = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 16);
  })();

  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel="Create gallery share link"
      maxWidth="max-w-md"
      contentClassName=""
      customHeader={
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
              <ExternalLink className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {createdUrl
                  ? 'Gallery link ready'
                  : 'Share submissions gallery'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[20rem]">
                {activity?.title ?? 'Activity Wall'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      }
    >
      {createdUrl ? (
        <div className="px-5 pb-5 pt-4 space-y-4">
          <p className="text-xs text-slate-600">
            Anyone with this link can view the submissions gallery — no sign-in
            required.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <input
              type="text"
              readOnly
              value={createdUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 bg-transparent text-xs text-slate-700 truncate focus:outline-none"
              aria-label="Share link URL"
            />
            <button
              type="button"
              onClick={() => void handleCopy()}
              className={`shrink-0 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer ${
                copied
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-brand-blue-primary text-white hover:bg-brand-blue-dark'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm py-2 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="px-5 pb-5 pt-4 space-y-3">
          <p className="text-xs text-slate-600">
            Anyone with the link can view this activity&apos;s submissions
            gallery. Pick what gallery viewers can do.
          </p>

          <ToggleRow
            id="aw-share-allow-likes"
            Icon={Heart}
            title="Allow likes"
            body="Viewers can give each submission a heart."
            checked={allowLikes}
            onChange={setAllowLikes}
          />

          <ToggleRow
            id="aw-share-allow-comments"
            Icon={MessageSquare}
            title="Allow comments"
            body={
              activity
                ? identificationModeBlurb(activity.identificationMode)
                : 'Viewers can leave a comment on each submission.'
            }
            checked={allowComments}
            onChange={(next) => {
              setAllowComments(next);
              if (!next) setAllowCommentResponses(false);
            }}
          />

          <ToggleRow
            id="aw-share-allow-replies"
            Icon={MessageCircle}
            title="Allow comment replies"
            body="Viewers can reply to other people's comments."
            checked={allowComments && allowCommentResponses}
            disabled={!allowComments}
            onChange={setAllowCommentResponses}
          />

          <div
            className={`rounded-xl border bg-white px-4 py-3 transition-colors ${
              enableExpiration
                ? 'border-brand-blue-primary'
                : 'border-slate-200'
            }`}
          >
            <label
              htmlFor="aw-share-enable-expiration"
              className="flex items-start gap-3 cursor-pointer"
            >
              <div
                className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                  enableExpiration
                    ? 'bg-brand-blue-primary text-white'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                <CalendarClock className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900 text-sm">
                  Set link expiration
                </h3>
                <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                  The link stops working after this date.
                </p>
              </div>
              <input
                id="aw-share-enable-expiration"
                type="checkbox"
                className="mt-1 h-4 w-4 accent-brand-blue-primary cursor-pointer"
                checked={enableExpiration}
                onChange={(e) => setEnableExpiration(e.target.checked)}
              />
            </label>
            {enableExpiration && (
              <div className="mt-3 pl-12">
                <input
                  type="datetime-local"
                  value={expiresAtInput}
                  min={minExpirationInput}
                  onChange={(e) => setExpiresAtInput(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
                />
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || !activity || !sessionId || !teacherUid}
            className="w-full rounded-lg bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold text-sm py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {creating ? 'Creating link…' : 'Create gallery link'}
          </button>
        </div>
      )}
    </Modal>
  );
};
