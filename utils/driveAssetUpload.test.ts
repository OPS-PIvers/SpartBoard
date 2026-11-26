import { describe, expect, it, vi } from 'vitest';
import { copyDriveAsset, uploadDriveAsset } from './driveAssetUpload';

const drive = () => ({
  uploadFile: vi.fn(() =>
    Promise.resolve({ id: 'f1', name: 'a', mimeType: 'image/png' })
  ),
  copyFile: vi.fn(() =>
    Promise.resolve({ id: 'c1', name: 'x', mimeType: 'image/png' })
  ),
  makePublic: vi.fn(() => Promise.resolve()),
  deleteFile: vi.fn(() => Promise.resolve()),
});

const blob = new Blob(['x']);

describe('uploadDriveAsset', () => {
  it('shares with anyone when students must open it', async () => {
    const d = drive();
    await uploadDriveAsset(d, {
      blob,
      name: 'a.png',
      folder: 'Assets/X',
      audience: 'anyone',
    });
    expect(d.uploadFile).toHaveBeenCalledWith(blob, 'a.png', 'Assets/X');
    expect(d.makePublic).toHaveBeenCalledWith('f1', undefined);
  });

  it("shares with the teacher's domain", async () => {
    const d = drive();
    await uploadDriveAsset(d, {
      blob,
      name: 'a',
      folder: 'F',
      audience: 'domain',
      domain: 'school.org',
    });
    expect(d.makePublic).toHaveBeenCalledWith('f1', 'school.org');
  });

  it('leaves a private file unshared', async () => {
    const d = drive();
    await uploadDriveAsset(d, {
      blob,
      name: 'a',
      folder: 'F',
      audience: 'private',
    });
    expect(d.makePublic).not.toHaveBeenCalled();
  });

  it('passes app properties and a fixed time through', async () => {
    const d = drive();
    await uploadDriveAsset(d, {
      blob,
      name: 'a',
      folder: 'F',
      appProperties: { k: 'v' },
      fixedTime: '2026-01-01T00:00:00Z',
      audience: 'private',
    });
    expect(d.uploadFile).toHaveBeenCalledWith(
      blob,
      'a',
      'F',
      { k: 'v' },
      { fixedTime: '2026-01-01T00:00:00Z' }
    );
  });

  it('removes the file when sharing fails', async () => {
    const d = drive();
    d.makePublic.mockRejectedValueOnce(new Error('nope'));
    await expect(
      uploadDriveAsset(d, { blob, name: 'a', folder: 'F', audience: 'anyone' })
    ).rejects.toThrow('nope');
    expect(d.deleteFile).toHaveBeenCalledWith('f1');
  });
});

describe('copyDriveAsset', () => {
  it('shares the copy and removes it when sharing fails', async () => {
    const d = drive();
    d.makePublic.mockRejectedValueOnce(new Error('nope'));
    await expect(
      copyDriveAsset(d, {
        fileId: 'orig',
        name: 'n',
        folder: 'F',
        audience: 'anyone',
      })
    ).rejects.toThrow('nope');
    expect(d.copyFile).toHaveBeenCalledWith('orig', 'n', 'F');
    expect(d.deleteFile).toHaveBeenCalledWith('c1');
  });
});
