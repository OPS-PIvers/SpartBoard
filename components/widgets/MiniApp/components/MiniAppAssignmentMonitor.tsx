// Opens one assignment's monitor or results from the In Progress and Completed rows.
import React, { useEffect, useEffectEvent, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { db } from '@/config/firebase';
import type { MiniAppAssignment, MiniAppSession } from '@/types';
import { SubmissionsModal } from './SubmissionsModal';

export const MiniAppAssignmentMonitor: React.FC<{
  assignment: MiniAppAssignment;
  view: 'monitor' | 'results';
  onClose: () => void;
  onMissing: () => void;
}> = ({ assignment, view, onClose, onMissing }) => {
  const [session, setSession] = useState<MiniAppSession | null>(null);
  const { sessionId } = assignment;
  const missing = useEffectEvent(onMissing);

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'mini_app_sessions', sessionId),
        (snap) => {
          if (!snap.exists()) {
            missing();
            return;
          }
          setSession({ ...(snap.data() as MiniAppSession), id: snap.id });
        },
        () => missing()
      ),
    [sessionId]
  );

  if (!session || session.id !== sessionId) {
    return (
      <div className="absolute inset-0 z-overlay flex items-center justify-center bg-white text-brand-blue-primary">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <SubmissionsModal
      sessionId={sessionId}
      assignmentName={assignment.assignmentName || session.assignmentName}
      classIds={session.classIds}
      session={session}
      view={view}
      onClose={onClose}
    />
  );
};
