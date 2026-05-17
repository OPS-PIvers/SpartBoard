import { type FC, useState, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import type { SharedCollection } from '@/types';

interface ImportSharedCollectionModalProps {
  shareId: string;
  onClose: () => void;
  onImported: (result: {
    collectionId: string;
    firstBoardId: string | null;
  }) => void;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'found'; meta: SharedCollection }
  | { kind: 'not-found' }
  | { kind: 'expired' }
  | { kind: 'unauthorized' }
  | { kind: 'error' };

export const ImportSharedCollectionModal: FC<
  ImportSharedCollectionModalProps
> = ({ shareId, onClose, onImported }) => {
  const { t } = useTranslation();
  const { loadSharedCollection, importSharedCollection } = useDashboard();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const headingId = useId();
  const meta = state.kind === 'found' ? state.meta : null;

  useEffect(() => {
    let cancelled = false;
    void loadSharedCollection(shareId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setState({ kind: 'found', meta: result.meta });
      } else {
        setState({ kind: result.reason });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [shareId, loadSharedCollection]);

  const handleImport = async () => {
    if (!meta) return;
    setBusy(true);
    // Guard `setBusy(false)` in a finally so a thrown rejection from
    // `importSharedCollection` (network failure, rules denial, etc.)
    // can't leave the Import button permanently disabled/spinning for
    // the rest of the session.
    let result: Awaited<ReturnType<typeof importSharedCollection>>;
    try {
      result = await importSharedCollection(shareId);
    } finally {
      setBusy(false);
    }
    if (result) {
      onImported(result);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-modal bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-slate-100 flex items-center gap-2">
          <Folder
            className="w-5 h-5 flex-shrink-0"
            style={
              meta?.collection.color
                ? { color: meta.collection.color }
                : undefined
            }
          />
          <h2 id={headingId} className="text-lg font-bold text-slate-800">
            {t('importSharedCollection.title', {
              defaultValue: 'Import shared Collection',
            })}
          </h2>
        </div>
        <div className="p-5 space-y-3">
          {state.kind === 'loading' && (
            <p className="text-sm text-slate-500">
              {t('importSharedCollection.loading', {
                defaultValue: 'Loading shared Collection…',
              })}
            </p>
          )}
          {state.kind === 'not-found' && (
            <p className="text-sm text-red-600">
              {t('importSharedCollection.notFound', {
                defaultValue:
                  'Shared Collection not found. The link may be wrong or the host may have deleted it.',
              })}
            </p>
          )}
          {state.kind === 'expired' && (
            <p className="text-sm text-red-600">
              {t('importSharedCollection.expired', {
                defaultValue: 'This shared Collection has expired.',
              })}
            </p>
          )}
          {state.kind === 'unauthorized' && (
            <p className="text-sm text-red-600">
              {t('importSharedCollection.unauthorized', {
                defaultValue:
                  "You don't have permission to view this Collection. Reconnect your Google account or ask the host to re-share.",
              })}
            </p>
          )}
          {state.kind === 'error' && (
            <p className="text-sm text-red-600">
              {t('importSharedCollection.loadError', {
                defaultValue:
                  'Could not load the shared Collection. Check your connection and try again.',
              })}
            </p>
          )}
          {meta && meta.intendedMode === 'substitute' && (
            <p className="text-sm text-amber-600">
              {t('importSharedCollection.substituteOnly', {
                defaultValue:
                  'This is a substitute (view-only) share. Open it in /subs.',
              })}
            </p>
          )}
          {meta && meta.intendedMode === 'copy' && (
            <>
              <p className="text-sm text-slate-800">
                <span className="font-bold">{meta.collection.name}</span>{' '}
                <span className="text-slate-500">
                  (
                  {t('importSharedCollection.boardCount', {
                    count: meta.boardIds.length,
                    defaultValue: '{{count}} board(s)',
                  })}
                  )
                </span>
              </p>
              {meta.hostDisplayName && (
                <p className="text-xs text-slate-500">
                  {t('importSharedCollection.shared', {
                    name: meta.hostDisplayName,
                    defaultValue: 'Shared by {{name}}',
                  })}
                </p>
              )}
            </>
          )}
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
              onClick={() => void handleImport()}
              disabled={
                busy ||
                state.kind !== 'found' ||
                meta?.intendedMode === 'substitute'
              }
              className="px-3 py-1.5 text-sm font-bold bg-brand-blue-primary text-white rounded hover:bg-brand-blue-dark disabled:opacity-50"
            >
              {busy
                ? t('importSharedCollection.importing', {
                    defaultValue: 'Importing…',
                  })
                : t('importSharedCollection.import', {
                    defaultValue: 'Import Collection',
                  })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
