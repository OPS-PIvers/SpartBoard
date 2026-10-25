// Recipient landing for a Synced / View-Only collection link (`/share/collection/{linkId}`).

import React, { useEffect, useState } from 'react';
import { Cloud, Eye, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useLinkedCollection } from '@/hooks/useLinkedCollection';
import { useLinkedCollectionImport } from '@/hooks/useLinkedCollectionImport';
import { uniqueLinkedBoards } from '@/utils/linkedCollectionImport';
import { logError } from '@/utils/logError';
import { tourAttr } from '@/config/tourAnchors';
import type { LinkedCollection, LinkedCollectionMode } from '@/types';

interface ImportLinkedCollectionModalProps {
  linkId: string;
  onClose: () => void;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'found'; link: LinkedCollection }
  | { kind: 'not-found' }
  | { kind: 'ended'; hostName: string }
  | { kind: 'denied' }
  | { kind: 'error' };

const MODE_COPY: Record<
  LinkedCollectionMode,
  {
    title: string;
    body: string;
    Icon: React.ComponentType<{ className?: string }>;
    primary: string;
    toast: string;
  }
> = {
  synced: {
    title: 'Synced',
    body: 'You both edit the same collection.',
    Icon: Cloud,
    primary: 'Import synced collection',
    toast: 'Synced collection imported',
  },
  'view-only': {
    title: 'View-Only',
    body: "You see the host's changes live but can't edit.",
    Icon: Eye,
    primary: 'Open view-only collection',
    toast: 'View-only collection imported',
  },
};

const NOT_FOUND =
  'Shared Collection not found. The link may be wrong or the host may have deleted it.';
const DENIED =
  "You don't have permission to open this collection. Ask the host to share it again.";
const LOAD_ERROR =
  'Could not load the shared Collection. Check your connection and try again.';
const endedMessage = (hostName: string) =>
  `${hostName} stopped sharing this collection.`;

export const ImportLinkedCollectionModal: React.FC<
  ImportLinkedCollectionModalProps
> = ({ linkId, onClose }) => {
  const { canAccessFeature, isAdmin } = useAuth();
  const {
    addToast,
    loadDashboard,
    setActiveCollectionId,
    collectionsApi,
    loading: dashboardsLoading,
  } = useDashboard();
  // The duplicate check needs this teacher's collections and boards loaded first.
  const localReady = !collectionsApi.loading && !dashboardsLoading;
  const { loadLinkedCollection } = useLinkedCollection();
  const { findLocalCollection, firstBoardIn, importLinkedCollection } =
    useLinkedCollectionImport();
  const allowed = canAccessFeature('collection-sync-sharing');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    loadLinkedCollection(linkId).then(
      (link) => {
        if (cancelled) return;
        if (!link) setState({ kind: 'not-found' });
        else if (link.ended)
          setState({ kind: 'ended', hostName: link.hostName ?? 'The host' });
        else setState({ kind: 'found', link });
      },
      (err: unknown) => {
        if (cancelled) return;
        logError('ImportLinkedCollectionModal.load', err, { linkId });
        setState({
          kind:
            (err as { code?: unknown } | null)?.code === 'permission-denied'
              ? 'denied'
              : 'error',
        });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [allowed, linkId, loadLinkedCollection]);

  // isAdmin is null until permissions load; don't flash "no permission" before then.
  const view: LoadState = allowed
    ? state
    : isAdmin === null
      ? { kind: 'loading' }
      : { kind: 'denied' };
  const link = view.kind === 'found' ? view.link : null;
  const copy = link ? MODE_COPY[link.mode] : MODE_COPY.synced;
  const boardCount = link ? uniqueLinkedBoards(link.boards).length : 0;

  const open = (collectionId: string, boardId: string | null) => {
    if (boardId) loadDashboard(boardId);
    else setActiveCollectionId(collectionId);
  };

  const handleConfirm = async () => {
    if (!link) return;
    const existing = findLocalCollection(link.linkId);
    if (existing) {
      open(existing.id, firstBoardIn(existing.id));
      onClose();
      return;
    }
    setBusy(true);
    let result: Awaited<ReturnType<typeof importLinkedCollection>>;
    try {
      result = await importLinkedCollection(link);
    } finally {
      setBusy(false);
    }
    if (!result.ok) {
      if (result.reason === 'ended') {
        setState({ kind: 'ended', hostName: link.hostName ?? 'The host' });
      } else {
        setState({ kind: result.reason === 'denied' ? 'denied' : 'error' });
      }
      return;
    }
    if (result.failed > 0) {
      addToast(`${result.failed} board(s) couldn't be imported.`, 'error');
    }
    addToast(copy.toast, 'success');
    open(result.collectionId, result.firstBoardId);
    onClose();
  };

  const message =
    view.kind === 'not-found'
      ? NOT_FOUND
      : view.kind === 'ended'
        ? endedMessage(view.hostName)
        : view.kind === 'denied'
          ? DENIED
          : view.kind === 'error'
            ? LOAD_ERROR
            : null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel="Import shared collection"
      maxWidth="max-w-md"
      contentClassName=""
      customHeader={
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
              <copy.Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">
                Import shared collection
              </h2>
              {link && (
                <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[20rem]">
                  {link.name}
                  {link.hostName ? ` · from ${link.hostName}` : ''}
                  {` · ${boardCount} board(s)`}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            {...tourAttr('import-linked-collection.close')}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      }
    >
      <div className="px-5 pb-5 pt-4 space-y-4">
        {view.kind === 'loading' && (
          <p className="text-sm text-slate-500">Loading shared Collection…</p>
        )}
        {message && (
          <p
            role="alert"
            className={`text-sm ${view.kind === 'ended' ? 'text-slate-700' : 'text-red-600'}`}
          >
            {message}
          </p>
        )}
        {link && (
          <div className="rounded-xl border border-brand-blue-primary bg-brand-blue-lighter/20 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-lg bg-brand-blue-primary text-white flex items-center justify-center">
                <copy.Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900 text-sm">
                  {copy.title}
                </h3>
                <p className="mt-1 text-xs text-slate-700 leading-relaxed">
                  {copy.body}
                </p>
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            {...tourAttr('import-linked-collection.cancel')}
            className="rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm px-4 py-2 transition-colors cursor-pointer"
          >
            {link ? 'Cancel' : 'Close'}
          </button>
          {link && (
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={busy || !localReady}
              {...tourAttr('import-linked-collection.confirm')}
              className="rounded-lg bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold text-sm px-4 py-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
            >
              {busy ? 'Importing…' : copy.primary}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
