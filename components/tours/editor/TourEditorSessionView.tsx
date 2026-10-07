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
  // A first failed save keeps the editor open with its alert; Close again while it shows closes anyway.
  const close = async () => {
    const alerted = session.saveState === 'error';
    const saved = await session.flush();
    if (saved || alerted || session.isConflicted()) clearTourEdit();
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
      onClose={() => void close()}
      settings={<TourEditorSettings session={session} />}
    />
  );
};

export default TourEditorSessionView;
