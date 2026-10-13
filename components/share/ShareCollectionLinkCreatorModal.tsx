/**
 * ShareCollectionLinkCreatorModal — hand a colleague a copy of a Collection;
 * subs go through `ShareWithSubModal`.
 */

import { type FC, useState, useId, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, UserCheck } from 'lucide-react';
import type { Collection, Dashboard } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { logError } from '@/utils/logError';
import { tourAttr } from '@/config/tourAnchors';

interface ShareCollectionLinkCreatorModalProps {
  isOpen: boolean;
  collection: Collection | null;
  /** Boards currently in the Collection. Frozen at modal open. */
  boards: Dashboard[];
  onClose: () => void;
  /** Opens ShareWithSubModal. */
  onShareWithSub?: () => void;
}

type CopyState = 'unknown' | 'copied' | 'failed';

export const ShareCollectionLinkCreatorModal: FC<
  ShareCollectionLinkCreatorModalProps
> = ({ isOpen, collection, boards, onClose, onShareWithSub }) => {
  const { t } = useTranslation();
  const { shareCollection, addToast } = useDashboard();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('unknown');
  const [busy, setBusy] = useState(false);
  const headingId = useId();

  const handleCreate = useCallback(async () => {
    if (!collection) return;
    setBusy(true);
    // try/finally guarantees `setBusy(false)` runs even if a future
    // refactor adds an early `return` after a throw or an unawaited
    // sub-action raises — without it, the modal would lock into a
    // permanently "Creating…" state for the rest of the session.
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
        // descriptive cause that's safe to show — surface verbatim so the
        // host knows "X of Y boards committed" rather than a generic toast.
        const message =
          err instanceof Error
            ? err.message
            : t('shareCollection.createFailed', {
                defaultValue: 'Failed to create Collection share',
              });
        addToast(message, 'error');
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
            {t('shareCollection.title', {
              defaultValue: 'Share Collection',
            })}
            : <span className="font-normal">{collection.name}</span>
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
                defaultValue: 'They get their own copy to edit.',
              })}
            </p>
            {onShareWithSub && (
              <button
                type="button"
                onClick={onShareWithSub}
                {...tourAttr('share-collection.share-with-sub')}
                className="w-full flex items-start gap-2 p-3 rounded-lg border border-slate-200 text-left hover:bg-slate-50"
              >
                <UserCheck className="w-3.5 h-3.5 mt-0.5 text-slate-800" />
                <span className="flex-1">
                  <span className="block text-sm font-bold text-slate-800">
                    {t('shareCollection.subShare', {
                      defaultValue: 'Share with a sub',
                    })}
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    {t('shareCollection.substituteModeHint', {
                      defaultValue:
                        'Shows in the Substitute Portal for the time you set.',
                    })}
                  </span>
                </span>
              </button>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                {...tourAttr('share-collection.cancel')}
                className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded"
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={busy}
                {...tourAttr('share-collection.create')}
                className="px-3 py-1.5 text-sm font-bold bg-brand-blue-primary text-white rounded hover:bg-brand-blue-dark disabled:opacity-50"
              >
                {busy
                  ? t('shareCollection.creating', {
                      defaultValue: 'Creating…',
                    })
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
                {...tourAttr('share-collection.url')}
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
                {...tourAttr('share-collection.copy-link')}
                className="px-2 py-1.5 text-xs font-bold bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
              >
                {t('shareCollection.copy', { defaultValue: 'Copy' })}
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                {...tourAttr('share-collection.done')}
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
