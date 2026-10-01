// Wire shapes for super admin "View as" (docs/plans/ADMIN_VIEW_AS.md); mirrored in functions/src/viewAs.ts.

/** The `viewAs` custom claim the server mints onto the target's token. `exp` is epoch ms. */
export interface ViewAsClaim {
  by: string;
  sid: string;
  ro: boolean;
  adminTarget: boolean;
  exp: number;
}

/** `view_as_sessions/{sid}`, written only by the Admin SDK; super admins read it. */
export interface ViewAsSessionDoc {
  by: string;
  targetEmail: string;
  targetUid: string;
  adminTarget: boolean;
  unlocked: boolean;
  reason: string | null;
  createdAt: unknown;
  expiresAt: unknown;
  endedAt: unknown;
}

export interface StartViewAsSessionRequest {
  targetEmail: string;
}

export interface StartViewAsSessionResponse {
  sid: string;
  token: string;
  targetUid: string;
  targetEmail: string;
  adminTarget: boolean;
  expiresAt: number;
}

export type ViewAsSessionAction = 'renew' | 'unlock' | 'end';

export interface UpdateViewAsSessionRequest {
  action: ViewAsSessionAction;
  /** Required for unlock. */
  reason?: string;
  /** Only when the opener (the admin's own session) ends a session by id. */
  sid?: string;
}

export interface UpdateViewAsSessionResponse {
  /** Absent for `end`. */
  token?: string;
  expiresAt?: number;
  unlocked?: boolean;
  ended?: boolean;
}

/** Audit entries in `admin_audit_log` that a view-as tab may write itself (when unlocked). */
export const VIEW_AS_CLIENT_AUDIT_ACTIONS = [
  'view_as_save',
  'view_as_approve',
  'view_as_outward',
] as const;

export type ViewAsAuditAction =
  | 'view_as_start'
  | 'view_as_renew'
  | 'view_as_unlock'
  | 'view_as_end'
  | 'view_as_revert'
  | (typeof VIEW_AS_CLIENT_AUDIT_ACTIONS)[number];

export interface ViewAsAuditEntry {
  action: ViewAsAuditAction;
  sid: string;
  /** The super admin. */
  email: string;
  targetEmail: string;
  targetUid: string;
  path?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  timestamp: unknown;
}
