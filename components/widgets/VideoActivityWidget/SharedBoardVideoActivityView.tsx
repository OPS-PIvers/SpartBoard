// A colleague's video activity open on a shared board: read-only, and Assign copies it into the viewer's library.

import React from 'react';
import { useAuth } from '@/context/useAuth';
import { useVideoActivity } from '@/hooks/useVideoActivity';
import { SharedBoardItemPanel } from '@/components/sharedBoard/SharedBoardItemGate';
import {
  hasSharedBoardCopy,
  sharedBoardCopyId,
  type SharedBoardItemDoc,
  type SharedBoardVideoActivityPayload,
} from '@/utils/sharedBoardItems';
import { VideoActivityPreview } from './components/VideoActivityPreview';

export const SharedBoardVideoActivityView: React.FC<{
  item: SharedBoardItemDoc<SharedBoardVideoActivityPayload>;
  onCopied: (copyId: string) => void;
}> = ({ item, onCopied }) => {
  const { user } = useAuth();
  const { saveActivity } = useVideoActivity(user?.uid);
  const activity = item.payload.activity;

  const copy = async (): Promise<string> => {
    if (!user) throw new Error('Sign in to copy this video activity.');
    const copyId = sharedBoardCopyId(item.itemId);
    if (await hasSharedBoardCopy(user.uid, 'videoActivity', copyId)) {
      return copyId;
    }
    const now = Date.now();
    await saveActivity({
      ...activity,
      id: copyId,
      createdAt: now,
      updatedAt: now,
    });
    return copyId;
  };

  return (
    <SharedBoardItemPanel
      label="video activity"
      onCopy={copy}
      onCopied={onCopied}
    >
      <VideoActivityPreview activity={activity} />
    </SharedBoardItemPanel>
  );
};
