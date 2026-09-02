import type { ActivityWallSubmissionType } from '@/types';

export const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const FILE_MAX_BYTES = 25 * 1024 * 1024;

/** Image MIME types accepted by the `photo` submission type (Storage rules). */
export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
] as const;

/** Video MIME types accepted by the `video` submission type (Storage rules). */
export const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const;

/** Document MIME types accepted by the `file` submission type (Storage rules). */
export const FILE_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export const ACCEPT_BY_TYPE: Record<'photo' | 'video' | 'file', string> = {
  photo: IMAGE_MIME_TYPES.join(','),
  video: VIDEO_MIME_TYPES.join(','),
  file: FILE_MIME_TYPES.join(','),
};

const formatMb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

const allows = (list: readonly string[], mimeType: string) =>
  list.includes(mimeType.toLowerCase());

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
    if (!allows(IMAGE_MIME_TYPES, file.type))
      return 'Please choose a JPEG, PNG, GIF, WebP, or HEIC image.';
    if (file.size > IMAGE_MAX_BYTES)
      return `Images must be smaller than ${formatMb(IMAGE_MAX_BYTES)}.`;
    return null;
  }
  if (type === 'video') {
    if (!allows(VIDEO_MIME_TYPES, file.type))
      return 'Please choose an MP4, WebM, or MOV (QuickTime) video.';
    if (file.size > VIDEO_MAX_BYTES)
      return `Videos must be smaller than ${formatMb(VIDEO_MAX_BYTES)}.`;
    return null;
  }
  if (type === 'file') {
    if (!allows(FILE_MIME_TYPES, file.type))
      return 'Please choose a PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx) file.';
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
