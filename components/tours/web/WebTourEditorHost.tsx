import React, { useEffect } from 'react';
import { EDIT_WEB_TOUR_PARAM } from './tourLinks';

/** Sends an older extension's `/?edit-web-tour={setId}` link on to the Web tours page (HELP_CENTER_HOME.md H9). */
export const WebTourEditorHost: React.FC = () => {
  useEffect(() => {
    const setId = new URL(window.location.href).searchParams.get(
      EDIT_WEB_TOUR_PARAM
    );
    if (!setId) return;
    const target = new URL('/web-tours', window.location.origin);
    target.searchParams.set(EDIT_WEB_TOUR_PARAM, setId);
    window.location.replace(target.toString());
  }, []);
  return null;
};
