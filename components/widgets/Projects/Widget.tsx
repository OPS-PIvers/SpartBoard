import React, { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import type {
  ProjectGroupImportEntry,
  ProjectsConfig,
  WidgetData,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useProjectLibrary } from '@/hooks/useProjectLibrary';
import { useProjectRun } from '@/hooks/useProjectRun';
import { useProjectsWidgetSettings } from '@/hooks/useProjectsWidgetSettings';
import { useInSubShare } from '@/hooks/useShareContent';
import { useProjectsBuildingDefaults } from '@/hooks/useProjectsBuildingDefaults';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { ProjectsManager } from './components/ProjectsManager';
import { ProjectBoardView } from './components/ProjectBoardView';
import { ProjectSetupGroupsModal } from './components/ProjectSetupGroupsModal';
import { ProjectGrader } from './components/ProjectGrader';
import { ProjectGroupsManager } from './components/ProjectGroupsManager';

/**
 * R1 — a widget placed before the manager landed carries a `projectId` and no
 * `view`, and must keep showing its tracker rather than jumping to the library.
 */
const resolveView = (config: ProjectsConfig): 'manager' | 'board' =>
  config.view ?? (config.projectId ? 'board' : 'manager');

export const ProjectsWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as ProjectsConfig;
  const { updateWidget } = useDashboard();
  const { enabled } = useProjectsWidgetSettings();
  const inShare = useInSubShare();

  const [setupProjectId, setSetupProjectId] = useState<string | null>(null);
  const [groupsProjectId, setGroupsProjectId] = useState<string | null>(null);
  const [gradingProjectId, setGradingProjectId] = useState<string | null>(null);

  const update = (updates: Partial<ProjectsConfig>): void =>
    updateWidget(widget.id, { config: { ...config, ...updates } });

  if (!enabled) {
    return (
      <ScaledEmptyState
        icon={ClipboardList}
        title="Projects is off"
        subtitle="An admin turns this on under Rollouts."
      />
    );
  }

  // In a sub share the library is the substitute's own, and there is nothing in
  // it: the widget shows the teacher's project or says it did not come along.
  if (inShare && !config.projectId) {
    return (
      <ScaledEmptyState
        icon={ClipboardList}
        title="No project"
        subtitle="This widget had no project open when it was shared."
      />
    );
  }

  const view = inShare ? 'board' : resolveView(config);
  const openBoard = (projectId: string): void =>
    update({ view: 'board', projectId });
  // A Group Maker push still lands through the import dialog; everything else is the group manager.
  const openGroups = (projectId: string): void =>
    config.pendingImport
      ? setSetupProjectId(projectId)
      : setGroupsProjectId(projectId);

  return (
    <WidgetLayout
      padding="p-0"
      contentClassName="flex-1 min-h-0"
      content={
        <>
          {view === 'board' && config.projectId ? (
            <ProjectBoardView
              widget={widget}
              projectId={config.projectId}
              onBackToLibrary={() => update({ view: 'manager' })}
              onGrade={() => setGradingProjectId(config.projectId ?? null)}
              onManageGroups={() =>
                setGroupsProjectId(config.projectId ?? null)
              }
            />
          ) : (
            <ProjectsManager
              widget={widget}
              onOpenBoard={openBoard}
              onSetupGroups={openGroups}
              onGrade={setGradingProjectId}
            />
          )}

          {setupProjectId && (
            <SetupGroupsHost
              widget={widget}
              projectId={setupProjectId}
              onDone={openBoard}
              onClose={() => setSetupProjectId(null)}
            />
          )}

          {groupsProjectId && (
            <GroupsManagerHost
              widget={widget}
              projectId={groupsProjectId}
              onClose={() => setGroupsProjectId(null)}
              onSaved={openBoard}
            />
          )}

          {gradingProjectId && (
            <GraderHost
              projectId={gradingProjectId}
              onClose={() => setGradingProjectId(null)}
            />
          )}
        </>
      }
    />
  );
};

/**
 * Hosts the setup modal against one project's run. Split out so `useProjectRun`
 * only ever mounts for the project actually being set up.
 */
const SetupGroupsHost: React.FC<{
  widget: WidgetData;
  projectId: string;
  onDone: (projectId: string) => void;
  onClose: () => void;
}> = ({ widget, projectId, onDone, onClose }) => {
  const config = widget.config as ProjectsConfig;
  const { user } = useAuth();
  const { updateWidget, addToast, rosters, activeRosterId } = useDashboard();
  const buildingId = useWidgetBuildingId(widget);
  const buildingDefaults = useProjectsBuildingDefaults(buildingId);
  const { projects } = useProjectLibrary(user?.uid);
  const { groups, ensureRun, importGroups } = useProjectRun(
    user?.uid,
    projectId,
    user?.uid
  );

  const project = projects.find((p) => p.id === projectId);
  if (!project) return null;

  const handleCommit = async (
    entries: ProjectGroupImportEntry[]
  ): Promise<{ groupsWritten: number; membersResolved: number }> => {
    await ensureRun(project, {
      showStatusToStudents: buildingDefaults.defaultShowStatusToStudents,
    });
    const result = await importGroups(entries);
    if (config.pendingImport) {
      updateWidget(widget.id, { config: { ...config, pendingImport: null } });
    }
    // A hand-built roster resolves no one, which is a tracker, not a failure.
    addToast(
      result.membersResolved === 0
        ? `Added ${result.groupsWritten} groups as a tracker you move yourself — these students have no district account to sign in with.`
        : `Added ${result.groupsWritten} groups, ${result.membersResolved} students.`,
      result.membersResolved === 0 ? 'info' : 'success'
    );
    onDone(projectId);
    return result;
  };

  return (
    <ProjectSetupGroupsModal
      isOpen
      project={project}
      rosters={rosters}
      existingGroups={groups}
      pendingImport={config.pendingImport}
      defaultRosterId={activeRosterId}
      onCommit={handleCommit}
      onClose={onClose}
    />
  );
};

/** Mounts `useProjectRun` only for the project whose groups are open. */
const GroupsManagerHost: React.FC<{
  widget: WidgetData;
  projectId: string;
  onClose: () => void;
  onSaved: (projectId: string) => void;
}> = ({ widget, projectId, onClose, onSaved }) => {
  const { user, orgId } = useAuth();
  const { rosters, activeRosterId, addToast } = useDashboard();
  const buildingId = useWidgetBuildingId(widget);
  const buildingDefaults = useProjectsBuildingDefaults(buildingId);
  const { projects } = useProjectLibrary(user?.uid);
  const { run, groups, loading, ensureRun, importGroups } = useProjectRun(
    user?.uid,
    projectId,
    user?.uid
  );
  const project = projects.find((p) => p.id === projectId);
  const title = run?.title ?? project?.title;
  if (loading || !title) return null;

  const handleSave = async (
    _classId: string,
    entries: ProjectGroupImportEntry[],
    deleteGroupIds: string[]
  ): Promise<void> => {
    if (!run) {
      if (!project)
        throw new Error('This project is no longer in your library.');
      await ensureRun(project, {
        showStatusToStudents: buildingDefaults.defaultShowStatusToStudents,
      });
    }
    await importGroups(entries, deleteGroupIds);
    addToast('Groups saved.', 'success');
    onSaved(projectId);
  };

  return (
    <ProjectGroupsManager
      isOpen
      projectTitle={title}
      runId={run?.id ?? null}
      orgId={orgId}
      rosters={rosters}
      groups={groups}
      initialRosterId={activeRosterId}
      onSave={handleSave}
      onClose={onClose}
    />
  );
};

/** Loads the run the grader walks, so the queue is never mounted empty. */
const GraderHost: React.FC<{ projectId: string; onClose: () => void }> = ({
  projectId,
  onClose,
}) => {
  const { user, orgId } = useAuth();
  const { run, groups } = useProjectRun(user?.uid, projectId, user?.uid);
  if (!run) return null;
  return (
    <ProjectGrader run={run} groups={groups} orgId={orgId} onClose={onClose} />
  );
};
