// Shares an Activity Wall: the student link, or a read-only public gallery behind an /r/<code> short link.

import React, { useState } from 'react';
import {
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  QrCode,
  Share2,
  X,
} from 'lucide-react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { Modal } from '@/components/common/Modal';
import { useDashboardActions } from '@/context/dashboardCanvasStore';
import { db } from '@/config/firebase';
import { createShortLinkAtomic } from '@/hooks/useShortLinks';
import { generateRandomCode } from '@/utils/shortLinkValidation';
import { buildGalleryLink, buildShortLinkUrl } from '@/utils/activityWallLinks';
import type { ActivityWallLibraryEntry, SharedActivityWall } from '@/types';

type ShareTab = 'student' | 'gallery';

interface ActivityWallShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: ActivityWallLibraryEntry | null;
  sessionId: string | null;
  teacherUid: string | null;
  /** Teacher's email, stamped on the minted short link for admin attribution. */
  teacherEmail?: string | null;
  /** The single link students post and view the wall at. */
  studentUrl: string;
  /** Latest public gallery link, when one was already created. */
  existingGalleryUrl?: string;
  /** Drops a join-QR sticker on the board; omitted when the board is read-only. */
  onAddQr?: () => void;
  /** Called with the minted short-link code so the widget can offer "Open gallery". */
  onShareCreated?: (code: string) => void;
}

const TABS: { id: ShareTab; label: string }[] = [
  { id: 'student', label: 'Student link' },
  { id: 'gallery', label: 'Public gallery' },
];

/** Mints a `/r/<code>` short link; returns null when rules or the network deny it. */
const mintGalleryShortLink = async (
  destination: string,
  uid: string,
  email: string
): Promise<string | null> => {
  const now = Date.now();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateRandomCode();
    try {
      const result = await createShortLinkAtomic(code, {
        code,
        destination,
        createdBy: uid,
        createdByEmail: email,
        createdAt: now,
        updatedAt: now,
        clicks: 0,
        lastClickedAt: null,
      });
      if (result.ok) return code;
    } catch (err) {
      console.warn('[ActivityWallShareModal] Short link mint failed:', err);
      return null;
    }
  }
  return null;
};

interface CopyableLinkProps {
  url: string;
  label: string;
  copied: boolean;
  onCopy: () => void;
}

const CopyableLink: React.FC<CopyableLinkProps> = ({
  url,
  label,
  copied,
  onCopy,
}) => (
  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
    <input
      type="text"
      readOnly
      value={url}
      onFocus={(e) => e.currentTarget.select()}
      className="flex-1 bg-transparent text-xs text-slate-700 truncate focus:outline-none"
      aria-label={label}
    />
    <button
      type="button"
      onClick={onCopy}
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
);

export const ActivityWallShareModal: React.FC<ActivityWallShareModalProps> = ({
  isOpen,
  onClose,
  entry,
  sessionId,
  teacherUid,
  teacherEmail,
  studentUrl,
  existingGalleryUrl,
  onAddQr,
  onShareCreated,
}) => {
  const { addToast } = useDashboardActions();
  const [tab, setTab] = useState<ShareTab>('student');
  const [enableExpiration, setEnableExpiration] = useState(false);
  const [expiresAtInput, setExpiresAtInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [longUrl, setLongUrl] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyLink = async (url: string, key: string, successText: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      addToast(successText, 'success');
    } catch {
      addToast(
        'Could not copy automatically — select the link to copy manually.',
        'error'
      );
    }
  };

  const handleCreate = async () => {
    if (creating) return;
    if (!entry || !sessionId || !teacherUid) {
      setError('Pick a wall first — there is nothing to share yet.');
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
      const allowComments = entry.allowComments ?? false;
      const sharedDoc: SharedActivityWall = {
        id: shareId,
        sessionId,
        originalAuthor: teacherUid,
        title: entry.title,
        prompt: entry.prompt,
        mode: entry.mode,
        identificationMode: entry.identificationMode,
        allowComments,
        allowCommentResponses:
          (allowComments && entry.allowCommentResponses) ?? false,
        allowLikes: entry.allowLikes ?? false,
        expiresAt,
        createdAt: Date.now(),
      };

      // Unlock viewer reads first, or every gallery submission read denies.
      await updateDoc(doc(db, 'activity_wall_sessions', sessionId), {
        publiclyShared: true,
        latestShareId: shareId,
      });

      await setDoc(
        doc(db, 'shared_activity_walls', shareId),
        sharedDoc as unknown as Record<string, unknown>
      );

      const origin = window.location.origin;
      const gallery = buildGalleryLink(origin, shareId);
      setLongUrl(gallery);

      const code = await mintGalleryShortLink(
        gallery,
        teacherUid,
        teacherEmail ?? ''
      );
      if (code) {
        await setDoc(
          doc(db, 'activity_wall_sessions', sessionId),
          { latestShareCode: code },
          { merge: true }
        );
        onShareCreated?.(code);
      }

      const primary = code ? buildShortLinkUrl(origin, code) : gallery;
      setCreatedUrl(primary);
      try {
        await navigator.clipboard.writeText(primary);
        setCopiedKey('created');
      } catch {
        // Clipboard may be blocked — the link is selectable below.
      }
    } catch (err) {
      console.error('[ActivityWallShareModal] Failed to create share:', err);
      setError('Could not create the gallery link. Please try again.');
      addToast('Failed to create gallery link.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const minExpirationInput = (() => {
    const now = new Date();
    const tzOffsetMs = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 16);
  })();

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = TABS.findIndex((t) => t.id === tab);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    setTab(next.id);
    document.getElementById(`aw-share-tab-${next.id}`)?.focus();
  };

  const studentPanel = (
    <div className="px-5 pb-5 pt-4 space-y-3">
      <p className="text-xs text-slate-600">
        Students post and see the wall at this link.
      </p>
      {studentUrl ? (
        <CopyableLink
          url={studentUrl}
          label="Student link URL"
          copied={copiedKey === 'student'}
          onCopy={() =>
            void copyLink(studentUrl, 'student', 'Student link copied!')
          }
        />
      ) : (
        <p className="text-xs text-slate-500">
          Pick a wall first — there is no link yet.
        </p>
      )}
      {onAddQr && studentUrl && (
        <button
          type="button"
          onClick={onAddQr}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm py-2 transition-colors cursor-pointer"
        >
          <QrCode className="w-4 h-4" aria-hidden="true" />
          Add join QR to board
        </button>
      )}
    </div>
  );

  const galleryPanel = createdUrl ? (
    <div className="px-5 pb-5 pt-4 space-y-4">
      <p className="text-xs text-slate-600">
        Anyone with this link can view the gallery, no sign-in required.
      </p>
      <CopyableLink
        url={createdUrl}
        label="Share link URL"
        copied={copiedKey === 'created'}
        onCopy={() =>
          void copyLink(createdUrl, 'created', 'Gallery link copied!')
        }
      />
      {longUrl && longUrl !== createdUrl && (
        <p className="text-[11px] text-slate-500 break-all">
          Full link: <span className="select-all">{longUrl}</span>
        </p>
      )}
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
        Anyone with this link can view the gallery, no sign-in required.
      </p>

      {existingGalleryUrl && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-700">Current link</p>
          <CopyableLink
            url={existingGalleryUrl}
            label="Current gallery link URL"
            copied={copiedKey === 'existing'}
            onCopy={() =>
              void copyLink(
                existingGalleryUrl,
                'existing',
                'Gallery link copied!'
              )
            }
          />
        </div>
      )}

      <div
        className={`rounded-xl border bg-white px-4 py-3 transition-colors ${
          enableExpiration ? 'border-brand-blue-primary' : 'border-slate-200'
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
        disabled={creating || !entry || !sessionId || !teacherUid}
        className="w-full rounded-lg bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold text-sm py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {creating
          ? 'Creating link…'
          : existingGalleryUrl
            ? 'Create new gallery link'
            : 'Create public gallery link'}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel="Share wall"
      maxWidth="max-w-md"
      contentClassName=""
      customHeader={
        <div className="border-b border-slate-100">
          <div className="flex items-start justify-between px-5 pt-5 pb-3">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
                {tab === 'gallery' ? (
                  <ExternalLink className="w-5 h-5" />
                ) : (
                  <Share2 className="w-5 h-5" />
                )}
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Share wall
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[20rem]">
                  {entry?.title ?? 'Activity Wall'}
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
          <div role="tablist" aria-label="Share options" className="flex px-5">
            {TABS.map((t) => {
              const selected = tab === t.id;
              return (
                <button
                  key={t.id}
                  id={`aw-share-tab-${t.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`aw-share-panel-${t.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  onKeyDown={onTabKeyDown}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${
                    selected
                      ? 'border-brand-blue-primary text-brand-blue-primary'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      }
    >
      <div
        role="tabpanel"
        id={`aw-share-panel-${tab}`}
        aria-labelledby={`aw-share-tab-${tab}`}
      >
        {tab === 'student' ? studentPanel : galleryPanel}
      </div>
    </Modal>
  );
};
