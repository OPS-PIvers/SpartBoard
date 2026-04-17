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
} from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import {
  SEED_BUILDINGS,
  SEED_DOMAINS,
  SEED_ORGS,
  SEED_ROLES,
  SEED_STUDENT_PAGE,
  SEED_USERS,
} from './mockData';
import type {
  ActorRole,
  BuildingRecord,
  DomainRecord,
  OrgRecord,
  RoleRecord,
  StudentPageConfig,
  UserRecord,
} from './types';
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
  const { isAdmin, userRoles, user } = useAuth();
  const isSuperAdmin = Boolean(
    user?.email &&
    userRoles?.superAdmins?.some(
      (e) => e.toLowerCase() === user.email?.toLowerCase()
    )
  );
  const actorRole = resolveActorRole(isAdmin, isSuperAdmin);

  // Mock in-memory state. TODO: wire to Firestore / org APIs.
  const [orgs, setOrgs] = useState<OrgRecord[]>(SEED_ORGS);
  const [activeOrgId, setActiveOrgId] = useState<string>(
    SEED_ORGS[0]?.id ?? ''
  );
  const [buildings, setBuildings] = useState<BuildingRecord[]>(SEED_BUILDINGS);
  const [domains, setDomains] = useState<DomainRecord[]>(SEED_DOMAINS);
  const [roles, setRoles] = useState<RoleRecord[]>(SEED_ROLES);
  const [users, setUsers] = useState<UserRecord[]>(SEED_USERS);
  const [studentPage, setStudentPage] =
    useState<StudentPageConfig>(SEED_STUDENT_PAGE);

  // Default: super admin starts on orgs; others on overview.
  const defaultSection: SectionId = isSuperAdmin ? 'orgs' : 'overview';
  const [section, setSection] = useState<SectionId>(() => {
    if (typeof window === 'undefined') return defaultSection;
    const stored = window.localStorage.getItem(STORAGE_KEY) as SectionId | null;
    if (stored && SECTIONS.some((s) => s.id === stored)) return stored;
    return defaultSection;
  });

  const setSectionPersist = (s: SectionId) => {
    setSection(s);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, s);
    }
  };

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

  const visibleSections = useMemo(
    () =>
      SECTIONS.filter((s) => {
        if (s.superOnly && actorRole !== 'super_admin') return false;
        if (s.domainAdminOnly && actorRole === 'building_admin') return false;
        return true;
      }),
    [actorRole]
  );

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? orgs[0];

  // Active section may need to fall back if hidden by scoping.
  const effectiveSection: SectionId = visibleSections.some(
    (s) => s.id === section
  )
    ? section
    : (visibleSections[0]?.id ?? 'overview');

  // If the persisted section is no longer visible to this actor (e.g. a super
  // admin downgraded to domain admin), write the fallback back to state +
  // localStorage so reloads land on a section the user can actually see.
  // Adjust-during-render pattern: React discards this render and re-renders
  // with the corrected state, so no cascading-effect warning.
  if (section !== effectiveSection) {
    setSection(effectiveSection);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, effectiveSection);
    }
  }

  // ---- Handlers ----

  const updateOrg = (patch: Partial<OrgRecord>) => {
    setOrgs((prev) =>
      prev.map((o) => (o.id === activeOrg.id ? { ...o, ...patch } : o))
    );
    showToast('Organization updated');
  };

  const archiveOrg = (id: string) => {
    setOrgs((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: 'archived' } : o))
    );
    showToast('Organization archived', 'warn');
  };

  const createOrg = (partial: Partial<OrgRecord>) => {
    const id = `org-${Date.now()}`;
    const record: OrgRecord = {
      id,
      name: partial.name ?? 'New organization',
      shortName: partial.name?.split(' ')[0] ?? 'New',
      shortCode: partial.shortCode ?? 'NEW',
      state: partial.state ?? '',
      plan: partial.plan ?? 'basic',
      aiEnabled: false,
      primaryAdminEmail: partial.primaryAdminEmail ?? '',
      createdAt: new Date().toISOString().slice(0, 10),
      users: 0,
      buildings: 0,
      status: 'trial',
      seedColor: 'bg-teal-600',
    };
    setOrgs((prev) => [...prev, record]);
    setActiveOrgId(id);
    setSectionPersist('overview');
    showToast('Organization created');
  };

  const addBuilding = (b: Partial<BuildingRecord>) => {
    const record: BuildingRecord = {
      id: `b-${Date.now()}`,
      orgId: activeOrg.id,
      name: b.name ?? 'New building',
      type: b.type ?? 'elementary',
      address: b.address ?? '',
      grades: b.grades ?? 'K-5',
      users: 0,
      adminEmails: b.adminEmails ?? [],
    };
    setBuildings((prev) => [...prev, record]);
    showToast('Building added');
  };

  const updateBuilding = (id: string, patch: Partial<BuildingRecord>) => {
    setBuildings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b))
    );
    showToast('Building updated');
  };

  const removeBuilding = (id: string) => {
    setBuildings((prev) => prev.filter((b) => b.id !== id));
    showToast('Building archived', 'warn');
  };

  const addDomain = (d: Partial<DomainRecord>) => {
    const record: DomainRecord = {
      id: `d-${Date.now()}`,
      orgId: activeOrg.id,
      domain: d.domain ?? '@example.com',
      authMethod: d.authMethod ?? 'google',
      status: d.status ?? 'pending',
      role: d.role ?? 'staff',
      users: d.users ?? 0,
      addedAt: d.addedAt ?? new Date().toISOString().slice(0, 10),
    };
    setDomains((prev) => [...prev, record]);
    showToast('Domain added. Check DNS for verification.');
  };

  const removeDomain = (id: string) => {
    setDomains((prev) => prev.filter((d) => d.id !== id));
    showToast('Domain removed', 'warn');
  };

  const saveRoles = (next: RoleRecord[]) => {
    setRoles(next);
    showToast('Roles & permissions saved');
  };

  const resetRoles = () => {
    setRoles(SEED_ROLES);
    showToast('Roles reset to defaults', 'warn');
  };

  const updateUser = (id: string, patch: Partial<UserRecord>) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    const label =
      patch.role !== undefined
        ? 'Role updated'
        : patch.status !== undefined
          ? `Status set to ${patch.status}`
          : patch.buildingIds !== undefined
            ? 'Buildings updated'
            : 'User updated';
    showToast(label);
  };

  const removeUsers = (ids: string[]) => {
    setUsers((prev) => prev.filter((u) => !ids.includes(u.id)));
    showToast(
      `Deleted ${ids.length} user${ids.length === 1 ? '' : 's'}`,
      'warn'
    );
  };

  const inviteUsers = (
    emails: string[],
    roleId: string,
    buildingIds: string[]
  ) => {
    const newbies = emails.map<UserRecord>((email, i) => ({
      id: `u-new-${Date.now()}-${i}`,
      orgId: activeOrg.id,
      name: email.split('@')[0]?.replace(/[._-]/g, ' ') ?? email,
      email,
      role: roleId,
      buildingIds,
      status: 'invited',
      lastActive: null,
      invitedAt: new Date().toISOString(),
    }));
    setUsers((prev) => [...prev, ...newbies]);
    showToast(`Invited ${emails.length} user${emails.length === 1 ? '' : 's'}`);
  };

  const actorBuildingIds = useMemo(() => {
    // Placeholder: building admins would have assigned building IDs.
    // For the prototype, scope them to the first building in the list.
    if (actorRole !== 'building_admin') return buildings.map((b) => b.id);
    return buildings.slice(0, 1).map((b) => b.id);
  }, [actorRole, buildings]);

  return (
    <div className="max-w-[1440px] mx-auto h-full">
      <div className="flex gap-6 h-full">
        {/* Left rail */}
        <aside className="w-[230px] shrink-0 hidden md:flex flex-col">
          {actorRole !== 'super_admin' ? (
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
          ) : (
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setSectionPersist('orgs')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
              >
                <ChevronLeft size={14} />
                All organizations
              </button>
              {effectiveSection !== 'orgs' && (
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
                  onClick={() => setSectionPersist(s.id)}
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
            onChange={(e) => setSectionPersist(e.target.value as SectionId)}
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
          {effectiveSection === 'orgs' && (
            <AllOrganizationsView
              orgs={orgs}
              onOpen={(id) => {
                setActiveOrgId(id);
                setSectionPersist('overview');
              }}
              onCreate={createOrg}
            />
          )}
          {effectiveSection === 'overview' && (
            <OverviewView
              org={activeOrg}
              isSuperAdmin={isSuperAdmin}
              onUpdate={updateOrg}
              onArchive={archiveOrg}
            />
          )}
          {effectiveSection === 'domains' && (
            <DomainsView
              domains={domains.filter((d) => d.orgId === activeOrg.id)}
              onAdd={addDomain}
              onRemove={removeDomain}
            />
          )}
          {effectiveSection === 'buildings' && (
            <BuildingsView
              buildings={buildings.filter((b) => b.orgId === activeOrg.id)}
              onAdd={addBuilding}
              onUpdate={updateBuilding}
              onRemove={removeBuilding}
            />
          )}
          {effectiveSection === 'roles' && (
            <RolesView roles={roles} onSave={saveRoles} onReset={resetRoles} />
          )}
          {effectiveSection === 'users' && (
            <UsersView
              users={users.filter((u) => u.orgId === activeOrg.id)}
              roles={roles}
              buildings={buildings.filter((b) => b.orgId === activeOrg.id)}
              actorRole={actorRole}
              actorBuildingIds={actorBuildingIds}
              onUpdate={updateUser}
              onRemove={removeUsers}
              onInvite={inviteUsers}
            />
          )}
          {effectiveSection === 'student' && (
            <StudentPageView
              config={studentPage}
              orgName={activeOrg.name}
              onUpdate={(patch) =>
                setStudentPage((prev) => ({ ...prev, ...patch }))
              }
            />
          )}
        </main>
      </div>

      {toast && <OrgToast message={toast.message} type={toast.type} />}
    </div>
  );
};
