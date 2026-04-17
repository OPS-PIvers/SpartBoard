import type {
  BuildingRecord,
  CapabilityGroup,
  DomainRecord,
  OrgRecord,
  RoleRecord,
  StudentPageConfig,
  UserRecord,
} from './types';

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    id: 'boards',
    label: 'Boards',
    capabilities: [
      { id: 'viewBoards', label: 'View boards' },
      { id: 'editBoards', label: 'Create & edit boards' },
      { id: 'shareBoards', label: 'Share boards with peers' },
      { id: 'saveTemplate', label: 'Save as template' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    capabilities: [
      { id: 'accessAdmin', label: 'Access admin console' },
      { id: 'manageUsers', label: 'Manage users' },
      { id: 'manageRoles', label: 'Manage roles & permissions' },
      { id: 'manageBuildings', label: 'Create & edit buildings' },
      { id: 'configureWidgets', label: 'Configure widget defaults' },
      { id: 'manageBackgrounds', label: 'Manage backgrounds' },
      { id: 'postAnnouncements', label: 'Post announcements' },
    ],
  },
  {
    id: 'org',
    label: 'Organization',
    capabilities: [
      { id: 'editOrg', label: 'Edit org identity & plan' },
      { id: 'manageDomains', label: 'Manage sign-in domains' },
      { id: 'editStudentPage', label: 'Edit student landing page' },
    ],
  },
  {
    id: 'super',
    label: 'Super admin',
    capabilities: [
      { id: 'manageOrgs', label: 'Create & manage orgs' },
      { id: 'toggleAI', label: 'Toggle AI features per org' },
      { id: 'viewPlatform', label: 'View platform analytics' },
    ],
  },
  {
    id: 'student',
    label: 'Student tools',
    capabilities: [
      { id: 'joinSession', label: 'Join live sessions' },
      { id: 'viewAssignments', label: 'View assignments' },
    ],
  },
];

export const SEED_ORGS: OrgRecord[] = [
  {
    id: 'org-orono',
    name: 'Orono Public Schools',
    shortName: 'Orono',
    shortCode: 'OPS',
    state: 'MN',
    plan: 'full',
    aiEnabled: true,
    primaryAdminEmail: 'jlindgren@orono.k12.mn.us',
    createdAt: '2024-08-14',
    users: 412,
    buildings: 4,
    status: 'active',
    seedColor: 'bg-indigo-600',
    supportUrl: 'https://orono.k12.mn.us/support',
  },
  {
    id: 'org-wayzata',
    name: 'Wayzata Public Schools',
    shortName: 'Wayzata',
    shortCode: 'WPS',
    state: 'MN',
    plan: 'expanded',
    aiEnabled: false,
    primaryAdminEmail: 'dtorres@wayzata.k12.mn.us',
    createdAt: '2024-09-02',
    users: 687,
    buildings: 7,
    status: 'active',
    seedColor: 'bg-emerald-600',
  },
  {
    id: 'org-minnetonka',
    name: 'Minnetonka Public Schools',
    shortName: 'Minnetonka',
    shortCode: 'MPS',
    state: 'MN',
    plan: 'full',
    aiEnabled: true,
    primaryAdminEmail: 'rchen@minnetonka.k12.mn.us',
    createdAt: '2025-01-11',
    users: 521,
    buildings: 6,
    status: 'active',
    seedColor: 'bg-violet-600',
  },
  {
    id: 'org-stillwater',
    name: 'Stillwater Area Schools',
    shortName: 'Stillwater',
    shortCode: 'SAS',
    state: 'MN',
    plan: 'basic',
    aiEnabled: false,
    primaryAdminEmail: 'mwhite@stillwaterschools.org',
    createdAt: '2025-03-20',
    users: 98,
    buildings: 2,
    status: 'trial',
    seedColor: 'bg-sky-600',
  },
];

export const SEED_BUILDINGS: BuildingRecord[] = [
  {
    id: 'b-schumann',
    orgId: 'org-orono',
    name: 'Schumann Elementary',
    type: 'elementary',
    address: '5455 Old Crystal Bay Rd N',
    grades: 'K-2',
    users: 94,
    adminEmails: ['kthompson@orono.k12.mn.us'],
  },
  {
    id: 'b-intermediate',
    orgId: 'org-orono',
    name: 'Orono Intermediate',
    type: 'elementary',
    address: '685 Old Crystal Bay Rd N',
    grades: '3-5',
    users: 102,
    adminEmails: ['mroberts@orono.k12.mn.us'],
  },
  {
    id: 'b-middle',
    orgId: 'org-orono',
    name: 'Orono Middle School',
    type: 'middle',
    address: '685 Old Crystal Bay Rd N',
    grades: '6-8',
    users: 96,
    adminEmails: ['jpeterson@orono.k12.mn.us'],
  },
  {
    id: 'b-high',
    orgId: 'org-orono',
    name: 'Orono High School',
    type: 'high',
    address: '795 Old Crystal Bay Rd N',
    grades: '9-12',
    users: 120,
    adminEmails: ['dholt@orono.k12.mn.us', 'kthompson@orono.k12.mn.us'],
  },
];

export const SEED_DOMAINS: DomainRecord[] = [
  {
    id: 'd-orono',
    orgId: 'org-orono',
    domain: '@orono.k12.mn.us',
    authMethod: 'google',
    status: 'verified',
    role: 'primary',
    users: 386,
    addedAt: '2024-08-14',
  },
  {
    id: 'd-student',
    orgId: 'org-orono',
    domain: '@student.orono.k12.mn.us',
    authMethod: 'google',
    status: 'verified',
    role: 'student',
    users: 1840,
    addedAt: '2024-09-01',
  },
  {
    id: 'd-oronoschools',
    orgId: 'org-orono',
    domain: '@oronoschools.org',
    authMethod: 'email',
    status: 'pending',
    role: 'staff',
    users: 0,
    addedAt: '2026-04-08',
  },
];

const full = (caps: string[]): Record<string, 'full'> =>
  Object.fromEntries(caps.map((c) => [c, 'full'])) as Record<string, 'full'>;

const allCaps: string[] = CAPABILITY_GROUPS.flatMap((g) =>
  g.capabilities.map((c) => c.id)
);

export const SEED_ROLES: RoleRecord[] = [
  {
    id: 'super_admin',
    name: 'Super admin',
    blurb: 'SpartBoard staff. Full access across every organization.',
    color: 'rose',
    system: true,
    perms: full(allCaps),
  },
  {
    id: 'domain_admin',
    name: 'Domain admin',
    blurb: 'District IT. Full access within this organization.',
    color: 'indigo',
    system: true,
    perms: {
      ...full(
        allCaps.filter(
          (c) => !['manageOrgs', 'toggleAI', 'viewPlatform'].includes(c)
        )
      ),
      manageOrgs: 'none',
      toggleAI: 'none',
      viewPlatform: 'none',
    },
  },
  {
    id: 'building_admin',
    name: 'Building admin',
    blurb: 'Principals and site leads. Scoped to their building(s).',
    color: 'violet',
    system: true,
    perms: {
      viewBoards: 'full',
      editBoards: 'full',
      shareBoards: 'full',
      saveTemplate: 'full',
      accessAdmin: 'full',
      manageUsers: 'building',
      manageRoles: 'none',
      manageBuildings: 'none',
      configureWidgets: 'building',
      manageBackgrounds: 'building',
      postAnnouncements: 'building',
      editOrg: 'none',
      manageDomains: 'none',
      editStudentPage: 'none',
      manageOrgs: 'none',
      toggleAI: 'none',
      viewPlatform: 'none',
      joinSession: 'none',
      viewAssignments: 'none',
    },
  },
  {
    id: 'teacher',
    name: 'Teacher',
    blurb: 'Classroom teachers. Can build and share boards.',
    color: 'emerald',
    system: true,
    perms: {
      viewBoards: 'full',
      editBoards: 'full',
      shareBoards: 'full',
      saveTemplate: 'full',
      accessAdmin: 'none',
      manageUsers: 'none',
      manageRoles: 'none',
      manageBuildings: 'none',
      configureWidgets: 'none',
      manageBackgrounds: 'none',
      postAnnouncements: 'none',
      editOrg: 'none',
      manageDomains: 'none',
      editStudentPage: 'none',
      manageOrgs: 'none',
      toggleAI: 'none',
      viewPlatform: 'none',
      joinSession: 'none',
      viewAssignments: 'none',
    },
  },
  {
    id: 'student',
    name: 'Student',
    blurb: 'Students. Can join sessions and view assignments.',
    color: 'sky',
    system: true,
    perms: {
      viewBoards: 'none',
      editBoards: 'none',
      shareBoards: 'none',
      saveTemplate: 'none',
      accessAdmin: 'none',
      manageUsers: 'none',
      manageRoles: 'none',
      manageBuildings: 'none',
      configureWidgets: 'none',
      manageBackgrounds: 'none',
      postAnnouncements: 'none',
      editOrg: 'none',
      manageDomains: 'none',
      editStudentPage: 'none',
      manageOrgs: 'none',
      toggleAI: 'none',
      viewPlatform: 'none',
      joinSession: 'full',
      viewAssignments: 'full',
    },
  },
];

// Build 24 teachers + 20 students + a few admins to exercise the table.
const firstNames = [
  'Jacob',
  'Sarah',
  'Emma',
  'Liam',
  'Olivia',
  'Noah',
  'Ava',
  'Ethan',
  'Mia',
  'Lucas',
  'Isabella',
  'Mason',
  'Sophia',
  'Logan',
  'Charlotte',
  'Oliver',
  'Amelia',
  'Aiden',
  'Harper',
  'Carter',
  'Evelyn',
  'Wyatt',
  'Abigail',
  'Jack',
  'Emily',
  'Owen',
  'Madison',
  'Levi',
  'Ella',
  'Daniel',
  'Scarlett',
  'Henry',
  'Grace',
  'Sebastian',
  'Chloe',
  'Jackson',
  'Victoria',
  'Michael',
  'Aubrey',
  'Gabriel',
];
const lastNames = [
  'Lindgren',
  'Torres',
  'Chen',
  'Anderson',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Garcia',
  'Miller',
  'Davis',
  'Martinez',
  'Hernandez',
  'Lopez',
  'Gonzalez',
  'Wilson',
  'Peterson',
  'Thompson',
  'Roberts',
  'Holt',
  'Patel',
  'Singh',
  'Nguyen',
  'Tran',
  'Schmidt',
];

const buildingIds = ['b-schumann', 'b-intermediate', 'b-middle', 'b-high'];

const makeUser = (idx: number): UserRecord => {
  const fn = firstNames[idx % firstNames.length];
  const ln = lastNames[idx % lastNames.length];
  const email = `${fn[0].toLowerCase()}${ln.toLowerCase()}@orono.k12.mn.us`;
  // Distribute roles
  let role: UserRecord['role'] = 'teacher';
  if (idx === 0) role = 'domain_admin';
  else if (idx === 1 || idx === 2) role = 'building_admin';
  else if (idx % 7 === 0) role = 'building_admin';

  const status: UserRecord['status'] =
    idx % 11 === 0 ? 'invited' : idx % 17 === 0 ? 'inactive' : 'active';

  const building = buildingIds[idx % buildingIds.length];
  const second =
    idx % 5 === 0 ? buildingIds[(idx + 1) % buildingIds.length] : null;

  const days = idx % 30;
  const last = new Date(Date.now() - days * 86400000).toISOString();

  return {
    id: `u-${idx}`,
    orgId: 'org-orono',
    name: `${fn} ${ln}`,
    email,
    role,
    buildingIds: second ? [building, second] : [building],
    status,
    lastActive: status === 'invited' ? null : last,
    invitedAt: status === 'invited' ? last : undefined,
  };
};

export const SEED_USERS: UserRecord[] = Array.from({ length: 48 }, (_, i) =>
  makeUser(i)
);

export const SEED_STUDENT_PAGE: StudentPageConfig = {
  orgId: 'org-orono',
  showAnnouncements: true,
  showTeacherDirectory: true,
  showLunchMenu: false,
  accentColor: '#2d3f89',
  heroText: 'Welcome, Orono students!',
};
