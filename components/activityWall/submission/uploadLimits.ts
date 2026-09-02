import type { ActivityWallSubmissionType } from '@/types';

export const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const FILE_MAX_BYTES = 25 * 1024 * 1024;

/** Document MIME types accepted by the `file` submission type (Storage rules). */
export const FILE_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export const ACCEPT_BY_TYPE: Record<'photo' | 'video' | 'file', string> = {
  photo: 'image/*',
  video: 'video/*',
  file: FILE_MIME_TYPES.join(','),
};

const formatMb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

/** Types that read a File from the device. */
export const isUploadType = (
  type: ActivityWallSubmissionType
): type is 'photo' | 'video' | 'file' =>
  type === 'photo' || type === 'video' || type === 'file';

/** Returns an error message when the file fails the client-side gate. */
export function validateUpload(
  type: ActivityWallSubmissionType,
  file: File
): string | null {
  if (type === 'photo') {
    if (!file.type.startsWith('image/')) return 'Please choose an image file.';
    if (file.size > IMAGE_MAX_BYTES)
      return `Images must be smaller than ${formatMb(IMAGE_MAX_BYTES)}.`;
    return null;
  }
  if (type === 'video') {
    if (!file.type.startsWith('video/')) return 'Please choose a video file.';
    if (file.size > VIDEO_MAX_BYTES)
      return `Videos must be smaller than ${formatMb(VIDEO_MAX_BYTES)}.`;
    return null;
  }
  if (type === 'file') {
    if (!(FILE_MIME_TYPES as readonly string[]).includes(file.type))
      return 'Please choose a PDF, Word, PowerPoint, or Excel file.';
    if (file.size > FILE_MAX_BYTES)
      return `Files must be smaller than ${formatMb(FILE_MAX_BYTES)}.`;
    return null;
  }
  return null;
}

/** Strips path separators and unsafe characters from an uploaded file name. */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[/\\]/g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^_+/, '');
  return cleaned.slice(0, 120) || 'upload';
}
