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
  /** False while `admin_settings/view_as.allowUnlock` is off or the target is an admin. */
  canUnlock?: boolean;
}

export type StudentPreviewKind =
  | 'quiz'
  | 'video-activity'
  | 'guided-learning'
  | 'activity-wall';

export interface StudentPreviewHandoff {
  sid: string;
  token: string;
  studentUid: string;
  kind: StudentPreviewKind;
  sessionId: string;
  /** The response doc id (quiz, VA, GL) or post author uid (activity wall). */
  studentKey: string;
  expiresAt: number;
}

/** startViewAsStudentV1, called from a teacher's View as tab (D15). */
export interface StartViewAsStudentRequest {
  kind: StudentPreviewKind;
  sessionId: string;
  /** The response doc id (quiz, VA, GL) or post author uid (activity wall). */
  studentKey: string;
}

export type StartViewAsStudentResponse = StudentPreviewHandoff;

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
  | 'view_as_student'
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

/** Every view-as audit action, in the order the View as log filters list them. */
export const VIEW_AS_LOG_ACTIONS = [
  'view_as_start',
  'view_as_student',
  'view_as_renew',
  'view_as_unlock',
  'view_as_end',
  'view_as_save',
  'view_as_approve',
  'view_as_outward',
  'view_as_revert',
] as const satisfies readonly ViewAsAuditAction[];

/**
 * Revertable entries (view_as_save, view_as_approve): `path` is a doc path under
 * `users/{targetUid}`, plus `#widgets/{widgetId}` for one board widget. `before` and
 * `after` map each changed field (dotted for a doc, top-level for a widget) to its
 * value; a key missing from one side means the field was absent.
 */
export interface RevertViewAsChangeRequest {
  logId: string;
  /** Revert although the field moved on, only while it still holds `seen`. */
  force?: boolean;
  seen?: Record<string, unknown>;
}

export type RevertViewAsChangeResponse =
  | { status: 'reverted' }
  | { status: 'conflict'; current: Record<string, unknown> }
  | { status: 'missing' }
  | { status: 'already' };
