import type { ActorRole } from '@/types/organization';

// Scoping flags a section can carry. Extracted from OrganizationPanel so the
// rule is unit-testable without mounting the panel.
export interface SectionScope {
  superOnly?: boolean;
  domainAdminOnly?: boolean;
}

export function isSectionVisible(
  section: SectionScope,
  actorRole: ActorRole
): boolean {
  if (section.superOnly && actorRole !== 'super_admin') return false;
  if (section.domainAdminOnly && actorRole === 'building_admin') return false;
  return true;
}

export function filterVisibleSections<T extends SectionScope>(
  sections: readonly T[],
  actorRole: ActorRole
): T[] {
  return sections.filter((s) => isSectionVisible(s, actorRole));
}
