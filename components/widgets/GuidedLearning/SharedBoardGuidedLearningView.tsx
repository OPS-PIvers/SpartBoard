// A colleague's guided activity open on a shared board: read-only, and Assign copies it into the viewer's library.

import React, { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useGuidedLearning } from '@/hooks/useGuidedLearning';
import { SharedBoardItemPanel } from '@/components/sharedBoard/SharedBoardItemGate';
import {
  hasSharedBoardCopy,
  sharedBoardCopyId,
  type SharedBoardGuidedLearningPayload,
  type SharedBoardItemDoc,
} from '@/utils/sharedBoardItems';
import type { GuidedLearningSet } from '@/types';

const GuidedLearningPlayer = lazy(() =>
  import('./components/GuidedLearningPlayer').then((m) => ({
    default: m.GuidedLearningPlayer,
  }))
);

export const SharedBoardGuidedLearningView: React.FC<{
  item: SharedBoardItemDoc<SharedBoardGuidedLearningPayload>;
  onCopied: (copyId: string) => void;
}> = ({ item, onCopied }) => {
  const { user } = useAuth();
  const { saveSet } = useGuidedLearning(user?.uid);
  // Narration and media travel as tokenized URLs; the copy carries no Storage paths of the owner's.
  const set = item.payload.set as GuidedLearningSet;

  const copy = async (): Promise<string> => {
    if (!user) throw new Error('Sign in to copy this guided activity.');
    const copyId = sharedBoardCopyId(item.itemId);
    if (await hasSharedBoardCopy(user.uid, 'guidedLearning', copyId)) {
      return copyId;
    }
    const now = Date.now();
    const { isBuilding: _isBuilding, helpCenter: _helpCenter, ...rest } = set;
    await saveSet({
      ...rest,
      id: copyId,
      authorUid: user.uid,
      createdAt: now,
      updatedAt: now,
    });
    return copyId;
  };

  return (
    <SharedBoardItemPanel
      label="guided activity"
      onCopy={copy}
      onCopied={onCopied}
    >
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Loader2
              className="animate-spin text-slate-400"
              style={{
                width: 'min(32px, 8cqmin)',
                height: 'min(32px, 8cqmin)',
              }}
            />
          </div>
        }
      >
        <GuidedLearningPlayer set={set} revealAnswers />
      </Suspense>
    </SharedBoardItemPanel>
  );
};
