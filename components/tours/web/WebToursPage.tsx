import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { GuidedLearningSet } from '@/types';
import { tourAttr } from '@/config/tourAnchors';
import { focusRing, headerBar } from '@/components/common/lightChrome';
import {
  createWebTourDraft,
  loadWebTourDraft,
  watchWebTourDrafts,
} from '@/components/tours/webTours';
import { logError } from '@/utils/logError';
import { EDIT_WEB_TOUR_PARAM } from './tourLinks';
import { WebTourList } from './WebTourList';
import { WebTourHealthSection } from './WebTourHealthSection';
import { WebTourEditorRosters } from './WebTourEditorRosters';

const WebTourEditor = lazy(() =>
  import('./WebTourEditor').then((m) => ({ default: m.WebTourEditor }))
);

const SET_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** The standalone Web tours page at `/web-tours` (HELP_CENTER_HOME.md H9). */
export const WebToursPage: React.FC = () => {
  const [tours, setTours] = useState<GuidedLearningSet[] | null>(null);
  const [open, setOpen] = useState<GuidedLearningSet | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [listFailed, setListFailed] = useState(false);
  // Read once, so an effect run twice still knows which tour to open.
  const [linkedId] = useState(() =>
    new URL(window.location.href).searchParams.get(EDIT_WEB_TOUR_PARAM)
  );

  useEffect(
    () =>
      watchWebTourDrafts(
        (sets) => {
          setListFailed(false);
          setTours(sets);
        },
        () => setListFailed(true)
      ),
    []
  );

  useEffect(() => {
    if (!linkedId) return;
    // Taken off the address so a reload doesn't reopen it.
    const url = new URL(window.location.href);
    url.searchParams.delete(EDIT_WEB_TOUR_PARAM);
    window.history.replaceState(window.history.state, '', url.toString());
    if (!SET_ID.test(linkedId)) return;
    let cancelled = false;
    loadWebTourDraft(linkedId).then(
      (set) => {
        if (cancelled) return;
        if (set) setOpen(set);
        else setMessage("That web tour wasn't found.");
      },
      (err: unknown) => {
        logError('open web tour from link', err, { setId: linkedId });
        if (!cancelled) setMessage("That web tour couldn't be opened.");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [linkedId]);

  const create = async () => {
    setCreating(true);
    setMessage(null);
    try {
      setOpen(await createWebTourDraft());
    } catch (err) {
      logError('WebToursPage.create', err);
      setMessage('The web tour could not be created.');
    } finally {
      setCreating(false);
    }
  };

  const edit = (set: GuidedLearningSet) => {
    setMessage(null);
    setOpen(set);
  };

  return (
    <main className="h-screen [height:100dvh] overflow-y-auto bg-slate-50 pb-16">
      <header className={headerBar}>
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
          <h1 className="text-lg font-bold">Web tours</h1>
          <button
            type="button"
            onClick={() => void create()}
            disabled={creating}
            className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-brand-blue-dark hover:bg-brand-blue-lighter disabled:opacity-60 ${focusRing}`}
            {...tourAttr('web-tours.new')}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            New web tour
          </button>
        </div>
      </header>
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 pt-6">
        {message && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
          >
            {message}
          </p>
        )}
        {listFailed ? (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
          >
            Web tours couldn&apos;t load.
          </p>
        ) : tours === null ? (
          <div className="flex justify-center py-10">
            <Loader2
              className="h-6 w-6 animate-spin text-slate-400"
              aria-label="Loading web tours"
            />
          </div>
        ) : (
          <WebTourList
            tours={tours}
            onEdit={edit}
            onCheck={edit}
            onCopyFailed={() => setMessage("The link couldn't be copied.")}
          />
        )}
        <WebTourHealthSection />
      </div>
      {open && (
        <Suspense fallback={null}>
          <WebTourEditorRosters>
            <WebTourEditor initial={open} onClose={() => setOpen(null)} />
          </WebTourEditorRosters>
        </Suspense>
      )}
    </main>
  );
};
