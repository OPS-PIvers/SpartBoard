import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  LayoutGrid,
  Globe,
  School,
  Shield,
  Users as UsersIcon,
  GraduationCap,
  ChevronLeft,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useOrganization } from '@/hooks/useOrganization';
import { useOrgBuildings } from '@/hooks/useOrgBuildings';
import { useOrgDomains } from '@/hooks/useOrgDomains';
import { useOrgRoles } from '@/hooks/useOrgRoles';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useOrgStudentPage } from '@/hooks/useOrgStudentPage';
import type {
  ActorRole,
  BuildingRecord,
  DomainRecord,
  OrgRecord,
  RoleRecord,
  StudentPageConfig,
  UserRecord,
} from '@/types/organization';
import { AllOrganizationsView } from './views/AllOrganizationsView';
import { OverviewView } from './views/OverviewView';
import { DomainsView } from './views/DomainsView';
import { BuildingsView } from './views/BuildingsView';
import { RolesView } from './views/RolesView';
import { UsersView } from './views/UsersView';
import { StudentPageView } from './views/StudentPageView';
import {
  OrgLogoTile,
  OrgToast,
  type OrgToastType,
} from './components/primitives';

type SectionId =
  | 'orgs'
  | 'overview'
  | 'domains'
  | 'buildings'
  | 'roles'
  | 'users'
  | 'student';

interface SectionDef {
  id: SectionId;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  superOnly?: boolean;
  domainAdminOnly?: boolean;
}

const SECTIONS: SectionDef[] = [
  {
    id: 'orgs',
    label: 'All organizations',
    sublabel: 'Every district on the platform.',
    icon: Building2,
    superOnly: true,
  },
  {
    id: 'overview',
    label: 'Overview',
    sublabel: 'Org-level settings, plan & AI toggle.',
    icon: LayoutGrid,
  },
  {
    id: 'domains',
    label: 'Sign-in domains',
    sublabel: 'Email domains + SSO.',
    icon: Globe,
    domainAdminOnly: true,
  },
  {
    id: 'buildings',
    label: 'Buildings',
    sublabel: 'Schools and sites.',
    icon: School,
  },
  {
    id: 'roles',
    label: 'Roles & perms',
    sublabel: 'Capability matrix.',
    icon: Shield,
    domainAdminOnly: true,
  },
  {
    id: 'users',
    label: 'Users',
    sublabel: 'Invite, assign, deactivate.',
    icon: UsersIcon,
  },
  {
    id: 'student',
    label: 'Student page',
    sublabel: 'What students see.',
    icon: GraduationCap,
    domainAdminOnly: true,
  },
];

const STORAGE_KEY = 'adm.section';

// Resolve the actor's role from auth context. isAdmin maps to domain_admin;
// superAdmins maps to super_admin. Building admin isn't a first-class
// concept in the current auth layer — default to domain_admin for admins.
const resolveActorRole = (
  isAdmin: boolean | null,
  isSuperAdmin: boolean
): ActorRole => {
  if (isSuperAdmin) return 'super_admin';
  if (isAdmin) return 'domain_admin';
  return 'building_admin';
};

export const OrganizationPanel: React.FC = () => {
  const {
    isAdmin,
    userRoles,
    user,
    orgId: authOrgId,
    buildingIds: memberBuildingIds,
    canAccessFeature,
  } = useAuth();
  const isSuperAdmin = Boolean(
    user?.email &&
    userRoles?.superAdmins?.some(
      (e) => e.toLowerCase() === user.email?.toLowerCase()
    )
  );
  const actorRole = resolveActorRole(isAdmin, isSuperAdmin);

  // Super admins pick from the orgs list; everyone else is pinned to their
  // own org (from /organizations/{orgId}/members/{email}).
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const activeOrgId = selectedOrgId ?? authOrgId;

  // Default: super admin starts on orgs; others on overview.
  const defaultSection: SectionId = isSuperAdmin ? 'orgs' : 'overview';
  const [section, setSection] = useState<SectionId>(() => {
    if (typeof window === 'undefined') return defaultSection;
    const stored = window.localStorage.getItem(STORAGE_KEY) as SectionId | null;
    if (stored && SECTIONS.some((s) => s.id === stored)) return stored;
    return defaultSection;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, section);
    }
  }, [section]);

  const visibleSections = useMemo(
    () =>
      SECTIONS.filter((s) => {
        if (s.superOnly && actorRole !== 'super_admin') return false;
        if (s.domainAdminOnly && actorRole === 'building_admin') return false;
        return true;
      }),
    [actorRole]
  );

  // Active section may need to fall back if hidden by scoping.
  const effectiveSection: SectionId = visibleSections.some(
    (s) => s.id === section
  )
    ? section
    : (visibleSections[0]?.id ?? 'overview');

  // If the persisted section is no longer visible to this actor (e.g. a super
  // admin downgraded to domain admin), correct state during render. React
  // discards this render and re-renders with the fallback; the localStorage
  // effect above then persists the new value.
  if (section !== effectiveSection) {
    setSection(effectiveSection);
  }

  // ---- Firestore-backed data ----
  // The global "All organizations" list doesn't need any org-scoped data; skip
  // those subscriptions to avoid holding listeners open unnecessarily when a
  // super admin navigates back to the list.
  const orgScopedOrgId = effectiveSection === 'orgs' ? null : activeOrgId;
  // Non-super admins may render before their membership doc hydrates from
  // Firestore — treat that as loading so org-scoped sections don't flash the
  // "no data" empty state.
  const isMembershipHydrating =
    !isSuperAdmin && Boolean(user) && authOrgId === null;
  const { organizations, loading: orgsLoading, createOrg } = useOrganizations();
  const {
    organization: activeOrg,
    loading: orgLoadingRaw,
    updateOrg,
    archiveOrg,
  } = useOrganization(orgScopedOrgId);
  const {
    buildings,
    loading: buildingsLoadingRaw,
    addBuilding,
    updateBuilding,
    removeBuilding,
  } = useOrgBuildings(orgScopedOrgId);
  const {
    domains,
    loading: domainsLoadingRaw,
    addDomain,
    removeDomain,
  } = useOrgDomains(orgScopedOrgId);
  const {
    roles,
    loading: rolesLoadingRaw,
    saveRoles,
    resetRoles,
  } = useOrgRoles(orgScopedOrgId);
  const {
    users,
    loading: usersLoadingRaw,
    updateMember,
    bulkUpdateMembers,
    removeMembers,
  } = useOrgMembers(orgScopedOrgId);
  const {
    studentPage,
    loading: studentPageLoadingRaw,
    updateStudentPage,
  } = useOrgStudentPage(orgScopedOrgId);
  const orgLoading = orgLoadingRaw || isMembershipHydrating;
  const buildingsLoading = buildingsLoadingRaw || isMembershipHydrating;
  const domainsLoading = domainsLoadingRaw || isMembershipHydrating;
  const rolesLoading = rolesLoadingRaw || isMembershipHydrating;
  const usersLoading = usersLoadingRaw || isMembershipHydrating;
  const studentPageLoading = studentPageLoadingRaw || isMembershipHydrating;

  const [toast, setToast] = useState<{
    message: string;
    type: OrgToastType;
  } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (message: string, type: OrgToastType = 'info') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  // Phase 3: real writes are gated behind the `org-admin-writes` global
  // feature flag. When the flag is off (or not yet enabled for this user) we
  // fall back to the Phase 2 "coming soon" toast so the UI stays safe.
  const writesEnabled = canAccessFeature('org-admin-writes');
  const comingSoon = (label: string) =>
    showToast(`${label} — coming soon`, 'info');

  // Wrap a hook promise so it surfaces a success/error toast uniformly. The
  // views call these fire-and-forget; Firestore writes are optimistic via
  // `onSnapshot` so we don't need to block on resolution.
  const run = (
    label: string,
    task: () => Promise<void>,
    successMsg?: string
  ) => {
    task()
      .then(() => {
        if (successMsg) showToast(successMsg, 'success');
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        showToast(`${label} failed: ${msg}`, 'error');
      });
  };

  const handleCreateOrg = (o: Partial<OrgRecord>) => {
    if (!writesEnabled) return comingSoon('Create organization');
    run('Create organization', () => createOrg(o), `Created "${o.name ?? ''}"`);
  };
  const handleUpdateOrg = (patch: Partial<OrgRecord>) => {
    if (!writesEnabled) return comingSoon('Organization edits');
    run('Update organization', () => updateOrg(patch));
  };
  // `archiveOrg` is scoped to the hook's active orgId, so the caller's id
  // should always match. Assert it so a stale row in the view can't silently
  // archive the wrong org.
  const handleArchiveOrg = (targetOrgId: string) => {
    if (!writesEnabled) return comingSoon('Archive organization');
    if (targetOrgId !== activeOrgId) {
      // A mismatch means the view passed an org id that doesn't match the
      // hook's subscription — almost always a wiring bug. Warn so we notice
      // in dev rather than silently dropping the write.
      console.warn(
        '[OrganizationPanel] Archive skipped: targetOrgId mismatch',
        { targetOrgId, activeOrgId }
      );
      return;
    }
    run('Archive organization', archiveOrg, 'Organization archived');
  };
  const handleAddBuilding = (b: Partial<BuildingRecord>) => {
    if (!writesEnabled) return comingSoon('Add building');
    run('Add building', () => addBuilding(b), `Added "${b.name ?? ''}"`);
  };
  const handleUpdateBuilding = (id: string, patch: Partial<BuildingRecord>) => {
    if (!writesEnabled) return comingSoon('Edit building');
    run('Update building', () => updateBuilding(id, patch));
  };
  const handleRemoveBuilding = (id: string) => {
    if (!writesEnabled) return comingSoon('Archive building');
    run('Remove building', () => removeBuilding(id), 'Building removed');
  };
  const handleAddDomain = (d: Partial<DomainRecord>) => {
    if (!writesEnabled) return comingSoon('Add domain');
    run('Add domain', () => addDomain(d), `Added ${d.domain ?? 'domain'}`);
  };
  const handleRemoveDomain = (id: string) => {
    if (!writesEnabled) return comingSoon('Remove domain');
    run('Remove domain', () => removeDomain(id), 'Domain removed');
  };
  const handleSaveRoles = (working: RoleRecord[]) => {
    if (!writesEnabled) return comingSoon('Save roles');
    run('Save roles', () => saveRoles(working), 'Roles saved');
  };
  const handleResetRoles = () => {
    if (!writesEnabled) return comingSoon('Reset roles');
    run('Reset roles', resetRoles, 'Roles reset to defaults');
  };
  const handleUpdateUser = (id: string, patch: Partial<UserRecord>) => {
    if (!writesEnabled) return comingSoon('Update user');
    run('Update user', () => updateMember(id, patch));
  };
  const handleBulkUpdateUsers = (ids: string[], patch: Partial<UserRecord>) => {
    if (!writesEnabled) return comingSoon('Bulk update users');
    run(
      'Bulk update users',
      () => bulkUpdateMembers(ids, patch),
      `Updated ${ids.length} users`
    );
  };
  const handleRemoveUsers = (ids: string[]) => {
    if (!writesEnabled) return comingSoon('Remove users');
    run(
      'Remove users',
      () => removeMembers(ids),
      `Removed ${ids.length} users`
    );
  };
  const handleInvite = (
    _emails: string[],
    _role: string,
    _bids: string[],
    _msg?: string
  ) => {
    // Invitations require a Cloud Function (Phase 4); surface a dedicated
    // info toast rather than forwarding to the rejection stub (which would
    // render as a misleading error toast).
    if (!writesEnabled) return comingSoon('Invite users');
    showToast('Invitations — coming in Phase 4', 'info');
  };
  const handleUpdateStudentPage = (patch: Partial<StudentPageConfig>) => {
    if (!writesEnabled) return comingSoon('Student page edits');
    run('Update student page', () => updateStudentPage(patch));
  };

  // Building-admin scope: restrict strictly to the member doc's buildingIds.
  // A building admin with no assigned buildings sees an empty list — this
  // matches the permissions defined in Firestore. Super admins and domain
  // admins see every building.
  const actorBuildingIds = useMemo(() => {
    if (actorRole === 'building_admin') {
      return memberBuildingIds;
    }
    return buildings.map((b) => b.id);
  }, [actorRole, memberBuildingIds, buildings]);

  // Still-loading: for the current section, the relevant hook is flight.
  // We render a lightweight loading state in the main area rather than
  // blanking the whole panel.
  const sectionLoading: Record<SectionId, boolean> = {
    orgs: orgsLoading,
    overview: orgLoading,
    domains: domainsLoading,
    buildings: buildingsLoading,
    roles: rolesLoading,
    users: usersLoading || rolesLoading,
    student: studentPageLoading,
  };

  return (
    <div className="max-w-[1440px] mx-auto h-full">
      <div className="flex gap-6 h-full">
        {/* Left rail */}
        <aside className="w-[230px] shrink-0 hidden md:flex flex-col">
          {actorRole !== 'super_admin' ? (
            activeOrg && (
              <div className="mb-4 p-3 rounded-xl bg-white border border-slate-200 flex items-center gap-3">
                <OrgLogoTile
                  shortCode={activeOrg.shortCode}
                  seedColor={activeOrg.seedColor}
                  size="md"
                />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">
                    {activeOrg.name}
                  </div>
                  <div className="text-xs text-slate-500 font-mono">
                    {activeOrg.users.toLocaleString()} users ·{' '}
                    {activeOrg.buildings} buildings
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setSection('orgs')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
              >
                <ChevronLeft size={14} />
                All organizations
              </button>
              {effectiveSection !== 'orgs' && activeOrg && (
                <div className="mt-3 p-3 rounded-xl bg-white border border-slate-200 flex items-center gap-3">
                  <OrgLogoTile
                    shortCode={activeOrg.shortCode}
                    seedColor={activeOrg.seedColor}
                    size="md"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">
                      {activeOrg.shortName}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      Viewing as super admin
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <nav
            className="flex flex-col gap-1 overflow-y-auto"
            aria-label="Organization sections"
          >
            {visibleSections.map((s) => {
              const Icon = s.icon;
              const active = effectiveSection === s.id;
              const isSuper = s.superOnly;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSection(s.id)}
                  className={`text-left p-3 rounded-xl transition-colors flex items-start gap-3 ${
                    active
                      ? 'bg-brand-blue-lighter text-brand-blue-dark'
                      : 'hover:bg-white text-slate-700'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon
                    size={18}
                    className={
                      active ? 'text-brand-blue-primary' : 'text-slate-500'
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <div className="text-sm font-semibold truncate">
                        {s.label}
                      </div>
                      {isSuper && (
                        <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                          Super
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-xs mt-0.5 leading-snug ${
                        active ? 'text-brand-blue-dark/70' : 'text-slate-500'
                      }`}
                    >
                      {s.sublabel}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto pt-4 border-t border-slate-200">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Acting as
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  actorRole === 'super_admin'
                    ? 'bg-rose-500'
                    : actorRole === 'domain_admin'
                      ? 'bg-emerald-500'
                      : 'bg-amber-500'
                }`}
              />
              <div className="text-sm font-semibold text-slate-800">
                {actorRole === 'super_admin'
                  ? 'Super admin'
                  : actorRole === 'domain_admin'
                    ? 'Domain admin'
                    : 'Building admin'}
              </div>
            </div>
            <div className="text-xs text-slate-500 font-mono truncate mt-0.5">
              {user?.email ?? 'signed out'}
            </div>
          </div>
        </aside>

        {/* Mobile section selector */}
        <div className="md:hidden w-full">
          <select
            value={effectiveSection}
            onChange={(e) => setSection(e.target.value as SectionId)}
            className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold mb-4"
            aria-label="Organization section"
          >
            {visibleSections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-y-auto pb-8">
          {sectionLoading[effectiveSection] ? (
            <PanelLoading />
          ) : (
            <>
              {effectiveSection === 'orgs' && (
                <AllOrganizationsView
                  orgs={organizations}
                  onOpen={(id) => {
                    setSelectedOrgId(id);
                    setSection('overview');
                  }}
                  onCreate={handleCreateOrg}
                />
              )}
              {effectiveSection === 'overview' &&
                (activeOrg ? (
                  <OverviewView
                    org={activeOrg}
                    isSuperAdmin={isSuperAdmin}
                    actorRole={actorRole}
                    onUpdate={handleUpdateOrg}
                    onArchive={handleArchiveOrg}
                  />
                ) : (
                  <PanelEmpty message="No organization found for this account." />
                ))}
              {effectiveSection === 'domains' && (
                <DomainsView
                  domains={domains}
                  onAdd={handleAddDomain}
                  onRemove={handleRemoveDomain}
                />
              )}
              {effectiveSection === 'buildings' && (
                <BuildingsView
                  buildings={buildings}
                  actorRole={actorRole}
                  actorBuildingIds={actorBuildingIds}
                  onAdd={handleAddBuilding}
                  onUpdate={handleUpdateBuilding}
                  onRemove={handleRemoveBuilding}
                />
              )}
              {effectiveSection === 'roles' && (
                <RolesView
                  roles={roles}
                  onSave={handleSaveRoles}
                  onReset={handleResetRoles}
                />
              )}
              {effectiveSection === 'users' && (
                <UsersView
                  users={users}
                  roles={roles}
                  buildings={buildings}
                  actorRole={actorRole}
                  actorBuildingIds={actorBuildingIds}
                  onUpdate={handleUpdateUser}
                  onBulkUpdate={handleBulkUpdateUsers}
                  onRemove={handleRemoveUsers}
                  onInvite={handleInvite}
                />
              )}
              {effectiveSection === 'student' &&
                (studentPage && activeOrg ? (
                  <StudentPageView
                    config={studentPage}
                    orgName={activeOrg.name}
                    onUpdate={handleUpdateStudentPage}
                  />
                ) : (
                  <PanelEmpty message="Student page config has not been seeded yet." />
                ))}
            </>
          )}
        </main>
      </div>

      {toast && <OrgToast message={toast.message} type={toast.type} />}
    </div>
  );
};

const PanelLoading: React.FC = () => (
  <div className="flex items-center justify-center h-64 text-slate-500 gap-2">
    <Loader2 size={18} className="animate-spin" />
    <span className="text-sm">Loading…</span>
  </div>
);

const PanelEmpty: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex items-center justify-center h-64 text-slate-500">
    <span className="text-sm">{message}</span>
  </div>
);
