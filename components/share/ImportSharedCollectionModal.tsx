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

export const ImportSharedCollectionModal: FC<
  ImportSharedCollectionModalProps
> = ({ shareId, onClose, onImported }) => {
  const { t } = useTranslation();
  const { loadSharedCollection, importSharedCollection } = useDashboard();
  const [meta, setMeta] = useState<SharedCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const headingId = useId();

  useEffect(() => {
    let cancelled = false;
    void loadSharedCollection(shareId).then((result) => {
      if (!cancelled) {
        setMeta(result);
        setLoading(false);
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
          {loading && (
            <p className="text-sm text-slate-500">
              {t('importSharedCollection.loading', {
                defaultValue: 'Loading shared Collection…',
              })}
            </p>
          )}
          {!loading && !meta && (
            <p className="text-sm text-red-600">
              {t('importSharedCollection.notFound', {
                defaultValue: 'Shared Collection not found or expired.',
              })}
            </p>
          )}
          {!loading && meta && (
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
              disabled={busy || loading || !meta}
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
