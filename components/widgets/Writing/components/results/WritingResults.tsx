// Loads one Writing session's results and its grader; WritingResultsView and WritingGrader draw them.
import React, { useMemo, useState } from 'react';
import { useAuth } from '@/context/useAuth';
import { useAssignmentPseudonymsMulti } from '@/hooks/useAssignmentPseudonyms';
import {
  returnWriting,
  saveWritingFeedback,
  useWritingDrafts,
  useWritingRecord,
  useWritingResults,
} from '@/hooks/useWritingResults';
import {
  buildWritingRows,
  isGradable,
  writingMaxPoints,
} from '@/utils/writingGrading';
import { WritingResultsView } from './WritingResultsView';
import { WritingGrader } from './WritingGrader';

export const WritingResults: React.FC<{
  sessionId: string;
  onBack: () => void;
}> = ({ sessionId, onBack }) => {
  const { user, orgId } = useAuth();
  const record = useWritingRecord(user?.uid, sessionId);
  const { session, responses, loading, error } = useWritingResults(sessionId);
  const classIds = session?.classIds ?? record?.classIds ?? null;
  const pseudonyms = useAssignmentPseudonymsMulti(
    sessionId,
    classIds,
    orgId,
    record?.targetMode === 'students' ? record.targetStudents : undefined
  );
  const rows = useMemo(
    () => buildWritingRows(responses, pseudonyms.byStudentUid),
    [responses, pseudonyms.byStudentUid]
  );
  const gradable = useMemo(() => rows.filter(isGradable), [rows]);
  const [grading, setGrading] = useState<string | null>(null);
  const drafts = useWritingDrafts(grading ? sessionId : null, grading);
  const sessionGrading = session?.grading ?? { mode: 'ungraded' as const };

  return (
    <>
      <WritingResultsView
        title={session?.title ?? record?.title ?? 'Writing'}
        rows={rows}
        maxPoints={writingMaxPoints(sessionGrading)}
        loading={loading || pseudonyms.loading}
        error={error || (!loading && !session)}
        onBack={onBack}
        onGrade={setGrading}
      />
      {grading && session && (
        <WritingGrader
          session={session}
          rows={gradable}
          selectedUid={grading}
          onSelect={setGrading}
          drafts={drafts.drafts}
          draftsLoading={drafts.loading}
          teacherUid={user?.uid ?? ''}
          onSaveFeedback={saveWritingFeedback}
          onReturn={(studentUid, revise, studentCanViewRecord) =>
            returnWriting(
              {
                sessionId,
                studentUid,
                ...(studentCanViewRecord !== session.studentCanViewRecord
                  ? { studentCanViewRecord }
                  : {}),
              },
              revise
            )
          }
          onClose={() => setGrading(null)}
        />
      )}
    </>
  );
};
