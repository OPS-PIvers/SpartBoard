import React from 'react';
import {
  clearTourEdit,
  getTourEdit,
  setTourEdit,
  useTourEditPlayback,
  useTourEditTarget,
} from './tourEditStore';
import { useTourEditorSession } from './useTourEditorSession';
import { TourEditorPanel } from './TourEditorPanel';
import { TourEditorSettings } from './TourEditorSettings';
import { useEditorThumbnails } from './useEditorThumbnails';

/** The open editor: its session, wired to the docked panel. */
const TourEditorSessionView: React.FC = () => {
  const session = useTourEditorSession();
  const playback = useTourEditPlayback();
  const target = useTourEditTarget();
  useEditorThumbnails(session);
  if (!session || !target) return null;
  const close = () => {
    void session.flush();
    clearTourEdit();
  };
  return (
    <TourEditorPanel
      session={session}
      playback={playback}
      readAloud={{
        on: target.readAloud,
        onToggle: () => {
          const cur = getTourEdit();
          if (cur) setTourEdit({ ...cur, readAloud: !cur.readAloud });
        },
      }}
      onClose={close}
      settings={<TourEditorSettings session={session} />}
    />
  );
};

export default TourEditorSessionView;
