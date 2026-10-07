// Team page registry (T1): slices register a page with one line; cards register in cardRegistry.ts.

import {
  BarChart3,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Megaphone,
  Sparkles,
  Users2,
} from 'lucide-react';
import { TeamLandingPage } from './landing/TeamLandingPage';
import DataOverviewPage from './data/DataOverviewPage';
import UpdatesPage from './updates/UpdatesPage';
import BuildingHubPage from './building/BuildingHubPage';
import ProgramHubPage from './mentoring/ProgramHubPage';
import WorkspacePage from './mentoring/WorkspacePage';
import NotesDocsPage from './notes/NotesDocsPage';
import DepartmentHubPage from './department/DepartmentHubPage';
import './mentoringBridge';
import {
  TeamAssessmentsPage,
  TeamResourcesPage,
} from './pages/ExistingTeamPages';
import type { TeamPageRegistry } from './types';

// Landing cards live in cardRegistry.ts so the landing host can read them without an import cycle.
export { TEAM_CARD_REGISTRY } from './cardRegistry';

/** Rail pages; `Component: null` renders the neutral placeholder. */
// eslint-disable-next-line react-refresh/only-export-components -- registry module; it defines no components
export const TEAM_PAGE_REGISTRY: TeamPageRegistry = {
  dataOverview: { icon: BarChart3, Component: DataOverviewPage },
  hub: {
    icon: LayoutDashboard,
    Component: TeamLandingPage,
    byType: { building: BuildingHubPage, department: DepartmentHubPage },
  },
  programHub: { icon: LayoutDashboard, Component: ProgramHubPage },
  assessments: { icon: ClipboardList, Component: TeamAssessmentsPage },
  docs: { icon: FileText, Component: NotesDocsPage, fullBleed: true },
  resources: { icon: Sparkles, Component: TeamResourcesPage },
  updates: { icon: Megaphone, Component: UpdatesPage },
  workspace: { icon: Users2, Component: WorkspacePage },
};
