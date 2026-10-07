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
  // A failed save keeps the editor open with its alert; a conflict can't be saved, so it closes.
  const close = async () => {
    const saved = await session.flush();
    if (saved || session.saveState === 'conflict') clearTourEdit();
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
