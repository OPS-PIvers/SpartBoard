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
import { useProjectsBuildingDefaults } from '@/hooks/useProjectsBuildingDefaults';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { ProjectsManager } from './components/ProjectsManager';
import { ProjectBoardView } from './components/ProjectBoardView';
import { ProjectSetupGroupsModal } from './components/ProjectSetupGroupsModal';
import { ProjectGrader } from './components/ProjectGrader';

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

  const [setupProjectId, setSetupProjectId] = useState<string | null>(null);
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

  const view = resolveView(config);
  const openBoard = (projectId: string): void =>
    update({ view: 'board', projectId });

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
              onManageGroups={() => setSetupProjectId(config.projectId ?? null)}
            />
          ) : (
            <ProjectsManager
              widget={widget}
              onOpenBoard={openBoard}
              onSetupGroups={setSetupProjectId}
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
