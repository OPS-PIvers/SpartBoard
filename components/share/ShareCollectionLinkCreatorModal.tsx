/**
 * ShareCollectionLinkCreatorModal — hand a colleague a copy of a Collection.
 * Writes `/shared_collections/{shareId}` + a frozen Board snapshot per board;
 * the recipient imports it into their own account from `/share-collection/{id}`.
 *
 * Handing a collection to a substitute lives in `ShareWithSubModal`, which owns
 * every sub share (docs/plans/SUB_SHARE_COLLECTIONS.md §3.2).
 */

import { type FC, useState, useId, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder } from 'lucide-react';
import type { Collection, Dashboard } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { logError } from '@/utils/logError';

interface ShareCollectionLinkCreatorModalProps {
  isOpen: boolean;
  collection: Collection | null;
  /** Boards currently in the Collection. Frozen at modal open. */
  boards: Dashboard[];
  onClose: () => void;
}

type CopyState = 'unknown' | 'copied' | 'failed';

export const ShareCollectionLinkCreatorModal: FC<
  ShareCollectionLinkCreatorModalProps
> = ({ isOpen, collection, boards, onClose }) => {
  const { t } = useTranslation();
  const { shareCollection, addToast } = useDashboard();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('unknown');
  const [busy, setBusy] = useState(false);
  const headingId = useId();

  const handleCreate = useCallback(async () => {
    if (!collection) return;
    setBusy(true);
    // try/finally so a throw can't leave the modal stuck on "Creating…".
    try {
      let shareId: string;
      try {
        shareId = await shareCollection({ collection, boards });
      } catch (err) {
        logError('ShareCollectionLinkCreatorModal.create', err, {
          collectionId: collection.id,
          boardCount: boards.length,
        });
        // `commitBoardBatches` re-throws partial-failure errors with a
        // descriptive cause that's safe to show — surface it verbatim so the
        // host knows "X of Y boards committed" rather than a generic toast.
        addToast(
          err instanceof Error
            ? err.message
            : t('shareCollection.createFailed', {
                defaultValue: 'Failed to create Collection share',
              }),
          'error'
        );
        return;
      }
      const url = `${window.location.origin}/share-collection/${shareId}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopyState('copied');
      } catch (err) {
        setCopyState('failed');
        logError('ShareCollectionLinkCreatorModal.clipboard', err);
      }
    } finally {
      setBusy(false);
    }
  }, [collection, boards, shareCollection, addToast, t]);

  if (!isOpen || !collection) return null;

  return (
    <div
      className="fixed inset-0 z-modal bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-slate-100 flex items-center gap-2">
          <Folder
            className="w-5 h-5 flex-shrink-0"
            style={collection.color ? { color: collection.color } : undefined}
          />
          <h2 id={headingId} className="text-lg font-bold text-slate-800">
            {t('shareCollection.title', { defaultValue: 'Share Collection' })}:{' '}
            <span className="font-normal">{collection.name}</span>
          </h2>
        </div>

        {!shareUrl && (
          <div className="p-5 space-y-4">
            <p className="text-sm text-slate-600">
              {t('shareCollection.subtitle', {
                count: boards.length,
                defaultValue:
                  'Sharing {{count}} board(s) from this Collection.',
              })}
            </p>
            <p className="text-xs text-slate-500">
              {t('shareCollection.copyModeHint', {
                defaultValue:
                  'Recipient imports a full copy into their account.',
              })}
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded"
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={busy}
                className="px-3 py-1.5 text-sm font-bold bg-brand-blue-primary text-white rounded hover:bg-brand-blue-dark disabled:opacity-50"
              >
                {busy
                  ? t('shareCollection.creating', { defaultValue: 'Creating…' })
                  : t('shareCollection.createLink', {
                      defaultValue: 'Create link',
                    })}
              </button>
            </div>
          </div>
        )}

        {shareUrl && (
          <div className="p-5 space-y-3">
            {copyState === 'copied' && (
              <p className="text-sm text-slate-600">
                {t('shareCollection.linkCopied', {
                  defaultValue: 'Share link copied to clipboard.',
                })}
              </p>
            )}
            {copyState === 'failed' && (
              <p className="text-sm text-amber-600">
                {t('shareCollection.linkCopyFailed', {
                  defaultValue:
                    'Copy the link below — clipboard access was blocked.',
                })}
              </p>
            )}
            {copyState === 'unknown' && (
              <p className="text-sm text-slate-600">
                {t('shareCollection.linkReady', {
                  defaultValue: 'Share link ready.',
                })}
              </p>
            )}
            <div className="flex gap-1">
              <input
                type="text"
                readOnly
                value={shareUrl}
                aria-label={t('shareCollection.urlLabel', {
                  defaultValue: 'Share collection URL',
                })}
                className="flex-1 px-2 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded select-all"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      await navigator.clipboard.writeText(shareUrl);
                      setCopyState('copied');
                    } catch (err) {
                      setCopyState('failed');
                      logError(
                        'ShareCollectionLinkCreatorModal.manualCopy',
                        err
                      );
                    }
                  })();
                }}
                className="px-2 py-1.5 text-xs font-bold bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
              >
                {t('shareCollection.copy', { defaultValue: 'Copy' })}
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm font-bold bg-brand-blue-primary text-white rounded hover:bg-brand-blue-dark"
              >
                {t('common.done', { defaultValue: 'Done' })}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
