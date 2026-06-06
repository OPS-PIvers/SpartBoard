export const APP_NAME = 'SpartBoard';

/**
 * When true, anonymous students opening a ClassLink-rostered quiz session
 * (the session carries `classIds`) are steered to Google SSO sign-in by
 * default — with a "use a PIN instead" escape — rather than the PIN+period
 * join path. SSO keys the response by the student's own stable `auth.uid`,
 * which eliminates the "wrong period → forked onto another roster slot"
 * failure mode that the PIN+period path is prone to.
 *
 * Ships OFF. Flip to `true` to enable the redirect — do this only AFTER any
 * in-progress quiz session has ended, since it changes the join flow for
 * rostered sessions. PIN-only sessions (no `classIds`) are unaffected either
 * way.
 */
export const QUIZ_SSO_REDIRECT_ENABLED = false;

/**
 * Gates the dashboard "Assign to Google Classroom" entry point (the
 * teacher-initiated / partner-first flow: SpartBoard creates the courseWork +
 * its own add-on attachment, unlocking due-date sync).
 *
 * ENABLED 2026-06-05, after the safety interlocks cleared: the
 * `classroom.coursework.students` restricted scope was declared on the Google
 * Workspace Marketplace listing + OAuth consent screen, and the prod OAuth
 * client (`759666600376-hdc7…`) confirmed still Trusted in Admin → API Controls.
 * Those are the guards against the org-wide "Account Restricted" sign-in outage
 * (see knowledge_oauth_marketplace_scope_block); the new scope is requested only
 * when a teacher actually uses this button (incremental consent). The feature
 * only functions on prod — add-on launches don't reach the dev preview origin.
 */
export const CLASSROOM_ASSIGN_ENABLED = true;

/**
 * Staged-rollout guard for "Assign to Google Classroom": while `true`, the entry
 * point is shown to **admins only** so the first live (prod) end-to-end run —
 * Spike A: partner-first courseWork.create + due-date + token-less add-on
 * attachment + grade roll-up — happens with a single controlled user before the
 * button is exposed to every teacher. Flip to `false` (one line, no JSX changes)
 * to widen to all teachers once Spike A passes. Has no effect unless
 * `CLASSROOM_ASSIGN_ENABLED` is also `true`.
 */
export const CLASSROOM_ASSIGN_ADMIN_ONLY = true;
