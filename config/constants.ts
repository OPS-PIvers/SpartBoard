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
