// Maps team pages to `/plc/:id/:section` routes; the landing page lives at the bare team path.

import type { PlcTeamLayout, TeamPageId } from '@/types';
import { isTeamLandingPage } from '@/config/teamTypePresets';
import type { PlcSectionId } from '@/components/plc/sections';

/** Sections outside the team layout: gear menu, meeting banner, and the Learning Targets rail item. */
export type TeamOffRailSection = 'members' | 'settings' | 'meeting' | 'targets';

export type TeamRoute =
  | { kind: 'page'; page: TeamPageId }
  | { kind: 'section'; section: TeamOffRailSection };

export function teamPageSection(id: TeamPageId): PlcSectionId {
  return isTeamLandingPage(id) ? 'home' : (id as PlcSectionId);
}

const PAGE_OF_SECTION: Partial<Record<PlcSectionId, TeamPageId>> = {
  assessments: 'assessments',
  docs: 'docs',
  resources: 'resources',
  updates: 'updates',
  workspace: 'workspace',
  // Boards fold into Resources (T9).
  sharedBoards: 'resources',
};

/** The route a section shows under the redesign, and the section its URL should read. */
export function resolveTeamRoute(
  section: PlcSectionId,
  layout: Pick<PlcTeamLayout, 'pages' | 'landing'>,
  options: { targets?: boolean } = {}
): { route: TeamRoute; canonical: PlcSectionId } {
  if (
    section === 'members' ||
    section === 'settings' ||
    section === 'meeting' ||
    (section === 'targets' && options.targets)
  ) {
    return { route: { kind: 'section', section }, canonical: section };
  }
  const page = PAGE_OF_SECTION[section];
  const enabled =
    page !== undefined &&
    layout.pages.some((p) => p.id === page && p.enabled) &&
    !isTeamLandingPage(page);
  if (page && enabled) {
    return { route: { kind: 'page', page }, canonical: page as PlcSectionId };
  }
  return { route: { kind: 'page', page: layout.landing }, canonical: 'home' };
}
