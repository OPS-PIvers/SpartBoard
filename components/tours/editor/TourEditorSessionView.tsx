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

/** The open editor: its session, wired to the docked panel. */
const TourEditorSessionView: React.FC = () => {
  const session = useTourEditorSession();
  const playback = useTourEditPlayback();
  const target = useTourEditTarget();
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
    />
  );
};

export default TourEditorSessionView;
