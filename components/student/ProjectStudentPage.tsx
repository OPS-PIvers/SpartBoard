import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Loader2,
  ScrollText,
} from 'lucide-react';
import type { ProjectStep, ProjectStepState } from '@/types';
import { useStudentAuth } from '@/context/useStudentAuth';
import { useDialog } from '@/context/useDialog';
import { submitProjectGroup } from '@/utils/projectRunWrites';
import { useStudentProjectRun } from '@/hooks/useStudentProjectRun';
import { useProjectsWidgetSettings } from '@/hooks/useProjectsWidgetSettings';
import { useProjectUploads } from '@/hooks/useProjectUploads';
import {
  stepStateOf,
  studentStateOptions,
} from '@/components/widgets/Projects/projectSteps';
import { rubricMaxPoints } from '@/utils/rubricPoints';
import { StudentPageShell } from './StudentPageShell';
import { ProjectGroupWork } from './project/ProjectGroupWork';
import { ProjectOwnGroupSteps } from './project/ProjectOwnGroupSteps';
import { ProjectRubricSheet } from './project/ProjectRubricSheet';
import { ProjectScoreCard } from './project/ProjectScoreCard';
import { parseProjectRunId, projectBackHref } from './project/projectRoute';

const Centered: React.FC<{
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  body: string;
}> = ({ icon: Icon, title, body }) => (
  <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center">
    <Icon className="mx-auto h-8 w-8 text-slate-300" strokeWidth={2} />
    <h2 className="mt-3 text-lg font-bold text-slate-900">{title}</h2>
    <p className="mt-1 text-sm text-slate-500">{body}</p>
  </div>
);

const formatSubmittedDay = (at: number): string =>
  new Date(at).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

/** `/project/:runId` — a group's own view of one project (§6, D30); rules enforce the limits. */
export const ProjectStudentPage: React.FC = () => {
  const { pseudonymUid } = useStudentAuth();
  const runId = useMemo(() => parseProjectRunId(window.location.pathname), []);

  const {
    run,
    myGroup,
    workLinks,
    grade,
    loading,
    error,
    setStepState,
    addWorkLink,
    removeWorkLink,
  } = useStudentProjectRun(runId, pseudonymUid);

  const {
    uploads,
    loading: uploadsLoading,
    uploadFile,
    removeUpload,
  } = useProjectUploads(
    runId,
    myGroup?.id,
    pseudonymUid ?? undefined,
    'student'
  );

  // The rollout switch is the kill switch (§7): with it off, a run that
  // already exists must stop being reachable here, not just stop being made.
  const { enabled } = useProjectsWidgetSettings();

  const [notice, setNotice] = useState<string | null>(null);
  const [rubricOpen, setRubricOpen] = useState(false);
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const [openStepId, setOpenStepId] = useState<string | null>(null);

  const { showConfirm } = useDialog();
  const [submitting, setSubmitting] = useState(false);

  const steps: ProjectStep[] = run?.steps ?? [];
  const submittedAt = myGroup?.submittedAt;
  const submitted = typeof submittedAt === 'number' && submittedAt > 0;
  const canEdit =
    Boolean(myGroup) && run?.acceptingUpdates === true && !submitted;
  const canSubmit = canEdit && run?.studentSubmit === true;

  const maxPoints = run?.rubric
    ? (run.rubricMaxPoints ?? rubricMaxPoints(run.rubric))
    : 0;
  // A4 — an override is an absolute score, so it replaces the group total
  // rather than adjusting it.
  const myOverride = pseudonymUid
    ? grade?.overridesByUid?.[pseudonymUid]
    : undefined;

  const pickState = async (step: ProjectStep, next: ProjectStepState) => {
    setOpenStepId(null);
    if (!canEdit || busyStepId || !myGroup) return;
    const current = stepStateOf(myGroup, step.id);
    // D41 — an approved step is locked, and students never set an approval step to done.
    if (step.requiresApproval && current === 'done') return;
    if (!studentStateOptions(step).includes(next) || next === current) return;
    setBusyStepId(step.id);
    try {
      await setStepState(step.id, next);
      setNotice(null);
    } catch {
      setNotice('That change could not be saved.');
    } finally {
      setBusyStepId(null);
    }
  };

  const submit = async () => {
    if (!canSubmit || !runId || !myGroup || submitting) return;
    const open = steps.filter((step) => {
      const state = stepStateOf(myGroup, step.id);
      return state !== 'done' && state !== 'readyForReview';
    }).length;
    const lead =
      open === 0
        ? ''
        : open === 1
          ? "1 step isn't done yet. "
          : `${open} steps aren't done yet. `;
    const ok = await showConfirm(
      `${lead}Everyone in ${myGroup.name} will see it as submitted. You can't make changes after this.`,
      { title: 'Submit for your group?', confirmLabel: 'Submit' }
    );
    if (!ok) return;
    setSubmitting(true);
    try {
      await submitProjectGroup(runId, myGroup.id);
      setNotice(null);
    } catch {
      setNotice('Your project could not be submitted. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const body = () => {
    if (!enabled) {
      return (
        <Centered
          icon={AlertCircle}
          title="Projects is not switched on"
          body="Your school has this turned off right now. Check My Assignments for your other work."
        />
      );
    }
    if (!runId) {
      return (
        <Centered
          icon={AlertCircle}
          title="That link is not a project"
          body="Open the project from My Assignments."
        />
      );
    }
    if (loading) {
      return (
        <div className="flex justify-center py-16">
          <Loader2
            aria-label="Loading this project"
            className="h-8 w-8 animate-spin text-slate-300"
          />
        </div>
      );
    }
    if (error || !run) {
      return (
        <Centered
          icon={AlertCircle}
          title="This project could not be opened"
          body="It may have been closed. Check My Assignments, or ask your teacher."
        />
      );
    }
    if (!myGroup) {
      return (
        <Centered
          icon={ClipboardList}
          title="You are not in a group yet"
          body="Your teacher still has to add you to a group on this project."
        />
      );
    }

    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <ProjectOwnGroupSteps
            group={myGroup}
            steps={steps}
            canEdit={canEdit}
            busyStepId={busyStepId}
            openStepId={openStepId}
            onOpenStep={setOpenStepId}
            onPick={(step, state) => void pickState(step, state)}
          />

          {!canEdit && !submitted && myGroup && (
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Your teacher has closed this project to changes. You can still see
              everything here.
            </p>
          )}
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
          workLinks={workLinks}
          uploads={uploads}
          uploadsLoading={uploadsLoading}
          canEdit={canEdit}
          uid={pseudonymUid ?? ''}
          onAddLink={addWorkLink}
          onRemoveLink={removeWorkLink}
          onUpload={uploadFile}
          onRemoveUpload={removeUpload}
          onError={setNotice}
        />

        {submitted ? (
          <p
            role="status"
            className="flex items-center gap-2 text-sm font-semibold text-slate-700"
          >
            <CheckCircle2
              aria-hidden="true"
              className="h-5 w-5 text-emerald-600"
              strokeWidth={2.25}
            />
            {myGroup.submittedLate ? 'Submitted late' : 'Submitted'}{' '}
            {formatSubmittedDay(submittedAt ?? 0)}.
          </p>
        ) : (
          canSubmit && (
            <div className="flex justify-end">
              {/* no-tour-anchor: student screen; live tours walk teachers. */}
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-blue-primary px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-blue-dark disabled:opacity-60"
              >
                {submitting && (
                  <Loader2
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin"
                  />
                )}
                Submit project
              </button>
            </div>
          )
        )}

        {grade && <ProjectScoreCard grade={grade} override={myOverride} />}
      </div>
    );
  };

  return (
    <StudentPageShell
      doneAction="back"
      onDone={() =>
        window.location.assign(
          projectBackHref(document.referrer, window.location.origin)
        )
      }
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-black tracking-tight text-slate-900">
            {run?.title ?? 'Project'}
          </h1>
          {run?.dueAt && (
            <p className="text-sm font-medium text-slate-500">
              Due {new Date(run.dueAt).toLocaleDateString()}
            </p>
          )}
        </div>
        {run?.rubric && (
          <button
            type="button"
            onClick={() => setRubricOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            <ScrollText className="h-4 w-4" strokeWidth={2.25} />
            How this is scored
          </button>
        )}
      </div>

      {body()}

      {rubricOpen && run?.rubric && (
        <ProjectRubricSheet
          rubric={run.rubric}
          maxPoints={maxPoints}
          onClose={() => setRubricOpen(false)}
        />
      )}
    </StudentPageShell>
  );
};

export default ProjectStudentPage;
