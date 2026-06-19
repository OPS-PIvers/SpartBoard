/**
 * Cloud Functions entrypoint — a THIN BARREL of re-exports (F12).
 *
 * Every Cloud Function lives in its own leaf module; this file only re-exports
 * them so `firebase deploy --only functions` and the test suite see the exact
 * same set of exported identifiers as before the split. Adding a function means
 * adding a leaf module and a re-export line here — NOT editing a 4000-line file.
 *
 * INVARIANT: the set of exported identifiers (and their names) must stay
 * byte-identical, or Firebase would treat renamed/removed exports as deleted
 * deploy targets. A barrel `export { x } from './m'` preserves the deployed
 * function name `x`.
 *
 * `admin.initializeApp()` + `setGlobalOptions()` are NOT called here anymore —
 * each leaf module imports the shared `./functionsInit` side-effect module,
 * which runs them exactly once (guarded on `admin.apps.length`).
 */

// ── ClassLink roster (teacher-side OneRoster import) ───────────────────────
export { getClassLinkRosterV1 } from './classlinkRoster';

// ── AI generation (Gemini): quiz / video-activity / guided-learning / etc. ─
// Includes the test-only validator + cache-introspection re-exports the test
// suites import from `./index`.
export {
  generateWithAI,
  generateVideoActivity,
  transcribeVideoWithGemini,
  generateGuidedLearning,
  validateAndBucketVideoQuestions,
  validateAndBucketQuizQuestions,
  __resetGenerateWithAICaches,
  __getCachedAdminStatus,
  __getGeminiModelConfig,
} from './aiGeneration';

// ── External-content proxy + iframe embeddability check ────────────────────
export { fetchExternalProxy, checkUrlCompatibility } from './embedProxy';

// ── Activity Wall photo → Google Drive archive ─────────────────────────────
export { archiveActivityWallPhoto } from './driveArchive';

// ── Admin analytics HTTP endpoint (snapshot read) ──────────────────────────
export { adminAnalytics } from './adminAnalyticsEndpoint';

// ── Student identity (ClassLink-via-Google SSO) + PIN→SSO unification ───────
export {
  studentLoginV1,
  getAssignmentPseudonymV1,
  getStudentClassDirectoryV1,
  getPseudonymsForAssignmentV1,
  commitRosterPinIndexV1,
  pinLoginV1,
} from './studentIdentity';

// ── Organization invitations + membership write-through (Phase 4) ──────────
export {
  createOrganizationInvites,
  claimOrganizationInvite,
} from './organizationInvites';
export { organizationMembersSync } from './organizationMembersSync';
export { organizationMemberCounters } from './organizationMemberCounters';
export { organizationBuildingCounters } from './organizationBuildingCounters';
export { resetOrganizationUserPassword } from './organizationResetPassword';
export { getOrgUserActivity } from './organizationUserActivity';
export { plcInvitationEmail } from './plcInviteEmails';
export { rolloutRequestEmail } from './rolloutRequestEmail';
export { joinSyncedQuizGroup, leaveSyncedQuizGroup } from './syncedQuizGroups';
export {
  joinSyncedVideoActivityGroup,
  leaveSyncedVideoActivityGroup,
} from './syncedVideoActivityGroups';
export { joinPlcQuizSyncGroup } from './plcQuizSyncJoin';
export { joinPlcAssignmentSyncGroup } from './plcAssignmentSyncJoin';
export { joinPlcVideoActivitySyncGroup } from './plcVideoActivitySyncJoin';

// ── One-shot PLC migration (arrays→members map, orgId inference, aggregates
// skeleton). Admin-only callable; see functions/src/migratePlcs.ts. ─────────
export { migratePlcs } from './migratePlcs';
export { recomputeAdminAnalytics } from './adminAnalyticsSnapshot';
export { expireSubShares } from './expireSubShares';
export { finalizeIdleQuizAttempts } from './finalizeIdleQuizAttempts';
export {
  exchangeGoogleAuthCode,
  refreshGoogleAccessToken,
  revokeGoogleRefreshToken,
} from './googleOAuth';
export {
  exchangeSpotifyAuthCode,
  refreshSpotifyAccessToken,
  revokeSpotifyAuth,
} from './spotifyOAuth';

// SPIKE — Google Classroom Add-on de-risk slice (student handshake + teacher
// discovery attachment-create). Defined in their own module to keep this file
// from growing; re-exported here so Firebase deploys them. See
// functions/src/classroomAddonAuth.ts.
export {
  classroomAddonLoginV1,
  createClassroomAttachment,
  assignToClassroomV1,
  linkClassroomCourse,
  unlinkClassroomCourse,
  pushClassroomGradesForAssignment,
  pushClassroomFinalGradesForAssignment,
} from './classroomAddonAuth';

// Schoology LTI 1.3 — see functions/src/lti/.
export { ltiJwks } from './lti/endpoints';
export { ltiLogin, ltiLaunch, ltiExchange } from './lti/launchEndpoints';
export {
  ltiSignDeepLinkResponseV1,
  ltiPushGradesForAssignmentV1,
  ltiResolveNamesForAssignmentV1,
} from './lti/serviceEndpoints';
export {
  linkLtiCourseV1,
  ltiSuggestClassLinkMatchV1,
} from './lti/courseLinkEndpoints';
