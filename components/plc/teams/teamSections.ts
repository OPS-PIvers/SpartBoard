// Maps team pages to `/plc/:id/:section` routes; the landing page lives at the bare team path.

import type { PlcTeamLayout, TeamPageId } from '@/types';
import type { PlcSectionId } from '@/components/plc/sections';

/** Sections outside the team layout: gear menu, meeting banner, and the Learning Targets rail item. */
export type TeamOffRailSection = 'members' | 'settings' | 'meeting' | 'targets';

export type TeamRoute =
  | { kind: 'page'; page: TeamPageId }
  | { kind: 'section'; section: TeamOffRailSection }
  // PLC Home, shown in place of a Data overview landing when `plc-home-tab` is on.
  | { kind: 'plcHome' };

/** PLC Home replaces the landing only for a team that lands on Data overview. */
export function teamUsesPlcHome(
  layout: Pick<PlcTeamLayout, 'landing'>,
  flagOn: boolean
): boolean {
  return flagOn && layout.landing === 'dataOverview';
}

export function teamPageSection(
  id: TeamPageId,
  landing: TeamPageId,
  plcHome = false
): PlcSectionId {
  if (plcHome && id === 'dataOverview') return 'dataOverview';
  return id === landing ? 'home' : id;
}

const PAGE_OF_SECTION: Partial<Record<PlcSectionId, TeamPageId>> = {
  assessments: 'assessments',
  docs: 'docs',
  resources: 'resources',
  updates: 'updates',
  workspace: 'workspace',
  dataOverview: 'dataOverview',
  hub: 'hub',
  programHub: 'programHub',
  // Boards fold into Resources (T9).
  sharedBoards: 'resources',
};

/** The route a section shows under the redesign, and the section its URL should read. */
export function resolveTeamRoute(
  section: PlcSectionId,
  layout: Pick<PlcTeamLayout, 'pages' | 'landing'>,
  options: { targets?: boolean; plcHome?: boolean } = {}
): { route: TeamRoute; canonical: PlcSectionId } {
  if (options.plcHome) {
    if (section === 'home') {
      return { route: { kind: 'plcHome' }, canonical: 'home' };
    }
    if (section === 'dataOverview') {
      return {
        route: { kind: 'page', page: 'dataOverview' },
        canonical: 'dataOverview',
      };
    }
  }
  if (
    section === 'members' ||
    section === 'settings' ||
    section === 'meeting' ||
    (section === 'targets' && options.targets)
  ) {
    return { route: { kind: 'section', section }, canonical: section };
  }
  const page = PAGE_OF_SECTION[section];
  // The landing page also answers at its own path, so item deep links under it survive.
  const enabled =
    page !== undefined &&
    (page === layout.landing ||
      layout.pages.some((p) => p.id === page && p.enabled));
  if (page && enabled) {
    return { route: { kind: 'page', page }, canonical: page };
  }
  return {
    route: options.plcHome
      ? { kind: 'plcHome' }
      : { kind: 'page', page: layout.landing },
    canonical: 'home',
  };
}
