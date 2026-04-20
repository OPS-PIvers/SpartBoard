// Shared Organization types (Firestore schema + UI view models).
// Used by both the Organization admin panel and the hooks that back it.
// See docs/organization_wiring_implementation.md for the wiring plan.

export type ActorRole = 'super_admin' | 'domain_admin' | 'building_admin';

export type RoleId = string;

export type Plan = 'basic' | 'expanded' | 'full';

export type CapabilityAccess = 'full' | 'building' | 'none';

export type BuildingType = 'elementary' | 'middle' | 'high' | 'other';

export type AuthMethod = 'google' | 'microsoft' | 'saml' | 'password' | 'email';

export type DomainStatus = 'verified' | 'pending';

export type DomainRole = 'primary' | 'student' | 'staff';

export type UserStatus = 'active' | 'invited' | 'inactive';

// Canonical list of capabilities. Mirrors the UI definitions in
// components/admin/Organization/mockData.ts (CAPABILITY_GROUPS). When adding
// a capability, update both this union and the UI list.
export type CapabilityId =
  // Boards
  | 'viewBoards'
  | 'editBoards'
  | 'shareBoards'
  | 'saveTemplate'
  // Admin
  | 'accessAdmin'
  | 'manageUsers'
  | 'manageRoles'
  | 'manageBuildings'
  | 'configureWidgets'
  | 'manageBackgrounds'
  | 'postAnnouncements'
  // Organization
  | 'editOrg'
  | 'manageDomains'
  | 'editStudentPage'
  // Super admin
  | 'manageOrgs'
  | 'toggleAI'
  | 'viewPlatform'
  // Student tools
  | 'joinSession'
  | 'viewAssignments';

export interface OrgRecord {
  id: string;
  name: string;
  shortName: string;
  shortCode: string; // 2-4 letters, used in avatars
  state: string;
  plan: Plan;
  aiEnabled: boolean;
  primaryAdminEmail: string;
  createdAt: string; // ISO date
  users: number;
  buildings: number;
  status: 'active' | 'trial' | 'archived';
  seedColor: string; // tailwind bg class e.g. 'bg-indigo-600'
  supportUrl?: string;
}

export interface BuildingRecord {
  id: string;
  orgId: string;
  name: string;
  type: BuildingType;
  address: string;
  grades: string; // e.g. 'K-2', '3-5'
  users: number;
  adminEmails: string[];
}

export interface DomainRecord {
  id: string;
  orgId: string;
  domain: string; // e.g. '@orono.k12.mn.us'
  authMethod: AuthMethod;
  status: DomainStatus;
  role: DomainRole;
  users: number;
  addedAt: string; // ISO date
}

export interface RoleRecord {
  id: RoleId;
  name: string;
  blurb: string;
  color: string; // tailwind accent name: 'rose'|'indigo'|'violet'|'emerald'|'sky'
  system: boolean;
  perms: Record<CapabilityId, CapabilityAccess>;
}

// Canonical membership record stored at
// /organizations/{orgId}/members/{emailLower}. `uid` is populated the first
// time the invited user signs in; absent until then.
export interface MemberRecord {
  email: string; // lowercase; matches doc id
  orgId: string;
  roleId: RoleId;
  buildingIds: string[];
  status: UserStatus;
  uid?: string; // linked on first sign-in
  name?: string;
  invitedAt?: string;
  lastActive?: string | null;
  addedBy?: string; // uid of admin who created this membership
  // Provenance for non-uid creation paths (migration scripts, Cloud Functions).
  // Set when `addedBy` can't be a real uid — e.g. 'migration:setup-organization'.
  addedBySource?: string;
}

// Short-lived invitation stored at /organizations/{orgId}/invitations/{token}.
// Created by the CSV import flow and consumed on first sign-in.
export interface InvitationRecord {
  token: string; // matches doc id
  orgId: string;
  email: string; // lowercase
  roleId: RoleId;
  buildingIds: string[];
  createdAt: string; // ISO date
  expiresAt: string; // ISO date
  issuedBy: string; // uid of admin who issued the invite
  claimedAt?: string; // ISO date; present once accepted
  claimedByUid?: string;
}

// UI view model. Hydrated from MemberRecord + display fields derived from
// email when a name isn't available. Kept separate from MemberRecord so the
// persistence schema can evolve without touching UI components.
export interface UserRecord {
  id: string;
  orgId: string;
  name: string;
  email: string;
  role: RoleId;
  buildingIds: string[];
  status: UserStatus;
  lastActive: string | null; // ISO date or null
  invitedAt?: string;
}

export interface CapabilityGroup {
  id: string;
  label: string;
  capabilities: { id: CapabilityId; label: string }[];
}

export interface StudentPageConfig {
  orgId: string;
  showAnnouncements: boolean;
  showTeacherDirectory: boolean;
  showLunchMenu: boolean;
  accentColor: string; // hex
  heroText: string;
}
