import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Fails when new code writes to Firebase Storage; teacher uploads belong in the teacher's Google Drive.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FIX = [
  "Teacher-uploaded files (images, PDFs, notebooks, any material) go in the teacher's Google Drive, never Firebase Storage or a Firestore blob: Drive is free and unlimited, Storage is billed.",
  "Upload with GoogleDriveService.uploadFile(blob, name, 'Assets/<Kind>') then makePublic(), and save https://lh3.googleusercontent.com/d/<id> (see useStorage().uploadHotspotImage); add the folder to DRIVE_UPLOAD_FOLDERS in hooks/useStorage.ts.",
  'Storage is only for student work, admin/district assets and files a Cloud Function processes. If this is one of those, add it to the allowlist in tests/storageUploads.static.test.ts with its reason and name it in the PR so Paul can OK it.',
].join('\n');

// Firebase Storage client SDK writes, per file.
const CLIENT_SDK_WRITES: Record<string, number> = {
  // Student Activity Wall photos and media.
  'components/activityWall/submission/submitPost.ts': 1,
  // Admin music thumbnails.
  'components/admin/MusicManager.tsx': 1,
  // Admin web tour pictures.
  'components/tours/webTours.ts': 1,
  // Paper answer sheet crops, read by the transcription function.
  'components/widgets/QuizWidget/Widget.tsx': 1,
  // Admin district library.
  'hooks/useDistrictLibraryAdmin.ts': 1,
  // Student project uploads.
  'hooks/useProjectUploads.ts': 1,
  // Raw helpers uploadFile and uploadFileWithProgress, uploadScreenshot's no-Drive fallback, admin weather images.
  'hooks/useStorage.ts': 4,
  // Group meeting audio, transcribed by a function.
  'utils/meetingRecording/backend.ts': 1,
  // Student quiz response media.
  'utils/quizMediaUpload.ts': 1,
};

// Calls to useStorage's raw Storage helpers (uploadFile, uploadFileWithProgress, uploadGuidedLearningMedia), per file.
const STORAGE_HELPER_CALLS: Record<string, number> = {
  // Guided Learning video and audio (lh3 Drive links can't stream) and district set images.
  'components/widgets/GuidedLearning/Widget.tsx': 1,
  'components/widgets/GuidedLearning/components/GuidedLearningStepEditor.tsx': 1,
  'components/widgets/GuidedLearning/components/studio/StudioStepFields.tsx': 1,
  'components/widgets/GuidedLearning/components/useGuidedLearningEditorState.ts': 2,
  // Smart Notebook pages and assets (teacher content still on Storage; listed for Paul).
  'components/widgets/SmartNotebook/Widget.tsx': 2,
  'hooks/useNotebookSharing.ts': 1,
  'utils/notebookUpload.ts': 1,
  // No-Drive fallbacks, admin assets and GL media inside the hook itself.
  'hooks/useStorage.ts': 14,
};

// Admin SDK writes (.save, .upload, createWriteStream) in server files that touch a bucket, per file.
const SERVER_WRITES: Record<string, number> = {
  // Guided Learning sets made through the Claude connector (teacher content still on Storage; listed for Paul).
  'functions/src/mcp/glCreate.ts': 1,
  // Admin live tour pictures.
  'functions/src/mcp/tourPictures.ts': 1,
  // Group meeting audio (one is an ffmpeg .save to a temp file).
  'functions/src/plcMeetingNotes.ts': 2,
  'functions/src/plcNorming.ts': 2,
  'functions/src/plcRecordingCore.ts': 1,
  // ffmpeg .save to a temp file.
  'functions/src/quizMediaArchive.ts': 1,
  // Read-aloud speech cache.
  'functions/src/quizReadAloud.ts': 1,
  // Schoology import pictures, held briefly for the review screen.
  'functions/src/schoologyQuizImport.ts': 1,
  // On-device pronunciation model.
  'scripts/upload-pronunciation-model.mjs': 2,
};

// storage.rules paths a client may write.
const WRITABLE_RULE_PATHS = [
  // Teacher uploads kept only as the no-Drive fallback, plus GL media and notebooks (listed for Paul).
  '/users/{userId}/backgrounds/{allPaths=**}',
  '/users/{userId}/screenshots/{allPaths=**}',
  '/users/{userId}/stickers/{allPaths=**}',
  '/users/{userId}/display_images/{allPaths=**}',
  '/users/{userId}/hotspot_images/{allPaths=**}',
  '/users/{userId}/instructional/{allPaths=**}',
  '/users/{userId}/notebooks/{allPaths=**}',
  '/users/{userId}/pdfs/{allPaths=**}',
  // Admin and district assets.
  '/admin_backgrounds/{backgroundId}/{fileName}',
  '/admin_weather/{allPaths=**}',
  '/admin_stickers/{fileName}',
  '/admin_work_symbols/{fileName}',
  '/admin_catalyst_icons/{allPaths=**}',
  '/catalyst/images/{allPaths=**}',
  '/admin_music_thumbnails/{allPaths=**}',
  '/admin_logos/{fileName}',
  '/district_library/{itemId}/{allPaths=**}',
  '/global_pdfs/{fileName}',
  '/web_tour_pictures/{setId}/{fileName}',
  // Student work and files a function processes.
  '/activity_wall_photos/{sessionId}/{fileName}',
  '/activity_wall_media/{sessionId}/{submissionId}/{fileName}',
  '/quiz_response_media/{sessionId}/{responseKey}/{fileName}',
  '/paper_written_crops/{uid}/{scanId}/{seat}/{fileName}',
  '/paper_pages/{uid}/{scanId}/{seat}/{fileName}',
  '/plc_meeting_audio/{plcId}/{recordingId}/{partIndex}/{fileName}',
  '/project_uploads/{runId}/{groupId}/{uploadId}/{fileName}',
].sort();

const CLIENT_SDK_WRITE =
  /\b(?:uploadBytes|uploadBytesResumable|uploadString)\(/g;
const STORAGE_HELPER_CALL =
  /(?<![Dd]rive\w*\??\.|async\s)\b(?:uploadFile|uploadFileWithProgress|uploadGuidedLearningMedia)\(/g;
const SERVER_WRITE = /\.save\(|\.upload\(|createWriteStream\(/g;

// Tracked and new untracked source files, so a fresh draft is caught before its first commit.
const sourceFiles = (pathspecs: string[]): string[] =>
  execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      ...pathspecs,
      ':!*.test.*',
      ':!tests/',
      ':!**/node_modules/**',
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  )
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.startsWith('functions/lib/'));

const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

const countPerFile = (
  files: string[],
  pattern: RegExp,
  only: (text: string) => boolean = () => true
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const file of files) {
    let text: string;
    try {
      text = read(file);
    } catch {
      continue;
    }
    if (!only(text)) continue;
    const n = text.match(pattern)?.length ?? 0;
    if (n > 0) counts[file] = n;
  }
  return Object.fromEntries(Object.entries(counts).sort());
};

const sorted = (counts: Record<string, number>) =>
  Object.fromEntries(Object.entries(counts).sort());

const CODE = ['*.ts', '*.tsx', '*.js', '*.mjs', '*.cjs'];

const writableRulePaths = (rules: string): string[] => {
  const text = rules.replace(/\/\/[^\n]*/g, '');
  const token = /match\s+(\S+)\s*\{|\{|\}|allow\s+([\w\s,]+):\s*if\s+([^;]*);/g;
  const stack: (string | null)[] = [];
  const paths = new Set<string>();
  for (const m of text.matchAll(token)) {
    if (m[1]) stack.push(m[1]);
    else if (m[0] === '{') stack.push(null);
    else if (m[0] === '}') stack.pop();
    else if (
      /\b(write|create|update)\b/.test(m[2]) &&
      m[3].trim() !== 'false'
    ) {
      const path = [...stack].reverse().find((p) => p !== null);
      if (path) paths.add(path);
    }
  }
  return [...paths].sort();
};

describe('Firebase Storage upload guard', () => {
  it('writes to Storage with the client SDK only where allowed', () => {
    expect(
      countPerFile(sourceFiles(CODE), CLIENT_SDK_WRITE),
      `New uploadBytes/uploadBytesResumable/uploadString call.\n${FIX}`
    ).toEqual(sorted(CLIENT_SDK_WRITES));
  });

  it("calls useStorage's raw Storage helpers only where allowed", () => {
    expect(
      countPerFile(
        sourceFiles(['*.ts', '*.tsx']).filter(
          (f) => !f.startsWith('functions/')
        ),
        STORAGE_HELPER_CALL
      ),
      `New uploadFile/uploadFileWithProgress/uploadGuidedLearningMedia call (they write Firebase Storage).\n${FIX}`
    ).toEqual(sorted(STORAGE_HELPER_CALLS));
  });

  it('writes to Storage from functions and scripts only where allowed', () => {
    expect(
      countPerFile(
        sourceFiles(['functions/src/', 'scripts/']).filter((f) =>
          CODE.some((ext) => f.endsWith(ext.slice(1)))
        ),
        SERVER_WRITE,
        (text) => /\bbucket\b/.test(text)
      ),
      `New Admin SDK Storage write (.save/.upload/createWriteStream next to a bucket).\n${FIX}`
    ).toEqual(sorted(SERVER_WRITES));
  });

  it('lets clients write only the allowed storage.rules paths', () => {
    expect(
      writableRulePaths(read('storage.rules')),
      `New writable path in storage.rules.\n${FIX}`
    ).toEqual(WRITABLE_RULE_PATHS);
  });

  it('finds every kind of write in the parser self-check', () => {
    expect(
      writableRulePaths(`match /b/{bucket}/o {
        // match /commented/{x} { allow write: if true; }
        match /a/{x} { function f() { return true; } allow create, update: if f(); }
        match /b/{x} { allow write: if false; }
        match /c/{x} { allow read: if true; }
      }`)
    ).toEqual(['/a/{x}']);
    expect('uploadBytes(ref(s, p), b)'.match(CLIENT_SDK_WRITE)).toHaveLength(1);
    expect(
      'driveService.uploadFile(b); drive?.uploadFile(b); async uploadFile(b) {}'.match(
        STORAGE_HELPER_CALL
      )
    ).toBeNull();
    expect(
      'storage.uploadFile(p, f); await uploadFile(p, f)'.match(
        STORAGE_HELPER_CALL
      )
    ).toHaveLength(2);
  });
});
