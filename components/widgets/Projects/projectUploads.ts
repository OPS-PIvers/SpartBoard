import type { ProjectUpload } from '@/types';

/** Matches the 25 MB ceiling in `storage.rules` for `project_uploads/`. */
export const PROJECT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

/** A family allowlist, not Activity Wall's three kinds. Mirrors `pjAllowedType()` in storage.rules. */
const ALLOWED_PREFIXES = ['image/', 'audio/', 'video/'] as const;
const ALLOWED_EXACT = [
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export const PROJECT_UPLOAD_ACCEPT = [
  'image/*',
  'audio/*',
  'video/*',
  '.txt',
  '.pdf',
  '.docx',
  '.pptx',
  '.xlsx',
].join(',');

export const isAllowedProjectUploadType = (contentType: string): boolean => {
  const type = contentType.toLowerCase();
  return (
    ALLOWED_PREFIXES.some((prefix) => type.startsWith(prefix)) ||
    ALLOWED_EXACT.includes(type as (typeof ALLOWED_EXACT)[number])
  );
};

/** Returns a message when the file fails the client-side gate, else null. */
export function validateProjectUpload(file: File): string | null {
  if (!isAllowedProjectUploadType(file.type)) {
    return 'Choose an image, audio, video, PDF, text or Office file.';
  }
  if (file.size >= PROJECT_UPLOAD_MAX_BYTES) {
    return `Files must be smaller than ${Math.round(
      PROJECT_UPLOAD_MAX_BYTES / (1024 * 1024)
    )} MB.`;
  }
  return null;
}

/** The one path shape `storage.rules` and the upload doc's `storagePath` agree on. */
export const projectUploadStoragePath = (
  runId: string,
  groupId: string,
  uploadId: string,
  fileName: string
): string => `project_uploads/${runId}/${groupId}/${uploadId}/${fileName}`;

/** D20 — report where the file actually is, not where it is headed. */
export const uploadArchiveLabel = (upload: ProjectUpload): string => {
  switch (upload.archiveStatus) {
    case 'archived':
      return 'Saved to Drive';
    case 'syncing':
      return 'Saving to Drive…';
    case 'failed':
      return 'Drive save failed, retrying';
    case 'lost':
      return 'Drive save gave up';
    default:
      return 'Uploaded';
  }
};

/** Newest first — a group adds to the top of its own pile. */
export const sortUploads = (uploads: ProjectUpload[]): ProjectUpload[] =>
  [...uploads].sort((a, b) => b.uploadedAt - a.uploadedAt);
