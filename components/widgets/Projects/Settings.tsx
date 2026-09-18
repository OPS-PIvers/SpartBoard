import React, { useCallback, useMemo, useState } from 'react';
import { ClipboardList, ListChecks, Lock, Plus, Users } from 'lucide-react';
import type {
  ProjectDefinition,
  ProjectGroupImportEntry,
  ProjectStep,
  ProjectsConfig,
  WidgetData,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useProjectLibrary } from '@/hooks/useProjectLibrary';
import { useProjectRun } from '@/hooks/useProjectRun';
import { useProjectsWidgetSettings } from '@/hooks/useProjectsWidgetSettings';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { SurfaceColorSettings } from '@/components/common/SurfaceColorSettings';
import { TypographySettings } from '@/components/common/TypographySettings';
import { Toggle } from '@/components/common/Toggle';
import { GroupImportPanel } from './components/GroupImportPanel';
import {
  approvalStepIdsFrom,
  parseStepLines,
  stepLinesFrom,
} from './projectSteps';

export const ProjectsSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addToast, rosters } = useDashboard();
  const { user } = useAuth();
  const { enabled } = useProjectsWidgetSettings();
  const config = widget.config as ProjectsConfig;
  const { projectId, pendingImport } = config;

  const { projects, saveProject } = useProjectLibrary(user?.uid);
  const { run, groups, ensureRun, updateRun, importGroups } = useProjectRun(
    user?.uid,
    projectId,
    user?.uid
  );

  const project = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projectId, projects]
  );
  const [stepDraft, setStepDraft] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState<string | null>(null);
  const [openStepId, setOpenStepId] = useState<string | null>(null);

  const update = useCallback(
    (updates: Partial<ProjectsConfig>) =>
      updateWidget(widget.id, { config: { ...config, ...updates } }),
    [config, updateWidget, widget.id]
  );

  // D12/D13 — the run carries a snapshot so students never read the library.
  const persistProject = useCallback(
    async (next: ProjectDefinition) => {
      try {
        await saveProject(next);
        if (run) {
          await updateRun({
            title: next.title,
            steps: next.steps,
            approvalStepIds: approvalStepIdsFrom(next.steps),
          });
        }
      } catch {
        addToast('That project could not be saved.', 'error');
      }
    },
    [addToast, run, saveProject, updateRun]
  );

  const selectProject = (id: string | undefined) => {
    setStepDraft(null);
    setTitleDraft(null);
    setDescDraft(null);
    setOpenStepId(null);
    update({ projectId: id });
  };

  const handleCreateProject = async () => {
    const now = Date.now();
    const next: ProjectDefinition = {
      id: crypto.randomUUID(),
      title: 'New project',
      steps: [],
      createdAt: now,
      updatedAt: now,
    };
    // Not persistProject: `run` still points at the open project's run doc.
    try {
      await saveProject(next);
    } catch {
      addToast('That project could not be saved.', 'error');
      return;
    }
    selectProject(next.id);
  };

  const handleStepsBlur = async () => {
    if (!project || stepDraft === null) return;
    const steps = parseStepLines(stepDraft, project.steps);
    setStepDraft(null);
    await persistProject({ ...project, steps });
  };

  const handleTitleBlur = async () => {
    if (!project || titleDraft === null) return;
    const title = titleDraft;
    setTitleDraft(null);
    if (title === project.title) return;
    await persistProject({ ...project, title });
  };

  const handleStepFlag = async (
    stepId: string,
    updates: Partial<ProjectStep>
  ) => {
    if (!project) return;
    await persistProject({
      ...project,
      steps: project.steps.map((step) =>
        step.id === stepId ? { ...step, ...updates } : step
      ),
    });
  };

  const handleDescriptionBlur = async (step: ProjectStep) => {
    if (descDraft === null) return;
    const description = descDraft;
    setDescDraft(null);
    if (description === (step.description ?? '')) return;
    await handleStepFlag(step.id, { description });
  };

  const handleImport = async (entries: ProjectGroupImportEntry[]) => {
    if (!project) throw new Error('Pick a project first.');
    await ensureRun(project);
    const result = await importGroups(entries);
    update({ pendingImport: null });
    addToast(
      `Imported ${result.groupsWritten} groups, ${result.membersResolved} students.`,
      'success'
    );
  };

  if (!enabled) {
    return (
      <div className="p-4">
        <p className="text-sm text-slate-600">
          Projects is switched off for this district. An admin turns it on under
          Admin Settings, Rollouts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <SettingsLabel icon={ClipboardList} htmlFor={`${widget.id}-project`}>
            Project
          </SettingsLabel>
          <button
            type="button"
            onClick={() => void handleCreateProject()}
            className="flex items-center gap-1 text-xs font-bold text-brand-blue-primary"
          >
            <Plus className="h-3 w-3" />
            New project
          </button>
        </div>
        <select
          id={`${widget.id}-project`}
          value={projectId ?? ''}
          onChange={(e) => selectProject(e.target.value || undefined)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
        >
          <option value="">Choose a project…</option>
          {projects
            .filter((p) => !p.archivedAt)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
        </select>
      </div>

      {project && (
        <>
          <div>
            <SettingsLabel htmlFor={`${widget.id}-title`}>Title</SettingsLabel>
            <input
              id={`${widget.id}-title`}
              type="text"
              value={titleDraft ?? project.title}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => void handleTitleBlur()}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
            />
          </div>

          <div>
            <SettingsLabel icon={ListChecks} htmlFor={`${widget.id}-steps`}>
              Steps — one per line
            </SettingsLabel>
            <textarea
              id={`${widget.id}-steps`}
              rows={7}
              value={stepDraft ?? stepLinesFrom(project.steps)}
              onChange={(e) => setStepDraft(e.target.value)}
              onBlur={() => void handleStepsBlur()}
              placeholder={
                'Research the topic\nBuild an outline\nDraft the poster'
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
            />

            {project.steps.length > 0 && (
              <ul className="mt-2 space-y-1">
                {project.steps.map((step) => (
                  <li
                    key={step.id}
                    className="rounded-lg border border-slate-200 bg-white"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenStepId(openStepId === step.id ? null : step.id)
                      }
                      aria-expanded={openStepId === step.id}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700"
                    >
                      <span className="truncate">{step.title}</span>
                      {step.requiresApproval && (
                        <Lock
                          className="h-3.5 w-3.5 shrink-0 text-amber-600"
                          aria-label="Needs your approval"
                        />
                      )}
                    </button>
                    {openStepId === step.id && (
                      <div className="space-y-2 border-t border-slate-100 px-3 py-2">
                        <input
                          type="text"
                          value={descDraft ?? step.description ?? ''}
                          onChange={(e) => setDescDraft(e.target.value)}
                          onBlur={() => void handleDescriptionBlur(step)}
                          placeholder="What this step means (optional)"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                        />
                        <label className="flex items-center justify-between text-xs text-slate-600">
                          Students stop at &ldquo;ready for review&rdquo;
                          <Toggle
                            checked={Boolean(step.requiresApproval)}
                            onChange={(next) =>
                              void handleStepFlag(step.id, {
                                requiresApproval: next,
                              })
                            }
                            label={`${step.title} needs approval`}
                          />
                        </label>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {pendingImport && (
        <GroupImportPanel
          pending={pendingImport}
          rosters={rosters}
          existingGroups={groups}
          canImport={Boolean(project)}
          onImport={handleImport}
          onDiscard={() => update({ pendingImport: null })}
        />
      )}

      {run && (
        <div className="space-y-3">
          <SettingsLabel icon={Users} as="span">
            This project
          </SettingsLabel>
          <p className="text-xs text-slate-600">
            {groups.length} group{groups.length === 1 ? '' : 's'} across{' '}
            {run.classIds.length} class
            {run.classIds.length === 1 ? '' : 'es'}.
          </p>
          <label className="flex items-center justify-between text-xs text-slate-600">
            Students can see every group&apos;s progress
            <Toggle
              checked={run.showStatusToStudents}
              onChange={(next) =>
                void updateRun({ showStatusToStudents: next })
              }
              label="Students can see every group's progress"
            />
          </label>
          <label className="flex items-center justify-between text-xs text-slate-600">
            Groups can still update their progress
            <Toggle
              checked={run.acceptingUpdates}
              onChange={(next) => void updateRun({ acceptingUpdates: next })}
              label="Groups can still update their progress"
            />
          </label>
        </div>
      )}

      {!pendingImport && project && groups.length === 0 && (
        <p className="text-xs text-slate-600">
          Set up your groups in the Group Maker, then use &ldquo;Send to
          Projects&rdquo; there to bring them over.
        </p>
      )}
    </div>
  );
};

export const ProjectsAppearanceSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as ProjectsConfig;
  const update = (updates: Partial<ProjectsConfig>) =>
    updateWidget(widget.id, { config: { ...config, ...updates } });

  return (
    <div className="space-y-6 p-1">
      <TypographySettings
        config={config}
        updateConfig={update}
        showColorPicker={false}
      />
      <SurfaceColorSettings
        config={config}
        updateConfig={update}
        label="Group rows"
      />
    </div>
  );
};
