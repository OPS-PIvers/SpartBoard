import { describe, expect, it } from 'vitest';
import {
  ACCEPT_BY_TYPE,
  IMAGE_MAX_BYTES,
  safeFileName,
  validateUpload,
} from './uploadLimits';

const fileOf = (type: string, size = 10) => {
  const file = new File(['x'], 'sample', { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

describe('validateUpload', () => {
  it('accepts every image MIME type the Storage rules allow', () => {
    for (const type of [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/heic',
    ]) {
      expect(validateUpload('photo', fileOf(type))).toBeNull();
    }
  });

  it('rejects images outside the allowlist and names the accepted formats', () => {
    expect(validateUpload('photo', fileOf('image/bmp'))).toBe(
      'Please choose a JPEG, PNG, GIF, WebP, or HEIC image.'
    );
  });

  it('accepts only mp4, webm and quicktime video', () => {
    expect(validateUpload('video', fileOf('video/mp4'))).toBeNull();
    expect(validateUpload('video', fileOf('video/webm'))).toBeNull();
    expect(validateUpload('video', fileOf('video/quicktime'))).toBeNull();
    expect(validateUpload('video', fileOf('video/x-msvideo'))).toBe(
      'Please choose an MP4, WebM, or MOV (QuickTime) video.'
    );
  });

  it('accepts pdf and the Office XML document types', () => {
    expect(validateUpload('file', fileOf('application/pdf'))).toBeNull();
    expect(
      validateUpload(
        'file',
        fileOf(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
      )
    ).toBeNull();
    expect(validateUpload('file', fileOf('application/msword'))).toContain(
      'PDF'
    );
  });

  it('enforces the size caps', () => {
    expect(
      validateUpload('photo', fileOf('image/png', IMAGE_MAX_BYTES + 1))
    ).toBe('Images must be smaller than 15 MB.');
  });

  it('advertises the same allowlists through the file input accept attribute', () => {
    expect(ACCEPT_BY_TYPE.photo).toContain('image/heic');
    expect(ACCEPT_BY_TYPE.video).toBe('video/mp4,video/webm,video/quicktime');
  });
});

describe('safeFileName', () => {
  it('strips separators and unsafe characters', () => {
    expect(safeFileName('a/b\\c my file.png')).toBe('a_b_c_my_file.png');
  });
});
