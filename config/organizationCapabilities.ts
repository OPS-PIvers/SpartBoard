// Canonical list of capability groups shown in the Roles & permissions matrix.
// Kept here (not in the Organization panel) so the migration script and any
// future Cloud Functions can import the same source of truth.
//
// When adding a capability:
//   1. Add to the CapabilityId union in types/organization.ts
//   2. Add to the appropriate group below
//   3. Add to the SYSTEM_ROLES perms in scripts/setup-organization.js

import type { CapabilityGroup, CapabilityId } from '@/types/organization';

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

export const ALL_CAPABILITY_IDS: CapabilityId[] = CAPABILITY_GROUPS.flatMap(
  (g) => g.capabilities.map((c) => c.id)
);
