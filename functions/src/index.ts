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
export { classlinkRosterSync } from './classlinkRosterSync';

// ── AI generation (Gemini): quiz / video-activity / guided-learning / etc. ─
// Includes the test-only validator + cache-introspection re-exports the test
// suites import from `./index`.
export {
  generateWithAI,
  generateVideoActivity,
  transcribeVideoWithGemini,
  generateGuidedLearning,
  draftGuidedLearningStepTextV1,
  validateAndBucketVideoQuestions,
  validateAndBucketQuizQuestions,
  __resetGenerateWithAICaches,
  __getCachedAdminStatus,
  __getGeminiModelConfig,
  __resolveCallerIsAdmin,
  __isVerifiedBetaMember,
} from './aiGeneration';

// ── External-content proxy + iframe embeddability check ────────────────────
export { fetchExternalProxy, checkUrlCompatibility } from './embedProxy';
export { fetchLinkPreview } from './linkPreview';
export { fetchImportImage } from './fetchImportImage';

// ── Activity Wall photo → Google Drive archive (legacy client callable) ────
export { archiveActivityWallPhoto } from './driveArchive';

// ── Activity Wall media → teacher Drive archive (server-driven) + sweep ────
export {
  archiveActivityWallSubmissionOnCreate,
  archiveActivityWallSubmissionOnUpdate,
} from './activityWallArchive';
export { sweepActivityWallArchives } from './sweepActivityWallArchives';

// ── Quiz media response → transcode → teacher Drive archive + straggler sweep ─
export { archiveQuizMediaArtifact } from './quizMediaArchive';
export { sweepStuckQuizArchives } from './sweepStuckQuizArchives';
export { getQuizArtifactPlaybackUrl } from './getQuizArtifactPlaybackUrl';
// Handwritten paper answers: per-page transcription worker, retry and sweeps.
export {
  transcribePaperWrittenPageV1,
  retryPaperTranscriptionV1,
} from './paperTranscriptionWorker';
export {
  sweepPaperTranscriptionJobs,
  sweepPaperWrittenCrops,
} from './paperTranscriptionSweep';
export {
  getPaperWrittenCropV1,
  updatePaperTranscriptV1,
  applyPaperNewerScanV1,
  transcribePaperBlankV1,
} from './paperWrittenCallables';

// ── Quiz read-aloud (Cloud Text-to-Speech; docs/plans/shipped/QUIZ_READ_ALOUD.md) ──
export { prepareQuizReadAloudV1, synthesizeQuizAudioV1 } from './quizReadAloud';
export { synthesizeGuidedLearningNarrationV1 } from './guidedLearningNarration';
export { translateQuizV1, translateResponseV1 } from './quizTranslation';
export { extractStimulusReadAloudTextV1 } from './quizStimulusText';
export { extractQuizFromDocumentV1 } from './quizDocumentExtract';

// ── Org-admin media review & compliance delete (COPPA review-and-delete) ───
export {
  listQuizMediaForOrgAdmin,
  deleteQuizMediaForOrgAdmin,
} from './deleteQuizMediaForOrgAdmin';

// ── Admin analytics HTTP endpoint (snapshot read) ──────────────────────────
export { adminAnalytics } from './adminAnalyticsEndpoint';
export { getActiveStudentsV1 } from './adminActiveStudents';

// ── Guided Learning Storage slide GC (on set delete) ───────────────────────
export {
  gcGuidedLearningMedia,
  gcBuildingGuidedLearningMedia,
  releaseGuidedLearningMediaV1,
} from './gcGuidedLearningMedia';
export { gcGuidedLearningMediaSweep } from './glMediaSweep';
// Guided Learning building-set library index (server-written) + admin backfill.
export {
  glBuildingIndexMirror,
  rebuildGlBuildingIndexV1,
} from './glBuildingIndex';
// Published live-tour snapshots: set deletes and the one-time publish of existing tours.
export { glTourSnapshots } from './glTours';
export { tourAnchorApi } from './tourAnchorApi';
export { tourAnchorBatchTrigger } from './tourAnchorBatchTrigger';
export { tourAnchorSweep } from './tourAnchorSweep';

// ── Student identity (ClassLink-via-Google SSO) + PIN→SSO unification ───────
export {
  studentLoginV1,
  getAssignmentPseudonymV1,
  getStudentClassDirectoryV1,
  getPseudonymsForAssignmentV1,
  commitRosterPinIndexV1,
  pinLoginV1,
} from './studentIdentity';
// Student landing v2: whether a student's teacher has the new page.
export { getStudentLandingV2V1 } from './studentLandingV2';
// Gradebook D8: roster student → stable uid for the gradebook grid.
export { getGradebookRosterV1 } from './gradebook/getGradebookRosterV1';

// ── Projects widget: group import (docs/plans/shipped/PROJECTS_WIDGET.md D8) ───────
export { commitProjectGroupsV1 } from './projectGroups';
// Projects widget: uploads ride the Activity Wall's Storage → Drive path (D20).
export { archiveProjectUploadOnCreate } from './projectUploadArchive';

// ── Individual assignment targeting (M17): assign-time pseudonym fan-out to
// /student_assignments, plus the deletion triggers that reap those pointers. ─
export { setAssignmentTargetsV1 } from './studentAssignmentTargets';
// Paper answer sheets: the one server-side writer of scanned responses.
export {
  importPaperResponsesV1,
  publishPaperResultsV1,
} from './importPaperResponses';
// Paper answer sheets, delegated: printing a PLC teammate's stack while they
// are out. The context read is separate from the two writes.
export { getTeammatePrintContextV1 } from './getTeammatePrintContext';
export {
  createTeammatePaperBatchV1,
  withdrawTeammatePaperBatchV1,
} from './createTeammatePaperBatch';
export {
  cleanupQuizAssignmentPointers,
  cleanupVideoActivityAssignmentPointers,
  cleanupGuidedLearningAssignmentPointers,
  cleanupMiniAppAssignmentPointers,
  cleanupFlashcardAssignmentPointers,
} from './studentAssignmentCleanup';

// ── Flashcards Check submission (server-graded; docs/plans/shipped/FLASHCARDS.md §7) ─
export { submitFlashcardCheckV1 } from './flashcardCheck';
export { resolveFlashcardFlagV1 } from './flashcardFlags';

// ── Video Activity answer key (server-graded; key kept off session docs) ────
export {
  checkVideoActivityAnswerV1,
  scrubVideoActivitySessionKeyV1,
} from './videoActivityKey';

// ── Quiz score on submit (server-graded against a teacher-private key) ─────
export { scoreQuizOnSubmitV1 } from './quizScoreOnSubmit';

// ── Review self-paced game (server-graded per answer; QUIZ_REVIEW_SPLIT.md D31) ─
export { checkQuizGameAnswerV1 } from './checkQuizGameAnswer';

// ── Organization invitations + membership write-through (Phase 4) ──────────
export {
  createOrganizationInvites,
  claimOrganizationInvite,
} from './organizationInvites';
export { resolveOrgForUser } from './resolveOrgForUser';
export { organizationMembersSync } from './organizationMembersSync';
export { organizationMemberCounters } from './organizationMemberCounters';
export { organizationBuildingCounters } from './organizationBuildingCounters';
export { resetOrganizationUserPassword } from './organizationResetPassword';
export { deleteOrganizationUser } from './organizationUserDelete';
export { startViewAsSessionV1, updateViewAsSessionV1 } from './viewAs';
export { revertViewAsChangeV1 } from './viewAsRevert';
export { startViewAsStudentV1 } from './viewAsStudent';
export { getViewAsDriveTokenV1 } from './viewAsDrive';
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

// ── Clean-detach: remove the caller from a PLC synced group on unshare
// (the inverse of the sync-join handlers). PRD §5.3 / Decision 5.3. ─────────
export { detachPlcSyncLinkage } from './detachPlcSyncLinkage';

// ── Nightly PLC garbage collection: reap empty synced groups, trim activity
// > 90d, prune stale presence, hard-delete tombstones > 30d, trim version
// overflow. PRD §5.3 / §3.4 / §3.1 / §3.3, Decisions 5.3 / 3.4 / 3.1 / 2.1. ──
export { gcPlcOrphans } from './gcPlcOrphans';

// ── Group meeting recording: finalize, early delete, stale finalizer, 30-day audio sweep, late segments. ──
export {
  finalizePlcRecordingV1,
  deletePlcRecordingAudioV1,
  finalizeStalePlcRecordings,
  sweepPlcRecordingAudio,
  onPlcMeetingSegmentUploaded,
} from './plcMeetingRecording';

// ── Opt-in weekly PLC activity digest: one shared /mail doc per opted-in PLC
// off the activity log, gated by a separate kill switch (default OFF) and a
// per-PLC `digestOptIn` flag. NO per-member fan-out. PRD §5 / §8 / §2.3,
// Decision 2.3. ─────────────────────────────────────────────────────────────
export { plcWeeklyDigest } from './plcWeeklyDigest';
export { groupReminderEmails } from './groupReminderEmails';

// ── PII-safe PLC results pipeline: session/response writes mark assessments
// dirty; the 5-minute schedule recomputes /aggregates/{assessmentId}. ───────
export {
  markPlcAssessmentDirtyOnSession,
  markPlcAssessmentDirtyOnResponse,
} from './markPlcAssessmentDirty';
export { recomputePlcAssessments } from './recomputePlcAssessments';

// Gradebook grade index and student projection (docs/plans/GRADEBOOK.md D10, D37); off until admin_settings/gradebook_index.enabled.
export {
  gradeIndexQuizResponse,
  gradeIndexVideoResponse,
  gradeIndexGuidedLearningResponse,
  gradeIndexFlashcardProgress,
  gradeIndexProjectGrade,
  gradeIndexMiniAppSubmission,
  gradeIndexWallSubmission,
  gradeIndexQuizSession,
  gradeIndexVideoSession,
  gradeIndexGuidedLearningSession,
  gradeIndexFlashcardSession,
  gradeIndexProjectRun,
  gradeIndexMiniAppSession,
  gradeIndexWallSession,
  gradeIndexQuizKey,
  gradeIndexQuizAssignment,
  gradeIndexVideoKey,
  gradeIndexGuidedLearningAssignment,
  gradeIndexProjectGroup,
  gradeIndexStudentPointer,
  gradeIndexProjection,
  gradeIndexMark,
  gradeIndexColumn,
  gradeIndexClassSettings,
  gradeIndexConfig,
  gradeIndexPlcConfig,
  gradeIndexDistrictConfig,
  gradeIndexRecompute,
} from './gradebook/gradeIndexTriggers';

// ── Slim, PII-free discovery mirror (onWrite of a PLC root keeps
// /plcIndex/{plcId} in sync) so the org "PLCs in my building" directory never
// exposes teacher emails/displayNames. Decision 1.1 hardening. ──────────────
export { mirrorPlcIndex } from './mirrorPlcIndex';

// My Groups: admin-made building groups and their auto-roster (docs/plans/MY_GROUPS.md).
export {
  createBuildingGroupV1,
  syncBuildingGroupV1,
  onUserProfileBuildingsChangedV1,
} from './plcBuildingGroups';

// PLC norming flags: anonymized answer copies for norming (docs/plans/shipped/PLC_NORMING_FLAGS.md).
export {
  setPlcNormingFlagV1,
  cleanupPlcNormingOnMembership,
  cleanupPlcNormingOnResponseDelete,
  cleanupPlcNormingOnSessionDelete,
} from './plcNorming';

// PLC meeting notes: transcript and drafted notes from a recording (docs/plans/shipped/PLC_MEETING_RECORDING.md).
export {
  requestPlcMeetingNotesV1,
  resolvePlcMeetingNotesDraftV1,
  runPlcMeetingNotesJob,
} from './plcMeetingNotes';

// PLC goal coach: checks a draft team goal against the district rubric (docs/plans/TEAMS_REDESIGN.md T22).
export { plcGoalCoachV1 } from './plcGoalCoach';

// ── One-shot PLC migration (arrays→members map, orgId inference, aggregates
// skeleton). Admin-only callable; see functions/src/migratePlcs.ts. ─────────
export { migratePlcs } from './migratePlcs';

// Dev-only: copy the caller's own prod materials into spartboard-dev.
export { syncMyMaterialsFromProdV1 } from './devSyncFromProd';
export { gradebookDemoV1 } from './devGradebookDemo';
export { recomputeAdminAnalytics } from './adminAnalyticsSnapshot';
export { expireSubShares } from './expireSubShares';
export { launchSubAssignmentV1 } from './subLaunchAssignment';
export { controlSubAssignmentV1 } from './subControlAssignment';
export { expireActivityWallShares } from './expireActivityWallShares';
export { finalizeIdleQuizAttempts } from './finalizeIdleQuizAttempts';
export {
  exchangeGoogleAuthCode,
  refreshGoogleAccessToken,
  revokeGoogleRefreshToken,
} from './googleOAuth';
export {
  syncGoogleTasksOnNoteWrite,
  syncGoogleTasksOnDocWrite,
  setGoogleTasksSyncV1,
  getGoogleTasksSyncStatusV1,
  pullGoogleTasksStatusV1,
} from './googleTasks';
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
export { ltiLinkSectionByUrlV1 } from './lti/linkSectionByUrl';
export {
  ltiToolColumnCategoriesV1,
  ltiCreateToolColumnCategoriesV1,
  ltiPushToolColumnV1,
  ltiDeleteToolColumnsV1,
} from './lti/toolColumnEndpoints';

// Claude connector (remote MCP server) — see docs/plans/CLAUDE_CONNECTOR.md.
export { mcpServer } from './mcp/mcpEndpoint';
export { mcpOAuth } from './mcp/oauthEndpoints';
export { mcpAuthorizeV1, revokeMcpGrantV1 } from './mcp/authorizeCallables';
