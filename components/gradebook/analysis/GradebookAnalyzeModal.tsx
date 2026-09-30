import React, { useContext, useMemo } from 'react';
import { Modal } from '@/components/common/Modal';
import { AuthContext } from '@/context/AuthContextValue';
import { useGradebook } from '@/components/gradebook/GradebookContext';
import { GRADEBOOK_KIND_META } from '@/components/gradebook/kindMeta';
import { useItemAnalysis } from '@/hooks/gradebook/useItemAnalysis';
import { useTargetLookup } from '@/hooks/gradebook/useTargetLookup';
import {
  collectTargets,
  summarizeColumn,
  type AnalysisData,
} from '@/utils/gradebook/gradebookAnalysis';
import { studentName } from '@/utils/gradebook/gradebookModel';
import { buildGradebookPath } from '@/utils/gradebookPath';
import { spaNavigate } from '@/utils/plcPath';
import { GradebookAnalyzeView } from './GradebookAnalyzeView';

export interface GradebookAnalyzeModalProps {
  sessionId: string;
  onClose: () => void;
}

/** D28: class-level cards for one assignment, from its column header or the Analysis tab. */
export const GradebookAnalyzeModal: React.FC<GradebookAnalyzeModalProps> = ({
  sessionId,
  onClose,
}) => {
  const gb = useGradebook();
  const user = useContext(AuthContext)?.user;
  const lookup = useTargetLookup();
  const column = gb.allColumns.find((c) => c.sessionId === sessionId) ?? null;
  const data: AnalysisData = useMemo(
    () => ({
      students: gb.students.map((s) => ({
        uid: s.uid,
        studentId: s.student.id,
        name: studentName(s, gb.view.nameFormat),
      })),
      columns: column ? [column] : [],
      cell: gb.getCell,
      overallPct: (uid) => gb.overall(uid).pct,
    }),
    [gb, column]
  );
  const summary = useMemo(
    () =>
      column
        ? summarizeColumn(data, column, collectTargets(data, lookup))
        : null,
    [data, column, lookup]
  );
  const items = useItemAnalysis(
    column?.kind ?? 'mini-app',
    sessionId,
    user?.uid,
    gb.students.map((s) => s.uid)
  );
  if (!column || !summary) return null;
  return (
    <Modal
      isOpen
      onClose={onClose}
      variant="bare"
      zIndex="z-modal-nested"
      maxWidth="max-w-[1000px]"
      ariaLabel={`${column.title} analysis`}
    >
      <GradebookAnalyzeView
        title={column.title}
        kindLabel={GRADEBOOK_KIND_META[column.kind].label}
        summary={summary}
        scale={gb.scale}
        items={items}
        onOpenStudent={(uid) =>
          spaNavigate(buildGradebookPath(gb.rosterId, 'student', uid))
        }
        onClose={onClose}
      />
    </Modal>
  );
};
