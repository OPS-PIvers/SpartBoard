// Organization types moved to @/types/organization so they can be shared
// between UI components and the Firestore-backed hooks. This file re-exports
// the shared module for backward compatibility; import from
// '@/types/organization' in new code.
export type {
  ActorRole,
  AuthMethod,
  BuildingRecord,
  BuildingType,
  CapabilityAccess,
  CapabilityGroup,
  CapabilityId,
  DomainRecord,
  DomainRole,
  DomainStatus,
  InvitationRecord,
  MemberRecord,
  OrgRecord,
  Plan,
  RoleId,
  RoleRecord,
  StudentPageConfig,
  UserRecord,
  UserStatus,
} from '@/types/organization';
