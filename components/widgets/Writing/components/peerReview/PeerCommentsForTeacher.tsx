// Partner comments and suggested edits on one student's writing, with who wrote each and what the writer did.
import React from 'react';
import type { WritingPeerMark } from '@/types';
import { useWritingPeerNotes } from '@/hooks/useWritingPeerReview';
import { PeerNotes } from '@/components/student/writing/peerReview/PeerNotes';
import { PEER_STUDENT_STRINGS as S } from '@/components/student/writing/peerReview/peerStrings';

export const PeerCommentsForTeacher: React.FC<{
  sessionId: string;
  studentUid: string;
  nameOf: (uid: string) => string;
  /** Dev harness only: notes built in memory instead of read from Firestore. */
  fixture?: WritingPeerMark[];
}> = ({ sessionId, studentUid, nameOf, fixture }) => {
  const live = useWritingPeerNotes(sessionId, fixture ? null : studentUid);
  const notes = fixture ?? live;
  if (notes.length === 0) return null;
  return (
    <section className="mt-4 border-t border-slate-200 pt-3">
      <h3 className="text-sm font-bold text-slate-800">{S.partnerNotes}</h3>
      <PeerNotes marks={notes} nameOf={nameOf} role="teacher" />
    </section>
  );
};
