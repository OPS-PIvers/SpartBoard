import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ScrollText, X } from 'lucide-react';
import type {
  ProjectGroup,
  ProjectRun,
  ProjectStep,
  ProjectStepState,
} from '@/types';
import { Modal } from '@/components/common/Modal';
import { useAuth } from '@/context/useAuth';
import { useProjectGroupWork } from '@/hooks/useProjectGroupWork';
import { useProjectUploads } from '@/hooks/useProjectUploads';
import { useProjectGrades } from '@/hooks/useProjectGrades';
import { rubricMaxPoints } from '@/utils/rubricPoints';
import { ProjectOwnGroupSteps } from '@/components/student/project/ProjectOwnGroupSteps';
import { ProjectGroupWork } from '@/components/student/project/ProjectGroupWork';
import { ProjectRubricSheet } from '@/components/student/project/ProjectRubricSheet';
import { ProjectScoreCard } from '@/components/student/project/ProjectScoreCard';
import { stepStateOf } from '../../projectSteps';

interface GroupViewModalProps {
  run: ProjectRun;
  group: ProjectGroup;
  onClose: () => void;
  onSetState: (stepId: string, state: ProjectStepState) => Promise<void>;
}

const noWrite = (): Promise<void> => Promise.resolve();

/** One group's project as its students see it on `/project/:runId`, with step states editable by the teacher. */
export const GroupViewModal: React.FC<GroupViewModalProps> = ({
  run,
  group,
  onClose,
  onSetState,
}) => {
  const { user } = useAuth();
  const work = useProjectGroupWork(run.id, group.id, group.workLinks);
  const files = useProjectUploads(run.id, group.id, user?.uid, 'teacher');
  const { gradesByGroupId } = useProjectGrades(run.id);
  // Students only ever read a released grade.
  const grade = gradesByGroupId[group.id];
  const releasedGrade = grade?.released ? grade : null;

  const [openStepId, setOpenStepId] = useState<string | null>(null);
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rubricOpen, setRubricOpen] = useState(false);

  const steps = run.steps;
  const maxPoints = run.rubric
    ? (run.rubricMaxPoints ?? rubricMaxPoints(run.rubric))
    : 0;

  const pickState = async (step: ProjectStep, next: ProjectStepState) => {
    setOpenStepId(null);
    if (busyStepId || next === stepStateOf(group, step.id)) return;
    setBusyStepId(step.id);
    try {
      await onSetState(step.id, next);
      setNotice(null);
    } catch {
      setNotice('That change could not be saved.');
    } finally {
      setBusyStepId(null);
    }
  };

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        maxWidth="max-w-4xl"
        className="!bg-slate-50"
        ariaLabel={`${group.name}: ${run.title}`}
        customHeader={
          <div className="mb-5 flex shrink-0 flex-wrap items-start justify-between gap-3 p-6 pb-0">
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-black tracking-tight text-slate-900">
                {run.title}
              </h2>
              {run.dueAt && (
                <p className="text-sm font-medium text-slate-500">
                  Due {new Date(run.dueAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {run.rubric && (
                <button
                  type="button"
                  onClick={() => setRubricOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  <ScrollText className="h-4 w-4" strokeWidth={2.25} />
                  How this is scored
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <ProjectOwnGroupSteps
              group={group}
              steps={steps}
              canEdit
              asTeacher
              busyStepId={busyStepId}
              openStepId={openStepId}
              onOpenStep={setOpenStepId}
              onPick={(step, state) => void pickState(step, state)}
            />
          </section>

          {notice && (
            <p
              role="status"
              className="rounded-xl bg-brand-red-primary/10 px-3 py-2 text-sm font-semibold text-brand-red-primary"
            >
              {notice}
            </p>
          )}

          <ProjectGroupWork
            steps={steps}
            workLinks={work.workLinks}
            uploads={files.uploads}
            uploadsLoading={work.loading || files.loading}
            canEdit={false}
            uid={user?.uid ?? ''}
            onAddLink={noWrite}
            onRemoveLink={noWrite}
            onUpload={noWrite}
            onRemoveUpload={noWrite}
            onError={setNotice}
          />

          {releasedGrade && <ProjectScoreCard grade={releasedGrade} />}
        </div>
      </Modal>

      {rubricOpen &&
        run.rubric &&
        createPortal(
          <div className="relative z-modal-nested">
            <ProjectRubricSheet
              rubric={run.rubric}
              maxPoints={maxPoints}
              onClose={() => setRubricOpen(false)}
            />
          </div>,
          document.body
        )}
    </>
  );
};
