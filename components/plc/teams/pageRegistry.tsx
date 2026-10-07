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
import {
  TeamAssessmentsPage,
  TeamNotesDocsPage,
  TeamResourcesPage,
} from './pages/ExistingTeamPages';
import type { TeamPageRegistry } from './types';

// Landing cards live in cardRegistry.ts so the landing host can read them without an import cycle.
export { TEAM_CARD_REGISTRY } from './cardRegistry';

/** Rail pages; `Component: null` renders the neutral placeholder. */
// eslint-disable-next-line react-refresh/only-export-components -- registry module; it defines no components
export const TEAM_PAGE_REGISTRY: TeamPageRegistry = {
  dataOverview: { icon: BarChart3, Component: DataOverviewPage },
  hub: { icon: LayoutDashboard, Component: TeamLandingPage },
  programHub: { icon: LayoutDashboard, Component: TeamLandingPage },
  assessments: { icon: ClipboardList, Component: TeamAssessmentsPage },
  docs: { icon: FileText, Component: TeamNotesDocsPage },
  resources: { icon: Sparkles, Component: TeamResourcesPage },
  updates: { icon: Megaphone, Component: null },
  workspace: { icon: Users2, Component: null },
};
