import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { GuidedLearningSet } from '@/types';
import { logError } from '@/utils/logError';
import {
  parseProgressDoc,
  summarizeEngagement,
  type GuidedLearningProgress,
} from '../../utils/progress';
import { EngagementView } from './EngagementView';

interface Props {
  set: GuidedLearningSet;
  sessionId: string;
}

/** Engagement section of Results (GL Studio plan P2-5); mount only for `playerV2` sessions. */
export const GuidedLearningEngagement: React.FC<Props> = ({
  set,
  sessionId,
}) => {
  const [docs, setDocs] = useState<GuidedLearningProgress[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'guided_learning_sessions', sessionId, 'progress'),
        (snap) => {
          setDocs(snap.docs.map((d) => parseProgressDoc(d.data())));
          setFailed(false);
        },
        (err) => {
          logError('GuidedLearningEngagement.subscribe', err, { sessionId });
          setFailed(true);
        }
      ),
    [sessionId]
  );

  const summary = useMemo(
    () => (docs ? summarizeEngagement(docs, set.steps) : null),
    [docs, set.steps]
  );

  return <EngagementView set={set} summary={summary} failed={failed} />;
};
