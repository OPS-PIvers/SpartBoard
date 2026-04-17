export type ActorRole = 'super_admin' | 'domain_admin' | 'building_admin';

export type RoleId = string;

export type Plan = 'basic' | 'expanded' | 'full';

export type CapabilityAccess = 'full' | 'building' | 'none';

export type BuildingType = 'elementary' | 'middle' | 'high' | 'other';

export type AuthMethod = 'google' | 'microsoft' | 'saml' | 'password' | 'email';

export type DomainStatus = 'verified' | 'pending';

export type DomainRole = 'primary' | 'student' | 'staff';

export type UserStatus = 'active' | 'invited' | 'inactive';

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
  perms: Record<string, CapabilityAccess>;
}

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
  capabilities: { id: string; label: string }[];
}

export interface StudentPageConfig {
  orgId: string;
  showAnnouncements: boolean;
  showTeacherDirectory: boolean;
  showLunchMenu: boolean;
  accentColor: string; // hex
  heroText: string;
}
