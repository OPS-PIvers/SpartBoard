import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ClipboardList,
  Hand,
  Loader2,
  ScrollText,
} from 'lucide-react';
import type { ProjectStep, ProjectStepState } from '@/types';
import { useStudentAuth } from '@/context/useStudentAuth';
import { useStudentProjectRun } from '@/hooks/useStudentProjectRun';
import { useProjectsWidgetSettings } from '@/hooks/useProjectsWidgetSettings';
import { useProjectUploads } from '@/hooks/useProjectUploads';
import {
  STEP_STATE_LABELS,
  completedStepCount,
  sortGroupsForBoard,
  stepStateOf,
  studentStateOptions,
} from '@/components/widgets/Projects/projectSteps';
import { rubricMaxPoints } from '@/utils/rubricPoints';
import { StudentPageShell } from './StudentPageShell';
import { ProjectGroupWork } from './project/ProjectGroupWork';
import { ProjectRubricSheet } from './project/ProjectRubricSheet';
import { parseProjectRunId } from './project/projectRoute';

const STATE_CHIP: Record<ProjectStepState, string> = {
  notStarted: 'bg-slate-100 text-slate-600',
  inProgress: 'bg-brand-blue-primary/10 text-brand-blue-dark',
  readyForReview: 'bg-amber-100 text-amber-800',
  done: 'bg-emerald-100 text-emerald-800',
};

const SEGMENT_COLORS: Record<ProjectStepState, string> = {
  notStarted: 'bg-slate-200',
  inProgress: 'bg-brand-blue-primary',
  readyForReview: 'bg-amber-400',
  done: 'bg-emerald-500',
};

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

/** `/project/:runId` — a group's own view of one project (§6, D30); rules enforce the limits. */
export const ProjectStudentPage: React.FC = () => {
  const { pseudonymUid, classIds, signOut } = useStudentAuth();
  const runId = useMemo(() => parseProjectRunId(window.location.pathname), []);

  const {
    run,
    groups,
    myGroup,
    grade,
    loading,
    error,
    setStepState,
    setNeedsSupport,
    addWorkLink,
    removeWorkLink,
  } = useStudentProjectRun(runId, pseudonymUid, classIds);

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

  const steps: ProjectStep[] = run?.steps ?? [];
  const canEdit = Boolean(myGroup) && run?.acceptingUpdates === true;
  const otherGroups = useMemo(
    () => sortGroupsForBoard(groups.filter((g) => g.id !== myGroup?.id)),
    [groups, myGroup?.id]
  );

  const maxPoints = run?.rubric
    ? (run.rubricMaxPoints ?? rubricMaxPoints(run.rubric))
    : 0;
  // A4 — an override is an absolute score, so it replaces the group total
  // rather than adjusting it.
  const myOverride = pseudonymUid
    ? grade?.overridesByUid?.[pseudonymUid]
    : undefined;

  const cycleStep = async (step: ProjectStep) => {
    if (!canEdit || busyStepId) return;
    const options = studentStateOptions(step);
    const current = myGroup ? stepStateOf(myGroup, step.id) : 'notStarted';
    // A student sitting on a teacher-set `done` has nowhere in their own
    // options to go, so the cycle restarts rather than jamming.
    const index = options.indexOf(current);
    const next = options[(index + 1) % options.length];
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-slate-900">
                {myGroup.name}
              </h2>
              <p className="text-sm text-slate-500">
                {completedStepCount(myGroup, steps)} of {steps.length} steps
                done
              </p>
            </div>
            <button
              type="button"
              onClick={() => void setNeedsSupport(!myGroup.needsSupport)}
              disabled={!canEdit}
              aria-pressed={myGroup.needsSupport}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition disabled:opacity-50 ${
                myGroup.needsSupport
                  ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Hand className="h-4 w-4" strokeWidth={2.25} />
              {myGroup.needsSupport ? 'Help is on the way' : 'Ask for help'}
            </button>
          </div>

          {steps.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              Your teacher has not added the steps yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {steps.map((step) => {
                const state = stepStateOf(myGroup, step.id);
                const locked = step.requiresApproval && state === 'done';
                return (
                  <li key={step.id}>
                    <button
                      type="button"
                      onClick={() => void cycleStep(step)}
                      disabled={!canEdit || busyStepId === step.id}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-left transition hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-white"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800">
                          {step.title}
                        </span>
                        {step.description && (
                          <span className="block truncate text-xs text-slate-500">
                            {step.description}
                          </span>
                        )}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATE_CHIP[state]}`}
                      >
                        {STEP_STATE_LABELS[state]}
                      </span>
                    </button>
                    {step.requiresApproval && !locked && (
                      <p className="px-3 pt-1 text-xs text-slate-400">
                        Your teacher marks this one done.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {!canEdit && myGroup && (
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
          workLinks={myGroup.workLinks ?? []}
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

        {grade && (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
            <h3 className="text-sm font-bold text-emerald-900">Your score</h3>
            <p className="mt-1 text-2xl font-black text-emerald-900">
              {myOverride ? myOverride.points : grade.points}
              <span className="text-base font-bold text-emerald-700">
                {' '}
                / {grade.maxPoints}
              </span>
            </p>
            {myOverride?.note && (
              <p className="mt-1 text-sm text-emerald-900">{myOverride.note}</p>
            )}
            {grade.comment && (
              <p className="mt-2 text-sm text-emerald-900">{grade.comment}</p>
            )}
          </section>
        )}

        {run.showStatusToStudents && otherGroups.length > 0 && (
          <section>
            <h3 className="text-sm font-bold text-slate-900">Everyone else</h3>
            <ul className="mt-2 space-y-1.5">
              {otherGroups.map((group) => (
                <li
                  key={group.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
                  style={{
                    borderLeftWidth: 4,
                    borderLeftColor: group.needsSupport
                      ? '#f59e0b'
                      : 'transparent',
                  }}
                >
                  <span className="w-28 shrink-0 truncate text-sm font-semibold text-slate-800">
                    {group.name}
                  </span>
                  <span
                    className="flex min-w-0 flex-1 gap-1"
                    role="img"
                    aria-label={`${group.name}: ${completedStepCount(
                      group,
                      steps
                    )} of ${steps.length} steps done`}
                  >
                    {steps.map((step) => (
                      <span
                        key={step.id}
                        className={`h-2.5 flex-1 rounded-full ${
                          SEGMENT_COLORS[stepStateOf(group, step.id)]
                        }`}
                      />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  };

  return (
    <StudentPageShell onDone={() => void signOut()}>
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
