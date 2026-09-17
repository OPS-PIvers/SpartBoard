import React, { useState } from 'react';
import { Code2, Copy, Link2, Loader2, ShieldOff } from 'lucide-react';
import type { FlashcardSet } from '@/types';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';

interface FlashcardShareModalProps {
  isOpen: boolean;
  set: FlashcardSet | null;
  onClose: () => void;
  onPublish: (set: FlashcardSet) => Promise<string>;
  onRevoke: (set: FlashcardSet) => Promise<void>;
  onNotice: (message: string, type: 'success' | 'error') => void;
}

const escapeHtmlAttribute = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

export const FlashcardShareModal: React.FC<FlashcardShareModalProps> = ({
  isOpen,
  set,
  onClose,
  onPublish,
  onRevoke,
  onNotice,
}) => {
  const stateKey = `${isOpen ? 'open' : 'closed'}:${set?.id ?? ''}:${set?.publicShareId ?? ''}`;
  const [previousStateKey, setPreviousStateKey] = useState(stateKey);
  const [shareId, setShareId] = useState<string | null>(
    set?.publicShareId ?? null
  );
  const [busy, setBusy] = useState(false);
  if (previousStateKey !== stateKey) {
    setPreviousStateKey(stateKey);
    setShareId(set?.publicShareId ?? null);
    setBusy(false);
  }

  if (!set) return null;
  const shareUrl = shareId
    ? `${window.location.origin}/flashcards/${encodeURIComponent(shareId)}`
    : '';
  const embedCode = shareId
    ? `<iframe src="${escapeHtmlAttribute(shareUrl)}" title="${escapeHtmlAttribute(set.title)} flashcards" width="100%" height="600" loading="lazy"></iframe>`
    : '';

  const copy = async (value: string, label: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      onNotice(`${label} copied.`, 'success');
    } catch {
      onNotice(
        'Could not copy automatically. Select the text and copy it.',
        'error'
      );
    }
  };

  const publish = async (): Promise<void> => {
    setBusy(true);
    try {
      const nextShareId = await onPublish(set);
      setShareId(nextShareId);
      onNotice('Public flashcard link is live.', 'success');
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : 'Could not create the public link.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (): Promise<void> => {
    setBusy(true);
    try {
      await onRevoke({ ...set, publicShareId: shareId });
      setShareId(null);
      onNotice('Public flashcard link turned off.', 'success');
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : 'Could not turn off the public link.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Share “${set.title}”`}
      maxWidth="max-w-xl"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pb-6">
        {!shareId ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-950">
            <div className="flex gap-3">
              <Link2
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-rose-700"
              />
              <div>
                <h4 className="font-black">Create a public study link</h4>
                <p className="mt-1 text-sm leading-6">
                  Anyone with the link can study without signing in. Progress
                  stays on their device and is never sent to SpartBoard.
                </p>
              </div>
            </div>
            <Button
              className="mt-4"
              onClick={() => void publish()}
              disabled={busy || set.cards.length === 0}
              icon={
                busy ? (
                  <Loader2
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin"
                  />
                ) : (
                  <Link2 aria-hidden="true" className="h-4 w-4" />
                )
              }
            >
              {busy ? 'Creating link…' : 'Create public link'}
            </Button>
          </div>
        ) : (
          <>
            <div>
              <label
                htmlFor="flashcard-share-link"
                className="text-xs font-black uppercase tracking-wider text-slate-700"
              >
                Public link
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="flashcard-share-link"
                  readOnly
                  value={shareUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
                />
                <Button
                  variant="secondary"
                  onClick={() => void copy(shareUrl, 'Link')}
                  icon={<Copy aria-hidden="true" className="h-4 w-4" />}
                >
                  Copy
                </Button>
              </div>
            </div>

            <div>
              <label
                htmlFor="flashcard-embed-code"
                className="text-xs font-black uppercase tracking-wider text-slate-700"
              >
                Embed code
              </label>
              <textarea
                id="flashcard-embed-code"
                readOnly
                rows={3}
                value={embedCode}
                onFocus={(event) => event.currentTarget.select()}
                className="mt-2 w-full resize-none rounded-xl border border-slate-300 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
              />
              <Button
                variant="secondary"
                className="mt-2"
                onClick={() => void copy(embedCode, 'Embed code')}
                icon={<Code2 aria-hidden="true" className="h-4 w-4" />}
              >
                Copy embed code
              </Button>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <ShieldOff
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-slate-700"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">
                  Turning this off makes the current link stop working.
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Sharing again creates a different link. Saving this set keeps
                  the active link up to date automatically.
                </p>
              </div>
              <Button
                variant="danger"
                onClick={() => void revoke()}
                disabled={busy}
              >
                {busy ? 'Turning off…' : 'Turn off'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
