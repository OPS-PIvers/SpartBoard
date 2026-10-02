import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';

type Mode = 'read' | 'write' | 'outward' | 'session';

// Reviewed View as mode per callable (docs/plans/ADMIN_VIEW_AS.md D7, D14); a new onCall needs a row here.
const CALLABLE_MODES: Record<string, Mode> = {
  // Reads only: a read-only View as tab may call these.
  checkUrlCompatibility: 'read',
  fetchExternalProxy: 'read',
  fetchImportImage: 'read',
  fetchLinkPreview: 'read',
  getAssignmentPseudonymV1: 'read',
  getClassLinkRosterV1: 'read',
  getGradebookRosterV1: 'read',
  getOrgUserActivity: 'read',
  getPaperWrittenCropV1: 'read',
  getPseudonymsForAssignmentV1: 'read',
  getQuizArtifactPlaybackUrl: 'read',
  getStudentClassDirectoryV1: 'read',
  getStudentLandingV2V1: 'read',
  getTeammatePrintContextV1: 'read',
  getViewAsDriveTokenV1: 'read',
  listQuizMediaForOrgAdmin: 'read',
  ltiResolveNamesForAssignmentV1: 'read',
  ltiSuggestClassLinkMatchV1: 'read',
  resolveOrgForUser: 'read',
  // Writes: need an unlocked View as session.
  applyPaperNewerScanV1: 'write',
  checkQuizGameAnswerV1: 'write',
  checkVideoActivityAnswerV1: 'write',
  claimOrganizationInvite: 'write',
  classroomAddonLoginV1: 'write',
  commitProjectGroupsV1: 'write',
  commitRosterPinIndexV1: 'write',
  createBuildingGroupV1: 'write',
  deletePlcRecordingAudioV1: 'write',
  deleteQuizMediaForOrgAdmin: 'write',
  detachPlcSyncLinkage: 'write',
  exchangeGoogleAuthCode: 'write',
  finalizePlcRecordingV1: 'write',
  exchangeSpotifyAuthCode: 'write',
  gradebookDemoV1: 'write',
  importPaperResponsesV1: 'write',
  leaveSyncedQuizGroup: 'write',
  leaveSyncedVideoActivityGroup: 'write',
  linkClassroomCourse: 'write',
  linkLtiCourseV1: 'write',
  ltiExchange: 'write',
  migratePlcs: 'write',
  pinLoginV1: 'write',
  rebuildGlBuildingIndexV1: 'write',
  refreshGoogleAccessToken: 'write',
  refreshSpotifyAccessToken: 'write',
  releaseGuidedLearningMediaV1: 'write',
  resolveFlashcardFlagV1: 'write',
  resolvePlcMeetingNotesDraftV1: 'write',
  revokeGoogleRefreshToken: 'write',
  revokeMcpGrantV1: 'write',
  revokeSpotifyAuth: 'write',
  scoreQuizOnSubmitV1: 'write',
  setPlcNormingFlagV1: 'write',
  studentLoginV1: 'write',
  submitFlashcardCheckV1: 'write',
  syncBuildingGroupV1: 'write',
  syncMyMaterialsFromProdV1: 'write',
  unlinkClassroomCourse: 'write',
  updatePaperTranscriptV1: 'write',
  // Outward actions (assign, share, invite, AI, export): unlocked and confirmed.
  archiveActivityWallPhoto: 'outward',
  archiveQuizMediaArtifact: 'outward',
  assignToClassroomV1: 'outward',
  controlSubAssignmentV1: 'outward',
  createClassroomAttachment: 'outward',
  createOrganizationInvites: 'outward',
  createTeammatePaperBatchV1: 'outward',
  deleteOrganizationUser: 'outward',
  draftGuidedLearningStepTextV1: 'outward',
  extractQuizFromDocumentV1: 'outward',
  extractStimulusReadAloudTextV1: 'outward',
  generateGuidedLearning: 'outward',
  generateVideoActivity: 'outward',
  generateWithAI: 'outward',
  joinPlcAssignmentSyncGroup: 'outward',
  joinPlcQuizSyncGroup: 'outward',
  joinPlcVideoActivitySyncGroup: 'outward',
  joinSyncedQuizGroup: 'outward',
  joinSyncedVideoActivityGroup: 'outward',
  launchSubAssignmentV1: 'outward',
  ltiPushGradesForAssignmentV1: 'outward',
  ltiSignDeepLinkResponseV1: 'outward',
  mcpAuthorizeV1: 'outward',
  prepareQuizReadAloudV1: 'outward',
  publishPaperResultsV1: 'outward',
  pushClassroomFinalGradesForAssignment: 'outward',
  pushClassroomGradesForAssignment: 'outward',
  requestPlcMeetingNotesV1: 'outward',
  resetOrganizationUserPassword: 'outward',
  retryPaperTranscriptionV1: 'outward',
  setAssignmentTargetsV1: 'outward',
  synthesizeGuidedLearningNarrationV1: 'outward',
  synthesizeQuizAudioV1: 'outward',
  transcribePaperBlankV1: 'outward',
  transcribeVideoWithGemini: 'outward',
  translateQuizV1: 'outward',
  translateResponseV1: 'outward',
  withdrawTeammatePaperBatchV1: 'outward',
  // The session callables read the claim themselves.
  startViewAsSessionV1: 'session',
  startViewAsStudentV1: 'session',
  updateViewAsSessionV1: 'session',
  // Refuses every View as token itself; the guard ends a stale one first.
  revertViewAsChangeV1: 'write',
};

const SRC = __dirname;
const EXPORT_RE = /export const (\w+)\s*(?::[^=]+)?=\s*onCall\b/g;
const ONCALL_RE = /\bonCall\s*(?:<[^>]*>)?\s*\(/g;
const GUARD_RE = /assertViewAsAllowed\(\s*\w+\s*(?:,\s*(\{[^}]*\}))?\s*\)/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function modeOf(options: string | undefined): Mode | 'unknown' {
  const opts = (options ?? '').replace(/\s/g, '');
  if (opts === '') return 'write';
  if (opts === '{read:true}') return 'read';
  if (opts === '{outward:true}') return 'outward';
  return 'unknown';
}

interface Found {
  file: string;
  mode: Mode | 'missing' | 'unknown' | 'repeated';
}

function scan(): { callables: Map<string, Found>; strays: string[] } {
  const callables = new Map<string, Found>();
  const strays: string[] = [];
  for (const path of sourceFiles(SRC)) {
    const file = relative(SRC, path);
    const source = stripComments(readFileSync(path, 'utf8'));
    const exports = [...source.matchAll(EXPORT_RE)];
    const total = [...source.matchAll(ONCALL_RE)].length;
    if (total !== exports.length) strays.push(file);
    exports.forEach((match) => {
      const start = match.index ?? 0;
      const next = source.indexOf('\nexport ', start + match[0].length);
      const segment = source.slice(start, next < 0 ? undefined : next);
      const guards = [...segment.matchAll(GUARD_RE)];
      const mode =
        CALLABLE_MODES[match[1]] === 'session'
          ? 'session'
          : guards.length === 0
            ? 'missing'
            : guards.length > 1
              ? 'repeated'
              : modeOf(guards[0][1]);
      callables.set(match[1], { file, mode });
    });
  }
  return { callables, strays };
}

describe('View as callable guard coverage', () => {
  const { callables, strays } = scan();

  it('finds every onCall as an exported callable', () => {
    expect(strays).toEqual([]);
    expect(callables.size).toBeGreaterThan(80);
  });

  it('guards every callable with its reviewed mode', () => {
    const wrong = [...callables]
      .filter(([name, found]) => found.mode !== CALLABLE_MODES[name])
      .map(
        ([name, found]) =>
          `${found.file} ${name}: source ${found.mode}, expected ${CALLABLE_MODES[name] ?? 'no row'}`
      );
    expect(wrong).toEqual([]);
  });

  it('has no rows for callables that no longer exist', () => {
    expect(
      Object.keys(CALLABLE_MODES).filter((n) => !callables.has(n))
    ).toEqual([]);
  });
});
