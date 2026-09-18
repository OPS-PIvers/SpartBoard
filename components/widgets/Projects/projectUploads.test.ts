import { describe, expect, it } from 'vitest';
import type { ProjectUpload } from '@/types';
import {
  PROJECT_UPLOAD_MAX_BYTES,
  isAllowedProjectUploadType,
  projectUploadStoragePath,
  sortUploads,
  uploadArchiveLabel,
  validateProjectUpload,
} from './projectUploads';

const fileOf = (type: string, size: number): File => {
  const file = new File(['x'], 'work.bin', { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

const upload = (overrides: Partial<ProjectUpload> = {}): ProjectUpload => ({
  id: 'u1',
  fileName: 'poster.pdf',
  contentType: 'application/pdf',
  sizeBytes: 10,
  uploadedByUid: 'student-1',
  uploadedAt: 1,
  archiveStatus: 'firebase',
  ...overrides,
});

describe('isAllowedProjectUploadType', () => {
  it('accepts the families a project produces', () => {
    expect(isAllowedProjectUploadType('image/png')).toBe(true);
    expect(isAllowedProjectUploadType('audio/mpeg')).toBe(true);
    expect(isAllowedProjectUploadType('video/mp4')).toBe(true);
    expect(isAllowedProjectUploadType('application/pdf')).toBe(true);
    expect(
      isAllowedProjectUploadType(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
    ).toBe(true);
  });

  it('is case-insensitive, as browsers are not consistent here', () => {
    expect(isAllowedProjectUploadType('IMAGE/PNG')).toBe(true);
    expect(isAllowedProjectUploadType('Application/PDF')).toBe(true);
  });

  it('refuses archives, executables and an empty type', () => {
    expect(isAllowedProjectUploadType('application/zip')).toBe(false);
    expect(isAllowedProjectUploadType('application/x-msdownload')).toBe(false);
    expect(isAllowedProjectUploadType('')).toBe(false);
  });
});

describe('validateProjectUpload', () => {
  it('passes a normal file', () => {
    expect(validateProjectUpload(fileOf('application/pdf', 1024))).toBeNull();
  });

  it('rejects the wrong kind before the size', () => {
    expect(validateProjectUpload(fileOf('application/zip', 10))).toMatch(
      /image, audio, video/
    );
  });

  it('rejects a file at or over the ceiling the rules enforce', () => {
    expect(
      validateProjectUpload(fileOf('application/pdf', PROJECT_UPLOAD_MAX_BYTES))
    ).toMatch(/25 MB/);
    expect(
      validateProjectUpload(
        fileOf('application/pdf', PROJECT_UPLOAD_MAX_BYTES - 1)
      )
    ).toBeNull();
  });
});

describe('projectUploadStoragePath', () => {
  it('is the exact shape storage.rules and the upload doc agree on', () => {
    expect(projectUploadStoragePath('uid_p1', 'g1', 'u1', 'poster.pdf')).toBe(
      'project_uploads/uid_p1/g1/u1/poster.pdf'
    );
  });
});

describe('uploadArchiveLabel', () => {
  it('reports where the file actually is, not where it is headed', () => {
    expect(uploadArchiveLabel(upload({ archiveStatus: 'firebase' }))).toBe(
      'Uploaded'
    );
    expect(uploadArchiveLabel(upload({ archiveStatus: 'syncing' }))).toBe(
      'Saving to Drive…'
    );
    expect(uploadArchiveLabel(upload({ archiveStatus: 'archived' }))).toBe(
      'Saved to Drive'
    );
    expect(uploadArchiveLabel(upload({ archiveStatus: 'failed' }))).toMatch(
      /retrying/
    );
    expect(uploadArchiveLabel(upload({ archiveStatus: 'lost' }))).toMatch(
      /gave up/
    );
  });
});

describe('sortUploads', () => {
  it('puts the newest first without mutating the input', () => {
    const input = [
      upload({ id: 'old', uploadedAt: 1 }),
      upload({ id: 'new', uploadedAt: 3 }),
      upload({ id: 'mid', uploadedAt: 2 }),
    ];
    expect(sortUploads(input).map((u) => u.id)).toEqual(['new', 'mid', 'old']);
    expect(input.map((u) => u.id)).toEqual(['old', 'new', 'mid']);
  });
});
