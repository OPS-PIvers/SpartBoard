import React, { useEffect, useState } from 'react';
import type { GuidedLearningSet } from '@/types';
import { loadWebTourDraft } from '@/components/tours/webTours';
import { logError } from '@/utils/logError';
import { WebTourEditor } from './WebTourEditor';
import { EDIT_WEB_TOUR_PARAM } from './tourLinks';

const SET_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Opens the web tour editor on the board for `?edit-web-tour={setId}`, the side panel's Open in SpartBoard link. */
export const WebTourEditorHost: React.FC = () => {
  const [open, setOpen] = useState<GuidedLearningSet | null>(null);
  // Read once, so an effect run twice still knows which tour to open.
  const [setId] = useState(() =>
    new URL(window.location.href).searchParams.get(EDIT_WEB_TOUR_PARAM)
  );

  useEffect(() => {
    if (!setId) return;
    // Taken off the address so a reload doesn't reopen it.
    const url = new URL(window.location.href);
    url.searchParams.delete(EDIT_WEB_TOUR_PARAM);
    window.history.replaceState(window.history.state, '', url.toString());
    if (!SET_ID.test(setId)) return;
    let cancelled = false;
    loadWebTourDraft(setId).then(
      (set) => {
        if (!cancelled && set) setOpen(set);
      },
      (err: unknown) => logError('open web tour from link', err, { setId })
    );
    return () => {
      cancelled = true;
    };
  }, [setId]);

  return open ? (
    <WebTourEditor initial={open} onClose={() => setOpen(null)} />
  ) : null;
};
